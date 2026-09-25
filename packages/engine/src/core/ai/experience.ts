/**
 * ReCheckers AI - The Experience Book.
 *
 * The bot's long-term memory: for every position it has ever seen played out,
 * how each move from that position went. After a game ends, the whole line is
 * replayed and every state-action pair along it is credited (+1 for the side
 * that won, -1 for the side that lost, 0 on a draw). Those totals come back as
 * PUCT priors on the next search, which is what makes a trap that beat the bot
 * on Monday less attractive to it on Tuesday.
 *
 * Both sides of a game are recorded, not just the bot's. An opening that a
 * human keeps winning with is exactly the line the bot most needs a prior for,
 * and it will only ever see it from the losing side unless the winner's moves
 * are learned too.
 *
 * Persistence is a port (`ExperienceStorage`) rather than a hard dependency, so
 * the same book lives in `localStorage` on the web, IndexedDB where a larger
 * quota is wanted, and a database behind the hosted service.
 */

import type { GameState, MoveAction, PlayerColor } from '../types.ts';
import { ReCheckersEngine } from '../engine.ts';
import { hashState } from './zobrist.ts';
import { moveKey } from './simulation.ts';
import { createDefaultExperienceStorage } from './storage.ts';
import type {
  BotMove,
  ExperienceEntry,
  ExperienceSnapshot,
  ExperienceStorage,
  MoveHistoryItem,
} from './types.ts';

/**
 * How hard a single recorded game may push a prior. A move that won its only
 * game gets a strong nudge, but never a certainty: the book is a bias on the
 * search, not a replacement for it.
 */
const PRIOR_STRENGTH = 0.85;

/** Positions retained before the least-used ones are dropped. */
const DEFAULT_MAX_POSITIONS = 20_000;

export interface ExperienceBookOptions {
  /**
   * Where the book is kept. Defaults to the best store this runtime offers:
   * IndexedDB or localStorage in a browser, in-memory under Node. Pass `null`
   * for a book that deliberately never leaves the process.
   */
  storage?: ExperienceStorage | null;
  maxPositions?: number;
  /** Engine used to replay finished games. Defaults to a fresh one. */
  engine?: ReCheckersEngine;
}

export class ExperienceBook {
  private entries = new Map<string, Map<string, ExperienceEntry>>();
  private readonly storage: ExperienceStorage | null;
  private readonly maxPositions: number;
  private readonly engine: ReCheckersEngine;
  private games = 0;
  private loaded: Promise<void> | null = null;
  /** Coalesces bursts of writes into one save. */
  private pendingSave: Promise<void> | null = null;

  constructor(options: ExperienceBookOptions = {}) {
    this.storage =
      options.storage === undefined ? createDefaultExperienceStorage() : options.storage;
    this.maxPositions = options.maxPositions ?? DEFAULT_MAX_POSITIONS;
    this.engine = options.engine ?? new ReCheckersEngine();
  }

  /** Idempotent: many searches may race to be the first to need the book. */
  public async ready(): Promise<void> {
    if (!this.storage) return;
    if (!this.loaded) {
      this.loaded = this.storage
        .load()
        .then((snapshot) => {
          if (snapshot) this.hydrate(snapshot);
        })
        .catch(() => {
          // A corrupt or unreadable book must never stop the bot from playing;
          // it simply starts over with no memory.
        });
    }
    return this.loaded;
  }

  public get positionCount(): number {
    return this.entries.size;
  }

  public get gamesRecorded(): number {
    return this.games;
  }

  public getEntry(stateHash: string, key: string): ExperienceEntry | null {
    return this.entries.get(stateHash)?.get(key) ?? null;
  }

  /**
   * Prior probabilities P(s, a) over `moves`, summing to 1.
   *
   * With nothing recorded for the position the distribution is uniform, which
   * is precisely the "1 / |moves|" fallback PUCT expects. Where the book does
   * have something to say, each move's average outcome (in -1..1) is turned
   * into a positive weight, so a move that has been losing is damped rather
   * than forbidden - the search can still refute the book if the position in
   * front of it disagrees.
   */
  public getPriors(stateHash: string, moves: BotMove[], weight = 1): number[] {
    const uniform = moves.length > 0 ? 1 / moves.length : 0;
    const position = this.entries.get(stateHash);
    if (!position || weight <= 0 || moves.length === 0) {
      return moves.map(() => uniform);
    }

    const weights = moves.map((move) => {
      const entry = position.get(moveKey(move));
      if (!entry || entry.n === 0) return 1;
      const average = entry.w / entry.n; // -1..1
      // Confidence grows with sample size, so one fluke game cannot dominate a
      // move that has been played twenty times.
      const confidence = entry.n / (entry.n + 3);
      return Math.max(0.05, 1 + PRIOR_STRENGTH * average * confidence);
    });

    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total <= 0) return moves.map(() => uniform);

