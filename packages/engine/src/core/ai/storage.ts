/**
 * ReCheckers AI - Experience Book persistence adapters.
 *
 * Three implementations of the same port, one per place the book can live:
 *
 *   memory        tests and the server's default; forgets on restart
 *   localStorage  synchronous, ~5MB, available in every browser and in the
 *                 React Native web build
 *   IndexedDB     asynchronous and far larger, for a book that has outgrown
 *                 localStorage's quota
 *
 * `createDefaultExperienceStorage()` picks the best one the current runtime
 * actually offers, so a caller does not have to feature-detect. None of them
 * ever throws at the caller: a browser in private mode, a blocked origin or a
 * full quota all degrade to "the bot does not remember", never to "the bot
 * cannot play".
 *
 * The browser APIs are described by the minimal structural interfaces below
 * rather than by `lib.dom`. This package compiles with `lib: ["ES2022"]` on
 * purpose - the rulebook has to run under Node, Metro and a Worker alike - and
 * pulling DOM typings in for two adapters would quietly license the rest of the
 * engine to reach for `window`.
 */

import type { ExperienceSnapshot, ExperienceStorage } from './types.ts';

export const EXPERIENCE_STORAGE_KEY = 're-checkers.ai.experience.v1';

/** Non-persistent book. Used by the engine service and by tests. */
export class MemoryExperienceStorage implements ExperienceStorage {
  private snapshot: ExperienceSnapshot | null = null;

  public async load(): Promise<ExperienceSnapshot | null> {
    return this.snapshot;
  }

  public async save(snapshot: ExperienceSnapshot): Promise<void> {
    this.snapshot = snapshot;
  }

  public async clear(): Promise<void> {
    this.snapshot = null;
  }
}

/** The three `Storage` methods this adapter uses, and nothing else. */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class WebStorageExperienceStorage implements ExperienceStorage {
  constructor(
    private readonly storage: WebStorageLike,
    private readonly key: string = EXPERIENCE_STORAGE_KEY
  ) {}

  public async load(): Promise<ExperienceSnapshot | null> {
    const raw = this.storage.getItem(this.key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ExperienceSnapshot;
    } catch {
      // Half-written or hand-edited: drop it rather than fail every load from
      // here on.
      this.storage.removeItem(this.key);
      return null;
    }
  }

  public async save(snapshot: ExperienceSnapshot): Promise<void> {
    this.storage.setItem(this.key, JSON.stringify(snapshot));
  }

  public async clear(): Promise<void> {
    this.storage.removeItem(this.key);
  }
}

// --- Minimal IndexedDB surface --------------------------------------------

interface IdbRequestLike<T> {
  result: T;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
  onblocked?: (() => void) | null;
}

interface IdbObjectStoreLike {
  get(key: string): IdbRequestLike<unknown>;
  put(value: unknown, key: string): IdbRequestLike<unknown>;
  delete(key: string): IdbRequestLike<unknown>;
}

interface IdbDatabaseLike {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): unknown;
  transaction(name: string, mode: 'readonly' | 'readwrite'): {
    objectStore(name: string): IdbObjectStoreLike;
  };
  close(): void;
}

export interface IdbFactoryLike {
  open(name: string, version?: number): IdbRequestLike<IdbDatabaseLike>;
}

const IDB_DB_NAME = 're-checkers-ai';
const IDB_STORE_NAME = 'experience';

export class IndexedDbExperienceStorage implements ExperienceStorage {
  constructor(
    private readonly factory: IdbFactoryLike,
    private readonly key: string = EXPERIENCE_STORAGE_KEY
  ) {}

  private open(): Promise<IdbDatabaseLike> {
    return new Promise((resolve, reject) => {
      const request = this.factory.open(IDB_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB open blocked.'));
    });
  }

  private async transact<T>(
    mode: 'readonly' | 'readwrite',
    run: (store: IdbObjectStoreLike) => IdbRequestLike<unknown>
  ): Promise<T> {
    const db = await this.open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(IDB_STORE_NAME, mode).objectStore(IDB_STORE_NAME));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  public async load(): Promise<ExperienceSnapshot | null> {
    const value = await this.transact<ExperienceSnapshot | undefined>('readonly', (store) =>
      store.get(this.key)
    );
    return value ?? null;
  }

  public async save(snapshot: ExperienceSnapshot): Promise<void> {
    await this.transact('readwrite', (store) => store.put(snapshot, this.key));
  }

  public async clear(): Promise<void> {
    await this.transact('readwrite', (store) => store.delete(this.key));
  }
}

/**
 * The best book storage this runtime can offer.
 *
 * IndexedDB is preferred where it exists because the book grows with every game
 * and localStorage's few megabytes are shared with everything else on the
 * origin. `localStorage` access is probed inside a try/catch because merely
 * *reading* the property throws in a browser with site data blocked.
 */
export function createDefaultExperienceStorage(): ExperienceStorage {
  // Through `unknown`: where lib.dom *is* loaded these globals already have
  // their full DOM types, and the structural interfaces above are deliberately
  // narrower than them.
  const globalAny = globalThis as unknown as {
    indexedDB?: IdbFactoryLike;
    localStorage?: WebStorageLike;
  };

  try {
    if (globalAny.indexedDB) {
      return new IndexedDbExperienceStorage(globalAny.indexedDB);
    }
  } catch {
    // Fall through to the next option.
  }

  try {
    const storage = globalAny.localStorage;
    if (storage) {
      // A real round trip: Safari's private mode exposes the object and then
      // throws on the first write.
      const probe = `${EXPERIENCE_STORAGE_KEY}.probe`;
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return new WebStorageExperienceStorage(storage);
    }
  } catch {
    // Fall through.
  }

  return new MemoryExperienceStorage();
}
