/**
 * ReCheckers Rules Engine - Main Stateless Engine & Public API
 * Fully decoupled from UI framework, fully serializable, and immutable.
 */

import {
  ReCheckersGameMode,
  GameState,
  MoveAction,
  PlayerColor,
  PlayerTurnContext,
  ValidationResult,
  GameResult,
  ThreatenedPieceInfo,
} from './types.ts';
import { BoardGraph, CANONICAL_RE_CHECKERS_BOARD } from './board.ts';
import { TwoPlayerClassicMode } from './modes/two-player-classic.ts';
import { FoxAndGeeseReCheckersMode } from './modes/fox-and-geese.ts';
import { calculateThreats } from './threats.ts';

export class ReCheckersEngine {
  private readonly modes: Map<string, ReCheckersGameMode> = new Map();
  private readonly boardGraph: BoardGraph;

  constructor(boardGraph: BoardGraph = CANONICAL_RE_CHECKERS_BOARD) {
    this.boardGraph = boardGraph;

    // Register standard modes
    this.registerMode(new TwoPlayerClassicMode(this.boardGraph));
    this.registerMode(new FoxAndGeeseReCheckersMode(this.boardGraph));
  }

  public registerMode(mode: ReCheckersGameMode): void {
    this.modes.set(mode.id, mode);
  }

  public getMode(modeId: string = 'two_player'): ReCheckersGameMode {
    const mode = this.modes.get(modeId);
    if (!mode) {
      throw new Error(`Game mode "${modeId}" is not registered in ReCheckersEngine.`);
    }
    return mode;
  }

  public getAvailableModes(): Array<{ id: string; name: string; description: string }> {
    return Array.from(this.modes.values()).map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
    }));
  }

  /**
   * Initializes a fresh immutable GameState for the specified game mode.
   */
  public initGame(modeId: string = 'two_player'): GameState {
    const mode = this.getMode(modeId);
    return mode.initBoard();
  }

  /**
   * Returns the turn context, active player, and ReCheckers callable status.
   */
  public getTurnOrder(state: GameState): PlayerTurnContext {
    const mode = this.getMode(state.gameModeId);
    return mode.getTurnOrder(state);
  }

  /**
   * Validates a proposed move against the active game mode rules.
   */
  public validateMove(state: GameState, move: MoveAction): ValidationResult {
    const mode = this.getMode(state.gameModeId);
    return mode.validateMove(state, move);
  }

  /**
   * Applies a move action and returns a new immutable GameState.
   */
  public applyMove(state: GameState, move: MoveAction): GameState {
    const mode = this.getMode(state.gameModeId);
    return mode.applyMove(state, move);
  }

  /**
   * Evaluates victory / draw status for the current board state.
   */
  public checkVictory(state: GameState): GameResult | null {
    const mode = this.getMode(state.gameModeId);
    return mode.checkVictory(state);
  }

  /**
   * Computes all valid legal moves for a piece in accordance with callReCheckers restrictions.
   */
  public getValidMoves(state: GameState, pieceId: string): MoveAction[] {
    const mode = this.getMode(state.gameModeId);
    return mode.getValidMoves(state, pieceId);
  }

  /**
   * Computes all legal moves available to the active player in the current turn.
   */
  public getAllValidMoves(state: GameState): MoveAction[] {
    const moves: MoveAction[] = [];
    const activePlayer = state.turn;

    for (const piece of Object.values(state.board)) {
      if (piece && piece.color === activePlayer) {
        const pieceMoves = this.getValidMoves(state, piece.id);
        moves.push(...pieceMoves);
      }
    }

    return moves;
  }

  /**
   * Computes all enemy pieces threatened by the specified attacker color.
   */
  public getThreats(state: GameState, attackerColor?: PlayerColor): ThreatenedPieceInfo[] {
    const color = attackerColor ?? state.turn;
    return calculateThreats(state, color, this.boardGraph);
  }

  /**
   * Serializes the game state to clean JSON.
   */
  public serialize(state: GameState): string {
    return JSON.stringify(state, null, 2);
  }

  /**
   * Deserializes JSON string back into GameState with validation.
   */
  public deserialize(json: string): GameState {
    const parsed = JSON.parse(json) as GameState;
    if (!parsed || !parsed.board || !parsed.turn || !parsed.gameModeId) {
      throw new Error('Invalid serialized ReCheckers GameState: missing core fields.');
    }
    return Object.freeze(parsed);
  }
}

// Default singleton engine instance
export const defaultReCheckersEngine = new ReCheckersEngine(CANONICAL_RE_CHECKERS_BOARD);

/**
 * Top-level functional export as specified in requirement 5:
 * getValidMoves(state: GameState, pieceId: string): MoveAction[]
 */
export function getValidMoves(state: GameState, pieceId: string): MoveAction[] {
  return defaultReCheckersEngine.getValidMoves(state, pieceId);
}

export function getAllValidMoves(state: GameState): MoveAction[] {
  return defaultReCheckersEngine.getAllValidMoves(state);
}

export function applyMove(state: GameState, move: MoveAction): GameState {
  return defaultReCheckersEngine.applyMove(state, move);
}

export function validateMove(state: GameState, move: MoveAction): ValidationResult {
  return defaultReCheckersEngine.validateMove(state, move);
}

export function initGame(modeId: string = 'two_player'): GameState {
  return defaultReCheckersEngine.initGame(modeId);
}

export function serializeGameState(state: GameState): string {
  return defaultReCheckersEngine.serialize(state);
}

export function deserializeGameState(json: string): GameState {
  return defaultReCheckersEngine.deserialize(json);
}
