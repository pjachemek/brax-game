/**
 * Brax Rules Engine - TwoPlayerClassicMode
 * Official 2-player classic Brax setup with 7 pieces per side, alternating turns,
 * and standard Denham Brax rules.
 */

import {
  BraxGameMode,
  GameState,
  MoveAction,
  PlayerColor,
  PlayerTurnContext,
  ValidationResult,
  GameResult,
  Piece,
  NodeCoord,
  MovePath,
  MoveHistoryEntry,
} from '../types.ts';
import {
  BOARD_SIZE,
  coordToAlgebraic,
  coordToKey,
  isValidCoord,
} from '../geometry.ts';
import { BoardGraph, CANONICAL_BRAX_BOARD } from '../board.ts';
import {
  findPieceCoord,
  getPieceAt,
  getRawLegalPathsForPiece,
  validateMoveAction,
} from '../movement.ts';
import {
  calculateThreats,
  canPlayerCallBrax,
  getThreatsCreatedByMove,
  getUniqueThreatenedPieceIds,
  isEndgame1v2,
} from '../threats.ts';

export class TwoPlayerClassicMode implements BraxGameMode {
  public readonly id = 'two_player';
  public readonly name = 'Classic 2-Player Brax';
  public readonly description =
    'Standard Brax: 7 pieces per player, Red on B1-H1, Blue on B9-H9, alternating turns with 90° color turns and Brax calling.';

  constructor(private readonly boardGraph: BoardGraph = CANONICAL_BRAX_BOARD) {}

