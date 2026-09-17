/**
 * Brax Mobile UI - Types & State Definitions
 * Clean TypeScript contracts for React Native and Zustand state management.
 */

import {
  GameState,
  MoveAction,
  NodeCoord,
  PlayerColor,
  ValidationResult,
  GameResult,
  ThreatenedPieceInfo,
} from '../engine/types.ts';

/**
 * High-level interactive phases for player turn flow.
 */
export type TurnPhase =
  | 'AWAITING_SELECTION'   // Waiting for player to select their piece
  | 'PIECE_SELECTED'       // Piece is selected; valid target highlights visible
  | 'PENDING_BRAX_CHOICE'   // Move creates threat; player chooses "Call Brax!" vs "Normal Move"
  | 'GAME_OVER';           // Victory / draw achieved

export interface GameStoreState {
  // Pure Engine State
  gameState: GameState;
  gameModeId: string;

  // Interaction State
  selectedPieceId: string | null;
  validMoves: MoveAction[];
  turnPhase: TurnPhase;
  pendingMove: MoveAction | null; // Move staged pending Brax choice

  // Feedback & History
  statusMessage: string | null;
  errorMessage: string | null;
  /** Piece that just refused an action; the board shakes it. */
  rejectedPieceId: string | null;
  /** Bumped on every rejection so repeating the same illegal tap replays the shake. */
  rejectionNonce: number;
  /** Bumped when the player taps a node that is not a legal target; flashes the legal ones. */
  targetHintNonce: number;
  history: GameState[]; // Rollback history stack
  canUndo: boolean;

  // Actions
  initGame: (modeId?: string) => void;
  selectPiece: (pieceId: string) => void;
  unselectPiece: () => void;
  selectDestination: (coord: NodeCoord) => void;
  confirmBraxChoice: (callBrax: boolean) => void;
  cancelPendingMove: () => void;
  undoMove: () => void;
  resetGame: (modeId?: string) => void;
  dismissError: () => void;
  loadCustomState: (state: GameState) => void;
}
