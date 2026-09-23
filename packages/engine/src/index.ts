/**
 * @brax/engine - Public surface of the Brax rules engine.
 *
 * `core/*` is the pure, stateless rulebook (no IO, no framework, no clock).
 * `session/*` adds the server-authoritative game lifecycle built on top of it.
 * Nothing in this package imports React or touches the network.
 */

// --- Pure rules core -------------------------------------------------------
export * from './core/types.ts';
export {
  BraxEngine,
  defaultBraxEngine,
  getValidMoves,
  getAllValidMoves,
  applyMove,
  validateMove,
  initGame,
  serializeGameState,
  deserializeGameState,
} from './core/engine.ts';
export { BoardGraph, CANONICAL_BRAX_BOARD } from './core/board.ts';
export type { BoardNeighbor } from './core/board.ts';
export * from './core/geometry.ts';
export { findPieceCoord, getPieceAt } from './core/movement.ts';
export {
  calculateThreats,
  getThreatsCreatedByMove,
  getUniqueThreatenedPieceIds,
  isEndgame1v2,
  canPlayerCallBrax,
} from './core/threats.ts';
// --- Bot / AI --------------------------------------------------------------
// The whole of core/ai is re-exported: MCTS, the Experience Book, its storage
// adapters and the difficulty profiles are all part of what a host wires up.
export * from './core/ai.ts';
export { getPresetScenarios } from './core/scenarios.ts';
export type { GameScenario } from './core/scenarios.ts';
export { runInBrowserTestSuite } from './core/test-runner.ts';
export type { TestResultItem, TestSuiteRunResult } from './core/test-runner.ts';

// --- Session layer ---------------------------------------------------------
export type {
  ApplyMoveOptions,
  CreateGameOptions,
  GameModeInfo,
  GameSession,
  GameSessionRepository,
  GameSnapshot,
  MoveOutcome,
} from './session/types.ts';
export { EngineError, isEngineError } from './session/errors.ts';
export type { EngineErrorCode } from './session/errors.ts';
export { GameSessionManager, toSnapshot } from './session/manager.ts';
export type {
  SessionManagerOptions,
  MoveOptionsResult,
  TurnContextResult,
} from './session/manager.ts';
export { InMemoryGameSessionRepository } from './session/memory-repository.ts';
export type { InMemoryRepositoryOptions } from './session/memory-repository.ts';
