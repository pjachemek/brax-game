/**
 * ReCheckers Rules Engine - Core Domain Types
 * Independent of any UI framework (pure TypeScript).
 */

export type PlayerColor = 'RED' | 'BLUE';
export type PieceSide = 'PLAIN' | 'MARKED';

export interface NodeCoord {
  x: number; // 0..8 (A..I)
  y: number; // 0..8 (1..9)
}

export interface Piece {
  id: string;
  color: PlayerColor;
  side: PieceSide;
}

export interface Edge {
  from: NodeCoord;
  to: NodeCoord;
  color: PlayerColor;
}

export interface MovePath {
  p0: NodeCoord;
  p1?: NodeCoord; // intermediate node for distance 2
  p2: NodeCoord;  // destination node
  distance: 1 | 2;
}

export interface MoveAction {
  pieceId: string;
  to: NodeCoord;
  /**
   * The intermediate node for distance 2 moves (if applicable).
   * If not provided, engine calculates the valid path or checks if a unique valid path exists.
   */
  mid?: NodeCoord;
  /**
   * Flag indicating whether the player declares "ReCheckers" (Jinx) upon completing this move.
   */
  callReCheckers?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  normalizedMove?: MoveAction;
  path?: MovePath;
}

export interface ThreatenedPieceInfo {
  threatenedPieceId: string;
  threatenedColor: PlayerColor;
  threatenedCoord: NodeCoord;
  threatenedByPieceId: string;
  threatenedByColor: PlayerColor;
  threatenedByCoord: NodeCoord;
  attackPath: MovePath;
}

export interface ReCheckersEnforcement {
  callerColor: PlayerColor;
  victimColor: PlayerColor;
  threatenedPieceIds: string[];
  enforcedAtTurnNumber: number;
}

export type GameEndReason =
  | 'ALL_PIECES_CAPTURED'
  | 'STALEMATE'
  | 'SURRENDER'
  | 'DRAW_BY_REPETITION'
  | 'DRAW_1V1_NO_PROGRESS';

export interface GameResult {
  winner: PlayerColor | 'DRAW';
  reason: GameEndReason;
  description: string;
}

export interface PlayerTurnContext {
  activePlayer: PlayerColor;
  turnNumber: number;
  reCheckersCallable: boolean;
  threatenedPiecesCount: number;
  mustMovePieceIds?: string[];
}

export interface MoveHistoryEntry {
  moveNumber: number;
  player: PlayerColor;
  pieceId: string;
  from: NodeCoord;
  mid?: NodeCoord;
  to: NodeCoord;
  distance: 1 | 2;
  /** First piece taken by the move; kept for callers that only show one. */
  capturedPiece?: Piece;
  /**
   * Every piece the move displaced, in travel order. A distance 2 move can take
   * two: one on the node it passed over and one on the node it landed on.
   */
  capturedPieces?: Piece[];
  calledReCheckers: boolean;
  algebraic: string;
  timestamp: number;
}

export interface GameState {
  /**
   * Board map keyed by coordinate string "x,y" (e.g. "1,0" for B1)
   */
  board: Record<string, Piece | null>;
  turn: PlayerColor;
  turnNumber: number;
  capturedPieces: {
    RED: Piece[];
    BLUE: Piece[];
  };
  activeReCheckers: ReCheckersEnforcement | null;
  /**
   * Turn number when each player last called ReCheckers.
   * Player cannot call ReCheckers multiple times without making their own move.
   */
  lastReCheckersCallTurn: Record<PlayerColor, number | null>;
  history: MoveHistoryEntry[];
  result: GameResult | null;
  gameModeId: string;
  /**
   * Consecutive half-moves in 1v1 endgame without a capture (5 mutual moves = 10 half-moves -> draw)
   */
  endgame1v1HalfMovesWithoutCapture: number;
}

export interface ReCheckersGameMode {
  id: string; // 'two_player' | 'three_player' | 'four_player' | 'fox_and_geese'
  name: string;
  description: string;
  initBoard(): GameState;
  getTurnOrder(state: GameState): PlayerTurnContext;
  validateMove(state: GameState, move: MoveAction): ValidationResult;
  applyMove(state: GameState, move: MoveAction): GameState;
  checkVictory(state: GameState): GameResult | null;
  getValidMoves(state: GameState, pieceId: string): MoveAction[];
}
