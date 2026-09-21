/**
 * Brax Rules Engine - Threat Calculation & Brax State Machine
 * Calculates enemy pieces threatened by legal attacks and manages Brax eligibility.
 */

import {
  GameState,
  PlayerColor,
  Piece,
  NodeCoord,
  ThreatenedPieceInfo,
  MovePath,
} from './types.ts';
import { areCoordsEqual, coordToKey, isValidCoord } from './geometry.ts';
import { BoardGraph, CANONICAL_BRAX_BOARD } from './board.ts';
import { getRawLegalPathsForPiece, getCapturesAlongPath } from './movement.ts';

/**
 * Calculates all enemy pieces that are currently threatened by pieces of the attacker color.
 * A piece A threatens enemy piece B if A has a legal move (distance 1 or 2) ending on B's node.
 */
export function calculateThreats(
  state: GameState,
  attackerColor: PlayerColor,
  boardGraph: BoardGraph = CANONICAL_BRAX_BOARD
): ThreatenedPieceInfo[] {
  const threats: ThreatenedPieceInfo[] = [];
  const enemyColor: PlayerColor = attackerColor === 'RED' ? 'BLUE' : 'RED';

  // Gather all active pieces
  const attackerPieces: Array<{ coord: NodeCoord; piece: Piece }> = [];
  const enemyPieces: Array<{ coord: NodeCoord; piece: Piece }> = [];

  for (const [key, piece] of Object.entries(state.board)) {
    if (piece) {
      const [xStr, yStr] = key.split(',');
      const coord = { x: parseInt(xStr, 10), y: parseInt(yStr, 10) };
      if (piece.color === attackerColor) {
        attackerPieces.push({ coord, piece });
      } else if (piece.color === enemyColor) {
        enemyPieces.push({ coord, piece });
      }
    }
  }

  // For each attacker piece, compute its raw legal moves
  for (const { coord: fromCoord, piece: attackerPiece } of attackerPieces) {
    const legalPaths = getRawLegalPathsForPiece(state, attackerPiece, fromCoord, boardGraph);

    for (const path of legalPaths) {
      // A move threatens every enemy piece it would displace: the one it passes
      // over on a distance 2 path as well as the one it lands on. Both are just
      // as captured at the end of the turn, so both are legitimate Brax targets.
      const capturedByPath = getCapturesAlongPath(state, path, attackerColor);

      for (const { coord: targetCoord, piece: targetPiece } of capturedByPath) {
        // Prevent duplicate records for the same attacker piece and target piece
        const alreadyRecorded = threats.some(
          (t) =>
            t.threatenedPieceId === targetPiece.id &&
            t.threatenedByPieceId === attackerPiece.id &&
            areCoordsEqual(t.threatenedCoord, targetCoord)
        );

        if (!alreadyRecorded) {
          threats.push({
            threatenedPieceId: targetPiece.id,
            threatenedColor: targetPiece.color,
            threatenedCoord: targetCoord,
            threatenedByPieceId: attackerPiece.id,
            threatenedByColor: attackerPiece.color,
            threatenedByCoord: fromCoord,
            attackPath: path,
          });
        }
      }
    }
  }

  return threats;
}

/**
 * Returns the threats that the piece which has just moved creates from its new
 * position.
 *
 * Brax is declared on a move that *creates* a threat ("po ruchu stwarzającym
 * zagrożenie"), so only the moved piece can justify the declaration. Without
 * this filter any threat standing anywhere on the board - including one
 * established several turns earlier by a completely different piece - would let
 * a player declare Brax again on every subsequent move, replaying an old Brax.
 */
export function getThreatsCreatedByMove(
  threatsAfterMove: ThreatenedPieceInfo[],
  movedPieceId: string
): ThreatenedPieceInfo[] {
  return threatsAfterMove.filter((threat) => threat.threatenedByPieceId === movedPieceId);
}

/**
 * Returns a unique array of threatened enemy piece IDs.
 */
export function getUniqueThreatenedPieceIds(threats: ThreatenedPieceInfo[]): string[] {
  const ids = new Set<string>();
  for (const t of threats) {
    ids.add(t.threatenedPieceId);
  }
  return Array.from(ids);
}

/**
 * Checks if the board state has reached a 2:1 (or 1:1) endgame scenario where
 * the right to call Brax is permanently revoked for both players.
 *
 * Rule: "Jeśli stosunek pionków to 2:1 (jeden gracz ma 1 pionek, drugi 2),
 * prawo do Braxowania wygasa dla obu stron permanentnie."
 */
export function isEndgame1v2(state: GameState): boolean {
  let redCount = 0;
  let blueCount = 0;

  for (const piece of Object.values(state.board)) {
    if (piece) {
      if (piece.color === 'RED') redCount++;
      else if (piece.color === 'BLUE') blueCount++;
    }
  }

  // 2:1 or 1:2 condition, or 1:1
  if (
    (redCount === 1 && blueCount === 2) ||
    (redCount === 2 && blueCount === 1) ||
    (redCount === 1 && blueCount === 1)
  ) {
    return true;
  }

  return false;
}

/**
 * Determines whether a player has the legal right to declare "Brax" upon completing their move.
 */
export function canPlayerCallBrax(
  state: GameState,
  playerColor: PlayerColor,
  newThreats: ThreatenedPieceInfo[]
): { allowed: boolean; reason?: string } {
  // 1. Must be the player's turn
  if (state.turn !== playerColor) {
    return {
      allowed: false,
      reason: 'Cannot call Brax on opponent’s turn.',
    };
  }

  // 2. 2:1 Endgame condition
  if (isEndgame1v2(state)) {
    return {
      allowed: false,
      reason: 'Brax cannot be called in a 2:1 (or 1:1) endgame. The right has permanently expired.',
    };
  }

  // 3. The move must CREATE a threat. A threat that was already on the board
  //    before this move does not entitle the player to declare Brax again.
  if (newThreats.length === 0) {
    return {
      allowed: false,
      reason: 'This move does not create a new threat on an enemy piece.',
    };
  }

  return { allowed: true };
}