    // `weight` blends the learned distribution back towards uniform, which is
    // how Intermediate uses the book "at 50%" and Novice ignores it entirely.
    const clamped = Math.max(0, Math.min(1, weight));
    return weights.map((w) => clamped * (w / total) + (1 - clamped) * uniform);
  }

  /**
   * Credits a finished game along every position it passed through.
   *
   * The line is replayed from the opening rather than trusted from the client:
   * the history records where pieces went, and re-deriving the positions is the
   * only way to be sure the hashes match the ones the search will later look up.
   */
  public async record(
    history: MoveHistoryItem[],
    winner: PlayerColor | 'DRAW',
    modeId = 'two_player'
  ): Promise<void> {
    await this.ready();
    if (history.length === 0) return;

    let state: GameState;
    try {
      state = this.engine.initGame(modeId);
    } catch {
      return;
    }

    for (const item of history) {
      const move: MoveAction = {
        pieceId: item.pieceId,
        to: item.to,
        mid: item.mid,
        callReCheckers: item.calledReCheckers,
      };

      const stateHash = hashState(state);
      const key = moveKey(move);
      const outcome = winner === 'DRAW' ? 0 : item.player === winner ? 1 : -1;
      this.credit(stateHash, key, outcome);

      try {
        state = this.engine.applyMove(state, move);
      } catch {
        // The recorded line no longer replays (a scenario was loaded mid-game,
        // or the rules changed under a stored history). Everything credited up
        // to here is still sound, so keep it and stop.
        break;
      }
    }

    this.games += 1;
    this.prune();
    await this.persist();
  }

  private credit(stateHash: string, key: string, outcome: number): void {
    let position = this.entries.get(stateHash);
    if (!position) {
      position = new Map<string, ExperienceEntry>();
      this.entries.set(stateHash, position);
    }
    const entry = position.get(key) ?? { n: 0, w: 0 };
    entry.n += 1;
    entry.w += outcome;
    position.set(key, entry);
  }

  public async clear(): Promise<void> {
    this.entries.clear();
    this.games = 0;
    this.loaded = Promise.resolve();
    if (this.storage) {
      try {
        await this.storage.clear();
      } catch {
        // Nothing useful to do: the in-memory book is already empty.
      }
    }
  }

  public toSnapshot(): ExperienceSnapshot {
    const entries: Record<string, Record<string, ExperienceEntry>> = {};
    for (const [stateHash, position] of this.entries) {
      entries[stateHash] = Object.fromEntries(position);
    }
    return { version: 1, updatedAt: Date.now(), games: this.games, entries };
  }

  public hydrate(snapshot: ExperienceSnapshot | null): void {
    this.entries.clear();
    this.games = 0;
    if (!snapshot || snapshot.version !== 1 || !snapshot.entries) return;

    for (const [stateHash, position] of Object.entries(snapshot.entries)) {
      const map = new Map<string, ExperienceEntry>();
      for (const [key, entry] of Object.entries(position)) {
        if (typeof entry?.n === 'number' && typeof entry?.w === 'number') {
          map.set(key, { n: entry.n, w: entry.w });
        }
      }
      if (map.size > 0) this.entries.set(stateHash, map);
    }
    this.games = snapshot.games ?? 0;
  }

  /** Drops the least-visited positions once the book outgrows its budget. */
  private prune(): void {
    if (this.entries.size <= this.maxPositions) return;

    const scored = Array.from(this.entries.entries()).map(([hash, position]) => {
      let visits = 0;
      for (const entry of position.values()) visits += entry.n;
      return { hash, visits };
    });
    scored.sort((a, b) => a.visits - b.visits);

    const excess = this.entries.size - this.maxPositions;
    for (let i = 0; i < excess; i++) this.entries.delete(scored[i].hash);
  }

  private async persist(): Promise<void> {
    if (!this.storage) return;
    // A save already in flight will not have seen this game, so one more is
    // queued behind it rather than running concurrently against the same key.
    const run = async () => {
      try {
        await this.storage!.save(this.toSnapshot());
      } catch {
        // Quota exceeded or private-browsing storage: the bot keeps the book in
        // memory for this session and simply does not remember it next time.
      }
    };
    this.pendingSave = this.pendingSave ? this.pendingSave.then(run) : run();
    return this.pendingSave;
  }
}
