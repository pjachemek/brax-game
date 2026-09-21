/**
 * Brax Engine - In-memory session repository.
 *
 * Default for local play and for a single-instance service. Sessions expire so
 * a long-running server does not accumulate abandoned games.
 */

import { GameSession, GameSessionRepository } from './types.ts';

export interface InMemoryRepositoryOptions {
  /** Drop sessions untouched for longer than this, in ms. Default 24h. */
  ttlMs?: number;
  /** Hard cap on retained sessions; the least recently updated are evicted. */
  maxSessions?: number;
}

export class InMemoryGameSessionRepository implements GameSessionRepository {
  private readonly sessions = new Map<string, GameSession>();
  private readonly ttlMs: number;
  private readonly maxSessions: number;

  constructor(options: InMemoryRepositoryOptions = {}) {
    this.ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1000;
    this.maxSessions = options.maxSessions ?? 5000;
  }

  public async create(session: GameSession): Promise<GameSession> {
    this.prune();
    this.sessions.set(session.gameId, session);
    return session;
  }

  public async get(gameId: string): Promise<GameSession | null> {
    const session = this.sessions.get(gameId);
    if (!session) return null;
    if (this.isExpired(session)) {
      this.sessions.delete(gameId);
      return null;
    }
    return session;
  }

  public async save(session: GameSession): Promise<GameSession> {
    this.sessions.set(session.gameId, session);
    return session;
  }

  public async delete(gameId: string): Promise<boolean> {
    return this.sessions.delete(gameId);
  }

  public async list(): Promise<GameSession[]> {
    this.prune();
    return Array.from(this.sessions.values());
  }

  private isExpired(session: GameSession): boolean {
    return Date.now() - session.updatedAt > this.ttlMs;
  }

  private prune(): void {
    for (const [id, session] of this.sessions) {
      if (this.isExpired(session)) this.sessions.delete(id);
    }

    if (this.sessions.size <= this.maxSessions) return;

    const byAge = Array.from(this.sessions.values()).sort((a, b) => a.updatedAt - b.updatedAt);
    const excess = this.sessions.size - this.maxSessions;
    for (let i = 0; i < excess; i++) {
      this.sessions.delete(byAge[i].gameId);
    }
  }
}
