/**
 * ReCheckers Rules Engine - AI domain types.
 *
 * These are part of the engine's public contract: the session layer, both
 * transports and every front end name difficulties and bot configuration with
 * exactly these types, so a mobile build and a hosted service cannot drift into
 * describing the same opponent differently.
 */

import type { GameState, MoveAction, MoveHistoryEntry, NodeCoord, PlayerColor } from '../types.ts';

export type AIDifficulty = 'novice' | 'intermediate' | 'master';

export const AI_DIFFICULTIES: readonly AIDifficulty[] = ['novice', 'intermediate', 'master'];

export function isAIDifficulty(value: unknown): value is AIDifficulty {
  return value === 'novice' || value === 'intermediate' || value === 'master';
}

export interface BotPlayConfig {
  enabled: boolean;
  botColor: PlayerColor;
  difficulty: AIDifficulty;
}

/**
 * A recorded half-move, as the engine already stores it in `GameState.history`.
 * Named separately because the experience API is about a *finished game's*
 * record rather than about the state a board is currently in.
 */
export type MoveHistoryItem = MoveHistoryEntry;

/**
 * A candidate move as the search sees it: a concrete path plus what it takes.
 *
 * The search deliberately does not carry `callReCheckers`. Declaring is a decision
 * about the position *after* the move is fixed (see `shouldDeclareReCheckers`), and
 * folding it into the move list would double the branching factor for a choice
 * that never changes where a piece lands.
 */
export interface BotMove {
  pieceId: string;
  from: NodeCoord;
  to: NodeCoord;
  mid?: NodeCoord;
  /** Enemy pieces this move removes: 0, 1, or 2 on a sweeping double capture. */
  captures: number;
}

/**
 * Rollouts are capped rather than played to the end. ReCheckers positions cycle
 * freely — two pieces can shuffle along the same pair of nodes forever — so an
 * uncapped playout is not merely slow, it does not terminate.
 */
export const MAX_ROLLOUT_PLIES = 25;

/** Everything a difficulty level fixes about how the bot thinks. */
export interface DifficultyProfile {
  id: AIDifficulty;
  label: string;
  /** Lower / upper bound on simulations per move; the search picks in range. */
  minSimulations: number;
  maxSimulations: number;
  /** PUCT exploration constant C. */
  exploration: number;
  /** Root selection temperature. 0 means strict argmax over visit counts. */
  temperature: number;
  /** Plies played out per rollout before the position is evaluated instead. */
  rolloutDepth: number;
  /** 0 = ignore the Experience Book, 1 = trust its priors fully. */
  experienceWeight: number;
  /** Probability a rollout takes the best available capture instead of a random move. */
  captureBias: number;
  /** Hard wall-clock budget in ms; the search stops early when it is spent. */
  timeBudgetMs: number;
}

export const DIFFICULTY_PROFILES: Record<AIDifficulty, DifficultyProfile> = {
  novice: {
    id: 'novice',
    label: 'Nowicjusz',
    minSimulations: 80,
    maxSimulations: 120,
    exploration: 2.0,
    temperature: 1.0,
    rolloutDepth: 4,
    experienceWeight: 0,
    captureBias: 0,
    timeBudgetMs: 250,
  },
  intermediate: {
    id: 'intermediate',
    label: 'Średni',
    minSimulations: 400,
    maxSimulations: 600,
    exploration: 1.41,
    temperature: 0.35,
    rolloutDepth: 9,
    experienceWeight: 0.5,
    captureBias: 0.75,
    timeBudgetMs: 350,
  },
  master: {
    id: 'master',
    label: 'Mistrz',
    minSimulations: 1500,
    maxSimulations: 2500,
    exploration: 1.15,
    temperature: 0,
    rolloutDepth: MAX_ROLLOUT_PLIES,
    experienceWeight: 1,
    captureBias: 0.95,
    timeBudgetMs: 400,
  },
};

/** What the search learned, returned alongside the move it chose. */
export interface SearchResult {
  move: MoveAction | null;
  /** Visit counts per move key, highest first; the bot's "opinion" of the position. */
  visits: Array<{ key: string; move: BotMove; visits: number; winRate: number }>;
  simulations: number;
  elapsedMs: number;
  difficulty: AIDifficulty;
}

/** One state→action statistic in the Experience Book. */
export interface ExperienceEntry {
  /** Times this action was played from this position across recorded games. */
  n: number;
  /** Cumulative outcome: +1 per win, -1 per loss, 0 for a draw. */
  w: number;
}

/** Serialized shape of the whole book, as persisted. */
export interface ExperienceSnapshot {
  version: 1;
  updatedAt: number;
  games: number;
  /** stateHash -> moveKey -> entry */
  entries: Record<string, Record<string, ExperienceEntry>>;
}

/**
 * Persistence port for the Experience Book. `localStorage`, IndexedDB and the
 * hosted service all implement this, so the learning loop does not care which
 * one a platform can offer.
 */
export interface ExperienceStorage {
  load(): Promise<ExperienceSnapshot | null>;
  save(snapshot: ExperienceSnapshot): Promise<void>;
  clear(): Promise<void>;
}

/** Narrow view of the state the search needs; kept for documentation value. */
export type SimulationState = GameState;
