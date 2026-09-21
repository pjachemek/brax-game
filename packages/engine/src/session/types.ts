/**
 * Brax Engine - Session domain types.
 *
 * A session is the server-authoritative unit of play: it owns the canonical
 * GameState plus everything the rules engine itself is too pure to remember
 * (undo history, revision counter, timestamps).
 */

import { GameResult, GameState, MoveAction } from '../core/types.ts';

export interface GameSession {
  gameId: string;
  modeId: string;
  state: GameState;
  /** Past states, oldest first. Only the tail is reachable via undo. */
  history: GameState[];
  /** Incremented on every mutation; used for optimistic concurrency. */
  revision: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * What a client is allowed to see. Deliberately excludes the undo stack so the
 * payload stays small and the server keeps sole custody of rollback.
 */
export interface GameSnapshot {
  gameId: string;
  modeId: string;
  state: GameState;
  revision: number;
  canUndo: boolean;
  result: GameResult | null;
}

export interface CreateGameOptions {
  modeId?: string;
  /** Seed the session from an existing state (scenario loading, test fixtures). */
  state?: GameState;
}

export interface ApplyMoveOptions {
  /**
   * Revision the client believes it is acting on. When supplied and stale the
   * manager raises REVISION_CONFLICT instead of silently applying the move.
   */
  expectedRevision?: number;
}

export interface GameModeInfo {
  id: string;
  name: string;
  description: string;
}

export interface MoveOutcome {
  snapshot: GameSnapshot;
  /** First piece captured by the move just applied, if any. */
  capturedPieceId: string | null;
  /** Every piece captured by the move, in travel order (a distance 2 move can take two). */
  capturedPieceIds: string[];
  /** True when the applied move declared Brax and enforcement is now active. */
  braxCalled: boolean;
  /** Pieces the opponent is now forced to move, when Brax is active. */
  enforcedPieceIds: string[];
  move: MoveAction;
}

/**
 * Persistence port. The in-memory implementation ships with the package; a
 * hosted deployment can swap in Redis/Postgres without touching the manager.
 */
export interface GameSessionRepository {
  create(session: GameSession): Promise<GameSession>;
  get(gameId: string): Promise<GameSession | null>;
  save(session: GameSession): Promise<GameSession>;
  delete(gameId: string): Promise<boolean>;
  list(): Promise<GameSession[]>;
}
