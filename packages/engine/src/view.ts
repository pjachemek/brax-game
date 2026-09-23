/**
 * @brax/engine/view - The part of the engine a renderer is allowed to know.
 *
 * Board topology, coordinate maths and read-only state lookups: everything a UI
 * needs to draw a position and interpret a tap, and nothing that decides what is
 * legal. Importing from here keeps the rulebook (modes, validation, victory,
 * threats, AI) out of the client bundle when the engine is hosted remotely.
 *
 * Move legality, Brax eligibility and game results come from BraxEngineClient.
 */

export type {
  BraxEnforcement,
  Edge,
  GameEndReason,
  GameResult,
  GameState,
  MoveAction,
  MoveHistoryEntry,
  MovePath,
  NodeCoord,
  Piece,
  PieceSide,
  PlayerColor,
  PlayerTurnContext,
  ThreatenedPieceInfo,
  ValidationResult,
} from './core/types.ts';

export {
  BOARD_SIZE,
  COLUMN_LABELS,
  ROW_LABELS,
  algebraicToCoord,
  areCoordsEqual,
  coordToAlgebraic,
  coordToKey,
  edgeKey,
  isValidCoord,
  keyToCoord,
} from './core/geometry.ts';

export { BoardGraph, CANONICAL_BRAX_BOARD } from './core/board.ts';
export type { BoardNeighbor } from './core/board.ts';

export { findPieceCoord, getPieceAt } from './core/movement.ts';

// The bot's *vocabulary*, not the bot. A UI has to name a difficulty, label it
// and validate one that arrives from storage; none of that needs the search,
// the Experience Book or a single rule, so this module is imported directly
// rather than through core/ai's barrel, which would drag all three in.
export type { AIDifficulty, BotPlayConfig, MoveHistoryItem } from './core/ai/types.ts';
export { AI_DIFFICULTIES, DIFFICULTY_PROFILES, isAIDifficulty } from './core/ai/types.ts';
// Pacing is a property of the opponent, not of a platform, so both front ends
// read the same numbers from here. It is pure timing - no rules, no search.
export {
  BOT_PACING_MIN_MS,
  BOT_PACING_MAX_MS,
  botPacingDelay,
  withBotPacing,
} from './core/ai/pacing.ts';

// Failure handling belongs to the contract, not to the rulebook: a client needs
// to tell "the rules refused that" from "the engine is unreachable" without
// importing anything that can decide legality.
export { EngineError, isEngineError } from './session/errors.ts';
export type { EngineErrorCode } from './session/errors.ts';
export type {
  GameSnapshot,
  GameModeInfo,
  MoveOutcome,
  CreateGameOptions,
} from './session/types.ts';
