/**
 * Brax Rules Engine - Lightweight Bot / AI Player
 * Selects strategic Brax moves for solo play or automated game simulations.
 */

import { GameState, MoveAction, PlayerColor } from './types.ts';
import { BraxEngine } from './engine.ts';
import { getPieceAt } from './movement.ts';

export function chooseBestMove(
  engine: BraxEngine,
  state: GameState,
  botColor: PlayerColor = 'BLUE'
): MoveAction | null {
  if (state.turn !== botColor || state.result !== null) {
    return null;
  }

  const allLegalMoves = engine.getAllValidMoves(state);
  if (allLegalMoves.length === 0) {
    return null;
  }

  // Score candidate moves:
  // 1. Capturing an opponent piece: +100
  // 2. Calling Brax: +60
  // 3. Moving a threatened piece when under Brax enforcement: +50
  // 4. Distance 2 moves: +10
  // 5. Advancing closer to center or opponent rank: +1..5
  let bestScore = -Infinity;
  let bestMove = allLegalMoves[0];

  for (const move of allLegalMoves) {
    let score = 0;

    // Check captures: the node landed on, plus the intermediate node of a double
    // capture, so taking two outweighs taking one.
    const destPiece = getPieceAt(state, move.to);
    if (destPiece && destPiece.color !== botColor) {
      score += 100;
    }
    if (move.mid) {
      const midPiece = getPieceAt(state, move.mid);
      if (midPiece && midPiece.color !== botColor) {
        score += 100;
      }
    }

    // Check Brax calling bonus
    if (move.callBrax) {
      score += 60;
    }

    // Distance 2 mobility bonus
    if (move.mid) {
      score += 10;
    }

    // Centralization preference
    const distFromCenter = Math.abs(move.to.x - 4) + Math.abs(move.to.y - 4);
    score += 8 - distFromCenter;

    // Small random tie-breaker
    score += Math.random() * 2;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}