  /**
   * Initializes the standard 9x9 board with 7 Red pieces on B1-H1 and 7 Blue pieces on B9-H9.
   */
  public initBoard(): GameState {
    const board: Record<string, Piece | null> = {};

    // Initialize all 81 nodes as empty
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        board[`${x},${y}`] = null;
      }
    }

    // Player RED: 7 pieces on nodes (1,0) to (7,0) [B1-H1]
    for (let x = 1; x <= 7; x++) {
      const piece: Piece = {
        id: `R${x}`,
        color: 'RED',
        side: 'PLAIN',
      };
      board[`${x},0`] = piece;
    }

    // Player BLUE: 7 pieces on nodes (1,8) to (7,8) [B9-H9]
    for (let x = 1; x <= 7; x++) {
      const piece: Piece = {
        id: `B${x}`,
        color: 'BLUE',
        side: 'PLAIN',
      };
      board[`${x},8`] = piece;
    }

    return {
      board,
      turn: 'RED',
      turnNumber: 1,
      capturedPieces: {
        RED: [],
        BLUE: [],
      },
      activeBrax: null,
      lastBraxCallTurn: {
        RED: null,
        BLUE: null,
      },
      history: [],
      result: null,
      gameModeId: this.id,
      endgame1v1HalfMovesWithoutCapture: 0,
    };
  }

  public getTurnOrder(state: GameState): PlayerTurnContext {
    const activePlayer = state.turn;
    const currentThreats = calculateThreats(state, activePlayer, this.boardGraph);

    // Brax is declared with a move, so "can I Brax this turn?" means "does the
    // active player have any legal move that creates a new threat?" - not
    // "is anything threatened right now", which would still be true for a
    // threat established on an earlier turn.
    const canBrax = this.hasBraxableMove(state);

    const mustMovePieceIds =
      state.activeBrax !== null && state.activeBrax.victimColor === activePlayer
        ? state.activeBrax.threatenedPieceIds
        : undefined;

    return {
      activePlayer,
      turnNumber: state.turnNumber,
      braxCallable: canBrax,
      threatenedPiecesCount: currentThreats.length,
      mustMovePieceIds,
    };
  }

  public validateMove(state: GameState, move: MoveAction): ValidationResult {
    const baseValidation = validateMoveAction(state, move, this.boardGraph);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    // If caller wants to declare Brax with this move, verify that the resulting board
    // creates at least one threat on enemy pieces and Brax is allowed
    if (move.callBrax) {
      const simulatedNextState = this.simulateMoveWithoutBrax(state, baseValidation.path!, move.pieceId);
      const threatsAfterMove = calculateThreats(simulatedNextState, state.turn, this.boardGraph);
      const newThreats = getThreatsCreatedByMove(threatsAfterMove, move.pieceId);
      const braxCheck = canPlayerCallBrax(state, state.turn, newThreats);

      if (!braxCheck.allowed) {
        return {
          valid: false,
          reason: `Cannot call Brax: ${braxCheck.reason}`,
        };
      }
    }

    return baseValidation;
  }

  /**
   * Applies a validated move, generating a strictly immutable new GameState.
   */
  public applyMove(state: GameState, move: MoveAction): GameState {
    const validation = this.validateMove(state, move);
    if (!validation.valid) {
      throw new Error(`Illegal Brax move: ${validation.reason}`);
    }

    const path = validation.path!;
    const pieceInfo = findPieceCoord(state, move.pieceId)!;
    const movingPiece = pieceInfo.piece;
    const movingPlayer = state.turn;
    const nextPlayer: PlayerColor = movingPlayer === 'RED' ? 'BLUE' : 'RED';

    // 1. Clone board and move piece
    const newBoard: Record<string, Piece | null> = { ...state.board };
    const fromKey = coordToKey(path.p0);
    const toKey = coordToKey(path.p2);

    const targetPiece = newBoard[toKey];
    newBoard[fromKey] = null;
    newBoard[toKey] = movingPiece;

    // 2. Clone captured pieces
    const newCaptured = {
      RED: [...state.capturedPieces.RED],
      BLUE: [...state.capturedPieces.BLUE],
    };

    let capturedPiece: Piece | undefined;
    if (targetPiece && targetPiece.color !== movingPlayer) {
      capturedPiece = targetPiece;
      newCaptured[movingPlayer].push(targetPiece);
    }

    // 3. Evaluate threats from the new board state
    const intermediateStateForThreats: GameState = {
      ...state,
      board: newBoard,
    };
    const threatsAfterMove = calculateThreats(
      intermediateStateForThreats,
      movingPlayer,
      this.boardGraph
    );
    // Only the threats the moved piece creates can be declared, and only those
    // pieces may be forced to answer the declaration.
    const newThreats = getThreatsCreatedByMove(threatsAfterMove, movingPiece.id);

    // 4. Handle Brax state machine
    let newActiveBrax = null;
    const newLastBraxCallTurn = { ...state.lastBraxCallTurn };

    if (move.callBrax) {
      const braxCheck = canPlayerCallBrax(state, movingPlayer, newThreats);
      if (braxCheck.allowed) {
        const uniqueThreatenedIds = getUniqueThreatenedPieceIds(newThreats);
        newActiveBrax = {
          callerColor: movingPlayer,
          victimColor: nextPlayer,
          threatenedPieceIds: uniqueThreatenedIds,
          enforcedAtTurnNumber: state.turnNumber,
        };
        newLastBraxCallTurn[movingPlayer] = state.turnNumber;
      }
    }

    // 5. Check 1v1 draw progress counter
    let new1v1Counter = state.endgame1v1HalfMovesWithoutCapture;
    let redRemaining = 0;
    let blueRemaining = 0;
    for (const p of Object.values(newBoard)) {
      if (p) {
        if (p.color === 'RED') redRemaining++;
        else if (p.color === 'BLUE') blueRemaining++;
      }
    }

    if (redRemaining === 1 && blueRemaining === 1) {
      if (capturedPiece) {
        new1v1Counter = 0;
      } else {
        new1v1Counter += 1;
      }
    } else {
      new1v1Counter = 0;
    }

    // 6. Build algebraic representation
    const p0Alg = coordToAlgebraic(path.p0);
    const p2Alg = coordToAlgebraic(path.p2);
    const isCapture = Boolean(capturedPiece);
    const sep = isCapture ? 'x' : '-';
    let algebraic = `${p0Alg}${sep}${p2Alg}`;
    if (path.distance === 2 && path.p1) {
      const p1Alg = coordToAlgebraic(path.p1);
      algebraic = isCapture ? `${p0Alg}-${p1Alg}x${p2Alg}` : `${p0Alg}-${p1Alg}-${p2Alg}`;
    }
    if (newActiveBrax) {
      algebraic += ' (Brax!)';
    }

    // 7. Assemble history entry
    const historyEntry: MoveHistoryEntry = {
      moveNumber: state.turnNumber,
      player: movingPlayer,
      pieceId: movingPiece.id,
      from: path.p0,
      mid: path.p1,
      to: path.p2,
      distance: path.distance,
      capturedPiece,
      calledBrax: Boolean(newActiveBrax),
      algebraic,
      timestamp: Date.now(),
    };

    // 8. Assemble intermediate candidate state to check victory/stalemate
    const nextCandidateState: GameState = {
      board: newBoard,
      turn: nextPlayer,
      turnNumber: state.turnNumber + 1,
      capturedPieces: newCaptured,
      activeBrax: newActiveBrax,
      lastBraxCallTurn: newLastBraxCallTurn,
      history: [...state.history, historyEntry],
      result: null,
      gameModeId: this.id,
      endgame1v1HalfMovesWithoutCapture: new1v1Counter,
    };

    // 9. Check game end conditions
    nextCandidateState.result = this.checkVictory(nextCandidateState);

    return Object.freeze(nextCandidateState);
  }

  public checkVictory(state: GameState): GameResult | null {
    let redCount = 0;
    let blueCount = 0;

    for (const piece of Object.values(state.board)) {
      if (piece) {
        if (piece.color === 'RED') redCount++;
        else if (piece.color === 'BLUE') blueCount++;
      }
    }

    // Win condition: capture all enemy pieces
    if (blueCount === 0) {
      return {
        winner: 'RED',
        reason: 'ALL_PIECES_CAPTURED',
        description: 'RED has captured all BLUE pieces!',
      };
    }
    if (redCount === 0) {
      return {
        winner: 'BLUE',
        reason: 'ALL_PIECES_CAPTURED',
        description: 'BLUE has captured all RED pieces!',
      };
    }

    // 1v1 Draw after 5 mutual moves without a capture (10 half-moves)
    if (state.endgame1v1HalfMovesWithoutCapture >= 10) {
      return {
        winner: 'DRAW',
        reason: 'DRAW_1V1_NO_PROGRESS',
        description: 'Game drawn: 1 piece remaining per player with 5 consecutive rounds without capture.',
      };
    }

    // Stalemate / No legal moves check for active player
    const activePlayer = state.turn;
    let hasAtLeastOneLegalMove = false;

    for (const piece of Object.values(state.board)) {
      if (piece && piece.color === activePlayer) {
        const moves = this.getValidMoves(state, piece.id);
        if (moves.length > 0) {
          hasAtLeastOneLegalMove = true;
          break;
        }
      }
    }

    if (!hasAtLeastOneLegalMove) {
      const winningColor: PlayerColor = activePlayer === 'RED' ? 'BLUE' : 'RED';
      return {
        winner: winningColor,
        reason: 'STALEMATE',
        description: `${activePlayer} has no legal moves remaining. ${winningColor} wins by stalemate!`,
      };
    }

    return null;
  }

  /**
   * Computes all fully legal moves for a given piece, adhering to all Brax enforcement constraints.
   */
  public getValidMoves(state: GameState, pieceId: string): MoveAction[] {
    if (state.result !== null) return [];

    const pieceInfo = findPieceCoord(state, pieceId);
    if (!pieceInfo) return [];

    const { piece, coord: fromCoord } = pieceInfo;

    // Must be this piece's turn
    if (piece.color !== state.turn) return [];

    // Brax enforcement: if Brax was called against this player, MUST move one of the threatened pieces!
    if (state.activeBrax !== null && state.activeBrax.victimColor === state.turn) {
      if (!state.activeBrax.threatenedPieceIds.includes(piece.id)) {
        // This piece is not threatened, so it CANNOT move!
        return [];
      }
    }

    const paths = getRawLegalPathsForPiece(state, piece, fromCoord, this.boardGraph);
    const validMoves: MoveAction[] = [];

    for (const path of paths) {
      // Check if player can call Brax with this move
      const simulated = this.simulateMoveWithoutBrax(state, path, pieceId);
      const threatsAfter = calculateThreats(simulated, state.turn, this.boardGraph);
      const newThreats = getThreatsCreatedByMove(threatsAfter, pieceId);
      const braxCheck = canPlayerCallBrax(state, state.turn, newThreats);

      // Base move without Brax
      validMoves.push({
        pieceId,
        to: path.p2,
        mid: path.p1,
        callBrax: false,
      });

      // If Brax is callable, also offer the option with callBrax: true
      if (braxCheck.allowed) {
        validMoves.push({
          pieceId,
          to: path.p2,
          mid: path.p1,
          callBrax: true,
        });
      }
    }

    return validMoves;
  }

  /**
   * True when at least one legal move of the active player would create a new
   * threat, i.e. when Brax can still be earned this turn.
   */
  private hasBraxableMove(state: GameState): boolean {
    if (state.result !== null) return false;

    for (const piece of Object.values(state.board)) {
      if (!piece || piece.color !== state.turn) continue;
      const moves = this.getValidMoves(state, piece.id);
      if (moves.some((m) => m.callBrax === true)) return true;
    }

    return false;
  }

  private simulateMoveWithoutBrax(
    state: GameState,
    path: MovePath,
    pieceId: string
  ): GameState {
    const pieceInfo = findPieceCoord(state, pieceId);
    if (!pieceInfo) return state;

    const newBoard = { ...state.board };
    newBoard[coordToKey(path.p0)] = null;
    newBoard[coordToKey(path.p2)] = pieceInfo.piece;

    return {
      ...state,
      board: newBoard,
    };
  }
}
