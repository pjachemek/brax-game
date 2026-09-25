/**
 * ReCheckers Mobile UI - Types & State Definitions
 *
 * The store no longer owns the rules or the board's history: it holds a
 * projection of a server-authoritative session (gameId + revision) and talks to
 * the engine exclusively through ReCheckersEngineClient. Every action is async
 * because the engine may be a network hop away.
 */

import type { BotPlayConfig, GameState, MoveAction, NodeCoord } from '@re-checkers/engine';

/**
 * High-level interactive phases for player turn flow.
 */
export type TurnPhase =
  | 'CONNECTING'           // No session yet; creating or reattaching to a game
  | 'AWAITING_SELECTION'   // Waiting for player to select their piece
  | 'PIECE_SELECTED'       // Piece is selected; valid target highlights visible
  | 'PENDING_RE_CHECKERS_CHOICE'  // Move creates threat; player chooses "Call Re-Checkers!" vs "Normal Move"
  | 'GAME_OVER';           // Victory / draw achieved

export interface GameStoreState {
  // --- Session projection (owned by the engine service) ---
  /** Null until the first session is established. */
  gameId: string | null;
  gameState: GameState | null;
  gameModeId: string;
  /** Session revision the local projection reflects; sent back for concurrency checks. */
  revision: number;
  canUndo: boolean;

  // --- Interaction state (owned by the client) ---
  selectedPieceId: string | null;
  validMoves: MoveAction[];
  turnPhase: TurnPhase;
  pendingMove: MoveAction | null; // Move staged pending ReCheckers choice

  // --- Opponent ---
  /** Who the bot is, if anyone. `enabled: false` is pass-and-play. */
  botConfig: BotPlayConfig;
  /**
   * A bot turn is being played right now.
   *
   * Set for the whole visible turnaround - the pacing pause as well as the
   * search - because that is the window the board has to refuse gestures for.
   * `selectIsBotThinking` is the selector components should read.
   */
  isBotTurnInFlight: boolean;

  // --- Transport state ---
  /** An engine request is in flight; the board should refuse new input. */
  isBusy: boolean;
  /** Set when the engine is unreachable, as opposed to a rules refusal. */
  connectionError: string | null;

  // --- Feedback ---
  statusMessage: string | null;
  errorMessage: string | null;
  /** Piece that just refused an action; the board shakes it. */
  rejectedPieceId: string | null;
  /** Bumped on every rejection so repeating the same illegal tap replays the shake. */
  rejectionNonce: number;
  /** Bumped when the player taps a node that is not a legal target; flashes the legal ones. */
  targetHintNonce: number;

  // --- Actions ---
  initGame: (modeId?: string) => Promise<void>;
  /** Reattach to an existing server-side session, e.g. after an app restart. */
  attachGame: (gameId: string) => Promise<void>;
  selectPiece: (pieceId: string) => Promise<void>;
  unselectPiece: () => void;
  selectDestination: (coord: NodeCoord) => Promise<void>;
  confirmReCheckersChoice: (callReCheckers: boolean) => Promise<void>;
  cancelPendingMove: () => void;
  undoMove: () => Promise<void>;
  resetGame: (modeId?: string) => Promise<void>;
  dismissError: () => void;
  loadCustomState: (state: GameState) => Promise<void>;
  /** Re-pull the canonical snapshot; used after a revision conflict. */
  refresh: () => Promise<void>;

  // --- Bot ---
  setBotConfig: (patch: Partial<BotPlayConfig>) => void;
  /**
   * Plays the bot's turn if it is the bot's turn. Idempotent and self-guarding,
   * so the screen can call it from an effect without tracking whether it has
   * already fired.
   */
  playBotTurn: () => Promise<void>;
  /** Wipes everything the bot has learned across games. */
  resetExperience: () => Promise<void>;
}
