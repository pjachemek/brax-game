/**
 * @re-checkers/engine-client - The contract the app programs against.
 *
 * Every method is async and identified by `gameId`, never by a client-held
 * GameState. That is what makes the transport swappable: the UI cannot tell
 * whether the rules ran in this process or in a service across the network.
 */

import type {
  AIDifficulty,
  CreateGameOptions,
  GameModeInfo,
  GameSnapshot,
  GameState,
  MoveAction,
  MoveHistoryItem,
  MoveOptionsResult,
  MoveOutcome,
  NodeCoord,
  PlayerColor,
  ThreatenedPieceInfo,
  TurnContextResult,
  ValidationResult,
} from '@re-checkers/engine';

export interface ApplyMoveRequestOptions {
  /**
   * Revision the caller believes it is acting on. The engine rejects the move
   * with REVISION_CONFLICT if the game has advanced since.
   */
  expectedRevision?: number;
}

export interface ReCheckersEngineClient {
  /** Human-readable identifier for diagnostics and the debug UI. */
  readonly transport: 'local' | 'http';

  listModes(): Promise<GameModeInfo[]>;

  createGame(options?: CreateGameOptions): Promise<GameSnapshot>;
  getGame(gameId: string): Promise<GameSnapshot>;
  deleteGame(gameId: string): Promise<void>;
  resetGame(gameId: string, modeId?: string): Promise<GameSnapshot>;
  loadState(gameId: string, state: GameState): Promise<GameSnapshot>;

  getValidMoves(gameId: string, pieceId: string): Promise<MoveAction[]>;
  getAllValidMoves(gameId: string): Promise<MoveAction[]>;
  getMoveOptions(gameId: string, pieceId: string, to: NodeCoord): Promise<MoveOptionsResult>;
  getThreats(gameId: string, attackerColor?: PlayerColor): Promise<ThreatenedPieceInfo[]>;
  /** Turn order, ReCheckers rights, endgame status and both sides' threats in one call. */
  getTurnContext(gameId: string): Promise<TurnContextResult>;

  validateMove(gameId: string, move: MoveAction): Promise<ValidationResult>;
  applyMove(
    gameId: string,
    move: MoveAction,
    options?: ApplyMoveRequestOptions
  ): Promise<MoveOutcome>;
  undo(gameId: string): Promise<GameSnapshot>;
  /**
   * Plays the engine's bot move for `botColor`; null when it has nothing to
   * play. `difficulty` selects the MCTS profile and falls back to the engine's
   * own default, so a caller that does not care need not choose.
   */
  playBotMove(
    gameId: string,
    botColor: PlayerColor,
    difficulty?: AIDifficulty
  ): Promise<MoveOutcome | null>;
  /**
   * Teaches the bot from a finished game, crediting both sides along the line
   * that was played. Fire-and-forget from the UI's point of view: a book that
   * fails to save costs the bot a memory, never the player a game.
   */
  recordGameExperience(
    history: MoveHistoryItem[],
    winner: PlayerColor | 'DRAW',
    modeId?: string
  ): Promise<void>;
  /** Wipes everything the bot has learned. */
  resetExperience(): Promise<void>;

  /** Liveness probe. Always true for the local transport. */
  healthCheck(): Promise<boolean>;
}
