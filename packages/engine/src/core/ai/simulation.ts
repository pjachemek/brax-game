/**
 * Brax AI - Fast move generation and state transition for search.
 *
 * The rulebook's own `getValidMoves` / `applyMove` are the authority, but they
 * are built for correctness at a UI's pace: each recomputes the whole threat
 * map (and `applyMove` additionally probes every piece for stalemate) so that a
 * single call can answer "may I declare Brax here?" and "is the game over?".
 * A Master search runs thousands of positions per move, so this module answers
 * the two questions search actually asks — "where may this piece go?" and
 * "what does the board look like afterwards?" — straight off the board graph.
 *
 * It is not a second rulebook. Legality still comes from
 * `getRawLegalPathsForPiece`, capture resolution from `getCapturesAlongPath`,
 * and Brax enforcement is read off `state.activeBrax` exactly as the mode does.
 * What is left out is only what search does not need: threat maps, history
 * entries, algebraic notation and per-ply stalemate scans. The move the search
 * finally returns is handed back to the real engine, which validates it again.
 */

import type { GameState, MoveAction, NodeCoord, Piece, PlayerColor } from '../types.ts';
import { coordToKey } from '../geometry.ts';
import { BoardGraph, CANONICAL_BRAX_BOARD } from '../board.ts';
import { getCapturesAlongPath, getRawLegalPathsForPiece } from '../movement.ts';
import type { BotMove } from './types.ts';

/** Stable identity of a move, used as the key in trees and in the Experience Book. */
export function moveKey(move: BotMove | MoveAction): string {
  const mid = move.mid ? `@${move.mid.x},${move.mid.y}` : '';
  return `${move.pieceId}>${move.to.x},${move.to.y}${mid}`;
}

export function toMoveAction(move: BotMove, callBrax = false): MoveAction {
  return { pieceId: move.pieceId, to: move.to, mid: move.mid, callBrax };
}

/**
 * Every legal path the side to move has, as search candidates.
 *
 * Brax enforcement is applied here and nowhere else in the search: when a
 * declaration is standing against the side to move, only the named pieces may
 * answer it, so the whole subtree is generated from that reduced set.
 */
export function listBotMoves(
  state: GameState,
  boardGraph: BoardGraph = CANONICAL_BRAX_BOARD
): BotMove[] {
  if (state.result !== null) return [];

  const moves: BotMove[] = [];
  const mover = state.turn;
  const enforced =
    state.activeBrax !== null && state.activeBrax.victimColor === mover
      ? state.activeBrax.threatenedPieceIds
      : null;

  for (const [key, piece] of Object.entries(state.board)) {
    if (!piece || piece.color !== mover) continue;
    if (enforced && !enforced.includes(piece.id)) continue;

    const [xs, ys] = key.split(',');
    const from: NodeCoord = { x: Number(xs), y: Number(ys) };

    for (const path of getRawLegalPathsForPiece(state, piece, from, boardGraph)) {
      moves.push({
        pieceId: piece.id,
        from,
        to: path.p2,
        mid: path.p1,
        captures: getCapturesAlongPath(state, path, mover).length,
      });
    }
  }

  return moves;
}

/**
 * The position after `move`, cheaply.
 *
 * `history` is carried by reference rather than appended to: search never reads
 * it, and copying a growing array on every one of thousands of plies is the
 * single most expensive thing a naive simulator does. `activeBrax` is cleared
 * because the search never declares inside a line (see `shouldDeclareBrax`),
 * which is also why a declaration standing at the root correctly expires after
 * the victim has answered it.
 */
export function simulateMove(state: GameState, move: BotMove): GameState {
  const board: Record<string, Piece | null> = { ...state.board };
  const fromKey = coordToKey(move.from);
  const piece = board[fromKey];
  if (!piece) return state;

  board[fromKey] = null;
  if (move.mid) board[coordToKey(move.mid)] = null;
  board[coordToKey(move.to)] = piece;

  const mover = state.turn;
  const next: PlayerColor = mover === 'RED' ? 'BLUE' : 'RED';

  // The 1v1 no-progress counter decides draws, so search has to keep it or it
  // would happily "win" lines that the rules call a dead position.
  let counter = state.endgame1v1HalfMovesWithoutCapture;
  const { red, blue } = countPieces(board);
  if (red === 1 && blue === 1) {
    counter = move.captures > 0 ? 0 : counter + 1;
  } else {
    counter = 0;
  }

  return {
    ...state,
    board,
    turn: next,
    turnNumber: state.turnNumber + 1,
    activeBrax: null,
    endgame1v1HalfMovesWithoutCapture: counter,
  };
}

export function countPieces(board: Record<string, Piece | null>): { red: number; blue: number } {
  let red = 0;
  let blue = 0;
  for (const piece of Object.values(board)) {
    if (!piece) continue;
    if (piece.color === 'RED') red++;
    else blue++;
  }
  return { red, blue };
}

export type TerminalVerdict = { over: true; winner: PlayerColor | 'DRAW' } | { over: false };

/**
 * Termination as the rules define it, minus the expensive half.
 *
 * Annihilation and the 1v1 draw are counted off the board directly. Stalemate
 * is only *possible* once a side has no generated move, so the caller passes
 * the move list it already had to build anyway rather than paying for a second
 * scan.
 */
export function evaluateTerminal(state: GameState, legalMoves: BotMove[]): TerminalVerdict {
  if (state.result) return { over: true, winner: state.result.winner };

  const { red, blue } = countPieces(state.board);
  if (blue === 0) return { over: true, winner: 'RED' };
  if (red === 0) return { over: true, winner: 'BLUE' };
  if (state.endgame1v1HalfMovesWithoutCapture >= 10) return { over: true, winner: 'DRAW' };

  if (legalMoves.length === 0) {
    // The side to move is stalemated, which in Brax is a loss, not a draw.
    return { over: true, winner: state.turn === 'RED' ? 'BLUE' : 'RED' };
  }

  return { over: false };
}
