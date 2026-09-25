/**
 * ReCheckers Rules Engine - Movement Validation & Path Finding
 * Calculates distance 1 and distance 2 moves adhering to official ReCheckers rules.
 */

import {
  NodeCoord,
  Piece,
  PlayerColor,
  MoveAction,
  MovePath,
  ValidationResult,
  GameState,
} from './types.ts';
import {
  areCoordsEqual,
  coordToKey,
  getOrthogonalNeighbors,
  isValidCoord,
} from './geometry.ts';
import { BoardGraph, CANONICAL_RE_CHECKERS_BOARD } from './board.ts';

/**
 * Finds the coordinate of a piece by ID in the given game state board.
 */
export function findPieceCoord(
  state: GameState,
  pieceId: string
): { coord: NodeCoord; piece: Piece } | null {
  for (const [key, piece] of Object.entries(state.board)) {
    if (piece && piece.id === pieceId) {
      const parts = key.split(',');
      return {
        coord: { x: parseInt(parts[0], 10), y: parseInt(parts[1], 10) },
        piece,
      };
    }
  }
  return null;
}

/**
 * Retrieves piece located at a specific coordinate, or null if empty.
 */
export function getPieceAt(state: GameState, coord: NodeCoord): Piece | null {
  if (!isValidCoord(coord)) return null;
  const key = coordToKey(coord);
  return state.board[key] ?? null;
}

/**
 * Enemy pieces displaced by walking `path`, in travel order.
 *
 * A move captures on the node it lands on, and - on a distance 2 path whose
 * intermediate node is also held by an enemy - on that node too. Both are read
 * off the path here, which is safe because the legality rule above admits an
 * occupied intermediate node *only* in the take-two case: a path that merely
 * hops over one piece is never legal, so it never reaches this function.
 * Everything that needs to know what a move takes off the board - applyMove,
 * threat calculation, the UI - asks here rather than re-deriving the rule.
 */
export function getCapturesAlongPath(
  state: GameState,
  path: MovePath,
  movingColor: PlayerColor
): Array<{ coord: NodeCoord; piece: Piece }> {
  const captures: Array<{ coord: NodeCoord; piece: Piece }> = [];

  for (const coord of [path.p1, path.p2]) {
    if (!coord) continue;
    const piece = getPieceAt(state, coord);
    if (piece && piece.color !== movingColor) {
      captures.push({ coord, piece });
    }
  }

  return captures;
}

/**
 * Finds all legal distance 1 and distance 2 movement paths for a piece from its current location,
 * ignoring turn restrictions and ReCheckers forcing (raw kinematic legality).
 */
export function getRawLegalPathsForPiece(
  state: GameState,
  piece: Piece,
  fromCoord: NodeCoord,
  boardGraph: BoardGraph = CANONICAL_RE_CHECKERS_BOARD
): MovePath[] {
  const paths: MovePath[] = [];
  const pieceColor = piece.color;

  // -------------------------------------------------------------
  // 1. Distance 1 moves
  // Can move along ANY connected segment (own or opponent's color).
  // Target node cannot contain a friendly piece (empty or enemy).
  // -------------------------------------------------------------
  const neighbors = boardGraph.getNeighbors(fromCoord);
  for (const neighbor of neighbors) {
    const destPiece = getPieceAt(state, neighbor.coord);
    if (!destPiece || destPiece.color !== pieceColor) {
      paths.push({
        p0: fromCoord,
        p2: neighbor.coord,
        distance: 1,
      });
    }
  }

  // -------------------------------------------------------------
  // 2. Distance 2 moves
  // Allowed ONLY when BOTH consecutive segments are of piece's OWN color.
  // Path: P0 -> P1 -> P2.
  // - P1 connected to P0 via segment of pieceColor.
  // - P1 must be empty, OR hold an enemy that is taken together with a second
  //   enemy on P2. Nothing is ever merely jumped over: passing an occupied node
  //   is not a way to travel, it is the shape of the double capture and nothing
  //   else. So an enemy on P1 with an EMPTY P2 is illegal - that would be a hop
  //   over one piece - while an enemy on P1 and an enemy on P2 takes both. A
  //   FRIENDLY piece on P1 always blocks; own pieces are never passed at all.
  // - P2 connected to P1 via segment of pieceColor.
  // - P2 != P0 (no backtracking to starting node).
  // - P2 cannot contain a friendly piece (can be empty or enemy piece).
  // -------------------------------------------------------------
  const step1Candidates = boardGraph.getNeighborsByColor(fromCoord, pieceColor);

  for (const p1 of step1Candidates) {
    // Own pieces block the path outright.
    const pieceAtP1 = getPieceAt(state, p1);
    if (pieceAtP1 !== null && pieceAtP1.color === pieceColor) {
      continue;
    }

    // An enemy standing here is passable only as half of a double capture, so
    // this path now owes a second enemy on the destination.
    const owesSecondCapture = pieceAtP1 !== null;

    const step2Candidates = boardGraph.getNeighborsByColor(p1, pieceColor);
    for (const p2 of step2Candidates) {
      // Must not return to start node
      if (areCoordsEqual(p2, fromCoord)) {
        continue;
      }

      // Destination cannot contain a friendly piece
      const destPiece = getPieceAt(state, p2);
      // Passing an enemy on P1 only buys a move if a second enemy is taken here.
      if (owesSecondCapture && destPiece === null) {
        continue;
      }
      if (!destPiece || destPiece.color !== pieceColor) {
        // Prevent duplicate paths to the same P2 with identical intermediate P1
        const alreadyExists = paths.some(
          (path) =>
            path.distance === 2 &&
            path.p1 &&
            areCoordsEqual(path.p1, p1) &&
            areCoordsEqual(path.p2, p2)
        );

        if (!alreadyExists) {
          paths.push({
            p0: fromCoord,
            p1,
            p2,
            distance: 2,
          });
        }
      }
    }
  }

  return paths;
}

