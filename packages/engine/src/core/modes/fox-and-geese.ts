/**
 * ReCheckers Rules Engine - FoxAndGeeseMode
 * Demonstrates the extensibility of ReCheckersGameMode interface for historical Denham variants.
 */

import {
  ReCheckersGameMode,
  GameState,
  MoveAction,
  PlayerColor,
  PlayerTurnContext,
  ValidationResult,
  GameResult,
  Piece,
} from '../types.ts';
import { BOARD_SIZE, coordToKey } from '../geometry.ts';
import { BoardGraph, CANONICAL_RE_CHECKERS_BOARD } from '../board.ts';
import { TwoPlayerClassicMode } from './two-player-classic.ts';

export class FoxAndGeeseReCheckersMode implements ReCheckersGameMode {
  public readonly id = 'fox_and_geese';
  public readonly name = 'Fox & Geese ReCheckers';
  public readonly description =
    'Asymmetrical ReCheckers variant: 1 Fox (Red, Marked) vs 8 Geese (Blue, Plain). Geese aim to trap the Fox; Fox aims to capture Geese.';

  private readonly delegate: TwoPlayerClassicMode;

  constructor(private readonly boardGraph: BoardGraph = CANONICAL_RE_CHECKERS_BOARD) {
    this.delegate = new TwoPlayerClassicMode(boardGraph);
  }

  public initBoard(): GameState {
    const board: Record<string, Piece | null> = {};

    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        board[`${x},${y}`] = null;
      }
    }

    // 1 Fox at center (4, 4) - Red, Marked side
    board['4,4'] = {
      id: 'FOX',
      color: 'RED',
      side: 'MARKED',
    };

    // 8 Geese forming a perimeter on row 7 & 8
    let gooseIndex = 1;
    for (let x = 2; x <= 5; x++) {
      board[`${x},7`] = { id: `GOOSE_${gooseIndex++}`, color: 'BLUE', side: 'PLAIN' };
      board[`${x},8`] = { id: `GOOSE_${gooseIndex++}`, color: 'BLUE', side: 'PLAIN' };
    }

    return {
      board,
      turn: 'RED',
      turnNumber: 1,
      capturedPieces: { RED: [], BLUE: [] },
      activeReCheckers: null,
      lastReCheckersCallTurn: { RED: null, BLUE: null },
      history: [],
      result: null,
      gameModeId: this.id,
      endgame1v1HalfMovesWithoutCapture: 0,
    };
  }

  public getTurnOrder(state: GameState): PlayerTurnContext {
    return this.delegate.getTurnOrder(state);
  }

  public validateMove(state: GameState, move: MoveAction): ValidationResult {
    return this.delegate.validateMove(state, move);
  }

  public applyMove(state: GameState, move: MoveAction): GameState {
    const nextState = this.delegate.applyMove(state, move);
    return {
      ...nextState,
      gameModeId: this.id,
    };
  }

  public checkVictory(state: GameState): GameResult | null {
    // Fox wins if fewer than 4 geese remain
    let geeseCount = 0;
    let foxExists = false;
    for (const p of Object.values(state.board)) {
      if (p) {
        if (p.id === 'FOX') foxExists = true;
        if (p.color === 'BLUE') geeseCount++;
      }
    }

    if (!foxExists) {
      return {
        winner: 'BLUE',
        reason: 'ALL_PIECES_CAPTURED',
        description: 'Geese have trapped or eliminated the Fox!',
      };
    }

    if (geeseCount < 4) {
      return {
        winner: 'RED',
        reason: 'ALL_PIECES_CAPTURED',
        description: 'Fox captured enough Geese to escape triumphantly!',
      };
    }

    return this.delegate.checkVictory(state);
  }

  public getValidMoves(state: GameState, pieceId: string): MoveAction[] {
    return this.delegate.getValidMoves(state, pieceId);
  }
}
