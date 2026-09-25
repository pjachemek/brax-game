/**
 * ReCheckers AI - Static evaluation and the ReCheckers declaration heuristic.
 *
 * A capped rollout usually stops in a position nobody has won yet, so the
 * search needs a number for "how does this look". Everything here returns a
 * score in 0..1 from one side's point of view, on the same scale as a terminal
 * result (win 1.0, loss 0.0, draw 0.5) - which is what lets backpropagation
 * treat cut-off and finished playouts identically.
 */

import type { GameState, PlayerColor } from '../types.ts';
import { BoardGraph, CANONICAL_RE_CHECKERS_BOARD } from '../board.ts';
import { getCapturesAlongPath, getRawLegalPathsForPiece } from '../movement.ts';
import { countPieces, listBotMoves, simulateMove } from './simulation.ts';
import type { BotMove } from './types.ts';

/** How much of the evaluation material accounts for, against tactical pressure. */
const MATERIAL_WEIGHT = 0.38;
const THREAT_WEIGHT = 0.12;

/**
 * Enemy pieces `color` could take right now, counted once each.
 *
 * This is the search's stand-in for `calculateThreats`, which builds a full
 * record per threat (attacker, path, coordinates) that nothing here reads. Both
 * victims of a sweeping double capture count, because both are equally gone at
 * the end of such a move.
 */
export function countThreatenedPieces(
  state: GameState,
  color: PlayerColor,
  boardGraph: BoardGraph = CANONICAL_RE_CHECKERS_BOARD
): number {
  const victims = new Set<string>();

  for (const [key, piece] of Object.entries(state.board)) {
    if (!piece || piece.color !== color) continue;
    const [xs, ys] = key.split(',');
    const from = { x: Number(xs), y: Number(ys) };

    for (const path of getRawLegalPathsForPiece(state, piece, from, boardGraph)) {
      for (const capture of getCapturesAlongPath(state, path, color)) {
        victims.add(capture.piece.id);
      }
    }
  }

  return victims.size;
}

/**
 * How good `state` looks for `color`, in 0..1.
 *
 * Material is normalised by the pieces still on the board rather than by the
 * starting seven, so being a piece up matters far more in a 2v1 endgame than it
 * does on move three - which is exactly how ReCheckers plays, since the right to
 * declare expires there and a single capture ends the game.
 */
export function evaluatePosition(
  state: GameState,
  color: PlayerColor,
  boardGraph: BoardGraph = CANONICAL_RE_CHECKERS_BOARD
): number {
  const { red, blue } = countPieces(state.board);
  const mine = color === 'RED' ? red : blue;
  const theirs = color === 'RED' ? blue : red;
  const total = mine + theirs;

  if (total === 0) return 0.5;
  if (theirs === 0) return 1;
  if (mine === 0) return 0;

  const material = (mine - theirs) / total; // -1..1

  const myThreats = countThreatenedPieces(state, color, boardGraph);
  const theirThreats = countThreatenedPieces(
    state,
    color === 'RED' ? 'BLUE' : 'RED',
    boardGraph
  );
  const threatTotal = myThreats + theirThreats;
  const threat = threatTotal === 0 ? 0 : (myThreats - theirThreats) / threatTotal;

  const score = 0.5 + MATERIAL_WEIGHT * material + THREAT_WEIGHT * threat;
  return Math.max(0, Math.min(1, score));
}

/**
 * Should the bot declare "Re-Checkers!" after playing `move`?
 *
 * Declaring is not free. It forces the opponent to answer with one of the
 * threatened pieces, which is a real restriction - but a threatened piece
 * moving is also a piece being *saved*, and a declaration that merely chases a
 * piece the bot was never going to take hands the opponent a tempo. So the test
 * is comparative: how much worse is the opponent's best reply once the
 * declaration has narrowed their choices, against their best reply if they were
 * free to play anything?
 *
 * The declaration is taken when it costs the opponent something material, and
 * declined when their forced set already contains a reply as good as any other.
 */
export function shouldDeclareReCheckers(
  state: GameState,
  move: BotMove,
  threatenedPieceIds: string[],
  boardGraph: BoardGraph = CANONICAL_RE_CHECKERS_BOARD
): boolean {
  if (threatenedPieceIds.length === 0) return false;

  const mover = state.turn;
  const after = simulateMove(state, move);
  const replies = listBotMoves(after, boardGraph);
  if (replies.length === 0) return true; // They cannot answer at all; take it.

  // Best reply the opponent has if nothing constrains them.
  const freeBest = bestReplyValue(after, replies, mover, boardGraph);

  const forced = replies.filter((reply) => threatenedPieceIds.includes(reply.pieceId));
  if (forced.length === 0) return true; // Every legal answer is outside the set.

  const forcedBest = bestReplyValue(after, forced, mover, boardGraph);

  // Higher is better *for the bot*, so a declaration is worth making when it
  // lifts the bot's worst case. The margin keeps the bot from declaring on a
  // difference that is pure evaluation noise.
  return forcedBest > freeBest + 0.01;
}

/** The value, to `perspective`, of the opponent's best reply among `replies`. */
function bestReplyValue(
  state: GameState,
  replies: BotMove[],
  perspective: PlayerColor,
  boardGraph: BoardGraph
): number {
  let worstForUs = Infinity;

  for (const reply of replies) {
    const value = evaluatePosition(simulateMove(state, reply), perspective, boardGraph);
    if (value < worstForUs) worstForUs = value;
  }

  return worstForUs === Infinity ? 0.5 : worstForUs;
}