/**
 * Validates a proposed move action against board rules, piece ownership, and ReCheckers enforcement.
 */
export function validateMoveAction(
  state: GameState,
  move: MoveAction,
  boardGraph: BoardGraph = CANONICAL_RE_CHECKERS_BOARD
): ValidationResult {
  if (state.result !== null) {
    return { valid: false, reason: 'Game has already ended.' };
  }

  const pieceInfo = findPieceCoord(state, move.pieceId);
  if (!pieceInfo) {
    return { valid: false, reason: `Piece with ID "${move.pieceId}" not found on board.` };
  }

  const { piece, coord: fromCoord } = pieceInfo;

  // Verify turn ownership
  if (piece.color !== state.turn) {
    return {
      valid: false,
      reason: `It is ${state.turn}'s turn, but piece belongs to ${piece.color}.`,
    };
  }

  // Verify ReCheckers enforcement (victim must move one of the threatened pieces)
  if (state.activeReCheckers !== null && state.activeReCheckers.victimColor === state.turn) {
    const isThreatenedPiece = state.activeReCheckers.threatenedPieceIds.includes(piece.id);
    if (!isThreatenedPiece) {
      return {
        valid: false,
        reason: `ReCheckers was called! You must move one of the threatened pieces (${state.activeReCheckers.threatenedPieceIds.join(
          ', '
        )}).`,
      };
    }
  }

  // Validate target coordinate
  if (!isValidCoord(move.to)) {
    return { valid: false, reason: 'Destination coordinate is out of bounds.' };
  }

  if (areCoordsEqual(fromCoord, move.to)) {
    return { valid: false, reason: 'Cannot move to the current piece location.' };
  }

  // Destination cannot contain a friendly piece
  const destPiece = getPieceAt(state, move.to);
  if (destPiece && destPiece.color === piece.color) {
    return { valid: false, reason: 'Destination is occupied by your own piece.' };
  }

  // Find matching legal paths for this destination
  const allLegalPaths = getRawLegalPathsForPiece(state, piece, fromCoord, boardGraph);
  const matchingPaths = allLegalPaths.filter((path) => areCoordsEqual(path.p2, move.to));

  if (matchingPaths.length === 0) {
    // Check if intermediate node blockage was the reason
    const dx = Math.abs(fromCoord.x - move.to.x);
    const dy = Math.abs(fromCoord.y - move.to.y);
    const distManhattan = dx + dy;

    if (distManhattan === 2) {
      return {
        valid: false,
        reason:
          'No legal path to destination. A 2-step move requires both segments to be your color and the destination not your piece. The intermediate node must be empty, or hold an enemy that is captured together with a second enemy on the destination - a lone piece is never jumped over.',
      };
    }

    return { valid: false, reason: 'Destination is not reachable via any legal move path.' };
  }

  // If player specified an intermediate node (mid), find path matching that mid
  let chosenPath: MovePath;
  if (move.mid) {
    const specificPath = matchingPaths.find(
      (p) => p.distance === 2 && p.p1 && areCoordsEqual(p.p1, move.mid!)
    );
    if (!specificPath) {
      return {
        valid: false,
        reason: `Specified intermediate node (${move.mid.x},${move.mid.y}) is not a valid intermediate step for this move.`,
      };
    }
    chosenPath = specificPath;
  } else {
    // Prefer distance 1 if available, otherwise take the first valid distance 2 path
    chosenPath = matchingPaths[0];
  }

  return {
    valid: true,
    normalizedMove: {
      pieceId: move.pieceId,
      to: move.to,
      mid: chosenPath.p1,
      callReCheckers: Boolean(move.callReCheckers),
    },
    path: chosenPath,
  };
}
