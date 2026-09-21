/**
 * Brax Rules Engine - Unit Test Suite (Vitest / Jest compatible)
 * Tests core movement, jump prohibition, Brax forcing, captures, and endgame mechanics.
 */

import { describe, it, expect } from 'vitest';
import { BraxEngine, getValidMoves, applyMove, validateMove } from '../engine.ts';
import { GameState, MoveAction, Piece } from '../types.ts';
import { CANONICAL_BRAX_BOARD } from '../board.ts';
import { coordToKey } from '../geometry.ts';

function createEmptyTestState(): GameState {
  const board: Record<string, Piece | null> = {};
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      board[`${x},${y}`] = null;
    }
  }

  return {
    board,
    turn: 'RED',
    turnNumber: 1,
    capturedPieces: { RED: [], BLUE: [] },
    activeBrax: null,
    lastBraxCallTurn: { RED: null, BLUE: null },
    history: [],
    result: null,
    gameModeId: 'two_player',
    endgame1v1HalfMovesWithoutCapture: 0,
  };
}

describe('Brax Rules Engine - Geometry & Movement', () => {
  const engine = new BraxEngine(CANONICAL_BRAX_BOARD);

  it('initializes standard two-player classic board correctly', () => {
    const state = engine.initGame('two_player');
    expect(state.turn).toBe('RED');
    expect(state.turnNumber).toBe(1);

    // Check RED pieces on (1,0) to (7,0) [B1-H1]
    for (let x = 1; x <= 7; x++) {
      const piece = state.board[`${x},0`];
      expect(piece).not.toBeNull();
      expect(piece?.color).toBe('RED');
      expect(piece?.id).toBe(`R${x}`);
    }

    // Check BLUE pieces on (1,8) to (7,8) [B9-H9]
    for (let x = 1; x <= 7; x++) {
      const piece = state.board[`${x},8`];
      expect(piece).not.toBeNull();
      expect(piece?.color).toBe('BLUE');
      expect(piece?.id).toBe(`B${x}`);
    }

    // Check corners are empty
    expect(state.board['0,0']).toBeNull();
    expect(state.board['8,0']).toBeNull();
    expect(state.board['0,8']).toBeNull();
    expect(state.board['8,8']).toBeNull();
  });

  it('colors every segment exactly as the official board artwork does', () => {
    // Transcribed from "Brax board -vI.svg". Rows run bottom-up in engine
    // coordinates (y = 0 is algebraic row 1, RED's home rank), so this table is the
    // artwork read from its bottom edge upwards.
    const HORIZONTAL = [
      'BBRRBBRR', // row 1
      'RBRBRBRB', // row 2
      'RRBBRRBB', // row 3
      'RBRBRBRB', // row 4
      'BBRRBBRR', // row 5
      'RBRBRBRB', // row 6
      'RRBBRRBB', // row 7
      'RBRBRBRB', // row 8
      'BBRRBBRR', // row 9
    ];
    const VERTICAL = [
      'RRBRRRBRR', // row 1 -> 2
      'RBBBRBBBR', // row 2 -> 3
      'BRRRBRRRB', // row 3 -> 4
      'BBRBBBRBB', // row 4 -> 5
      'RRBRRRBRR', // row 5 -> 6
      'RBBBRBBBR', // row 6 -> 7
      'BRRRBRRRB', // row 7 -> 8
      'BBRBBBRBB', // row 8 -> 9
    ];

    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 8; x++) {
        const expected = HORIZONTAL[y][x] === 'R' ? 'RED' : 'BLUE';
        const actual = CANONICAL_BRAX_BOARD.getEdgeColor({ x, y }, { x: x + 1, y });
        expect(`h ${x},${y} = ${actual}`).toBe(`h ${x},${y} = ${expected}`);
      }
    }

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 9; x++) {
        const expected = VERTICAL[y][x] === 'R' ? 'RED' : 'BLUE';
        const actual = CANONICAL_BRAX_BOARD.getEdgeColor({ x, y }, { x, y: y + 1 });
        expect(`v ${x},${y} = ${actual}`).toBe(`v ${x},${y} = ${expected}`);
      }
    }

    // The artwork splits the 144 segments evenly between the two players.
    const edges = CANONICAL_BRAX_BOARD.getAllEdges();
    expect(edges.length).toBe(144);
    expect(edges.filter((e) => e.color === 'RED').length).toBe(72);
  });

  it('1. permits move of 2 along own color with 90-degree turn', () => {
    const state = createEmptyTestState();

    // From (1,0) [B1]:
    // (1,0) -> (1,1) vertical edge is RED (odd column, even minY -> RED)
    // (1,1) -> (0,1) horizontal edge is RED (odd row, even minX -> RED)
    // Both segments are RED, forming a 90-degree turn: (1,0) -> (1,1) -> (0,1).
    const redPiece: Piece = { id: 'R1', color: 'RED', side: 'PLAIN' };
    state.board['1,0'] = redPiece;

    const validMoves = engine.getValidMoves(state, 'R1');
    const move90Deg = validMoves.find((m) => m.to.x === 0 && m.to.y === 1);

    expect(move90Deg).toBeDefined();
    expect(move90Deg?.mid).toEqual({ x: 1, y: 1 });

    // Validate move explicitly
    const moveAction: MoveAction = {
      pieceId: 'R1',
      to: { x: 0, y: 1 },
      mid: { x: 1, y: 1 },
    };
    const validation = engine.validateMove(state, moveAction);
    expect(validation.valid).toBe(true);
    expect(validation.path?.distance).toBe(2);

    // Apply move and verify updated state
    const nextState = engine.applyMove(state, moveAction);
    expect(nextState.board['1,0']).toBeNull();
    expect(nextState.board['1,1']).toBeNull(); // intermediate was not placed
    expect(nextState.board['0,1']?.id).toBe('R1');
    expect(nextState.turn).toBe('BLUE');
  });

  it('2. forbids move of 2 when intermediate node P1 is not empty (no jumping over pieces)', () => {
    const state = createEmptyTestState();

    // Starting RED piece at (1,0)
    state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };

    // Place an obstacle piece (friendly or enemy) at intermediate node (1,1)
    state.board['1,1'] = { id: 'BLOCKER', color: 'BLUE', side: 'PLAIN' };

    // Valid moves for R1 should NOT contain (0,1) via (1,1)
    const validMoves = engine.getValidMoves(state, 'R1');
    const jumpAttempt = validMoves.find((m) => m.to.x === 0 && m.to.y === 1);
    expect(jumpAttempt).toBeUndefined();

    // Explicitly validating a jump must return valid: false
    const blockedAction: MoveAction = {
      pieceId: 'R1',
      to: { x: 0, y: 1 },
      mid: { x: 1, y: 1 },
    };
    const validation = engine.validateMove(state, blockedAction);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('legal path');
  });

  it('3. forces movement of threatened piece following callBrax', () => {
    const state = createEmptyTestState();

    // Setup RED piece at (1,0) and two BLUE pieces:
    // B1 at (1,1) (threatened by distance 1 attack from (1,0))
    // B2 at (7,7) (safe elsewhere on the board)
    state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    state.board['2,0'] = { id: 'R2', color: 'RED', side: 'PLAIN' };
    state.board['3,1'] = { id: 'B1', color: 'BLUE', side: 'PLAIN' };
    state.board['7,7'] = { id: 'B2', color: 'BLUE', side: 'PLAIN' };

    // RED moves R1 from (1,0) to (2,1) [90-degree turn via (1,1) which is currently empty]
    // Wait, let's put B1 at (2,1) or have R1 move to (3,0) to threaten B1 at (3,1).
    // Let's set:
    // (2,0) -> (3,0) distance 1 move by R2 puts it adjacent to B1 at (3,1)!
    const moveR2: MoveAction = {
      pieceId: 'R2',
      to: { x: 3, y: 0 },
      callBrax: true,
    };

    const validation = engine.validateMove(state, moveR2);
    expect(validation.valid).toBe(true);

    const stateAfterBrax = engine.applyMove(state, moveR2);

    // Verify Brax enforcement is active
    expect(stateAfterBrax.activeBrax).not.toBeNull();
    expect(stateAfterBrax.activeBrax?.callerColor).toBe('RED');
    expect(stateAfterBrax.activeBrax?.victimColor).toBe('BLUE');
    expect(stateAfterBrax.activeBrax?.threatenedPieceIds).toContain('B1');
    expect(stateAfterBrax.activeBrax?.threatenedPieceIds).not.toContain('B2');

    // On BLUE's turn:
    expect(stateAfterBrax.turn).toBe('BLUE');

    // B2 is NOT threatened -> getValidMoves must return empty array!
    const b2Moves = engine.getValidMoves(stateAfterBrax, 'B2');
    expect(b2Moves).toEqual([]);

    // B1 IS threatened -> getValidMoves must contain legal escape/moves
    const b1Moves = engine.getValidMoves(stateAfterBrax, 'B1');
    expect(b1Moves.length).toBeGreaterThan(0);

    // Attempting to move B2 anyway must fail validation
    const illegalB2Move: MoveAction = {
      pieceId: 'B2',
      to: { x: 7, y: 8 },
    };
    const b2Validation = engine.validateMove(stateAfterBrax, illegalB2Move);
    expect(b2Validation.valid).toBe(false);
    expect(b2Validation.reason).toContain('Brax was called');

    // Executing legal move with threatened piece B1 resolves Brax
    const legalB1Move: MoveAction = {
      pieceId: 'B1',
      to: b1Moves[0].to,
    };
    const stateAfterEscape = engine.applyMove(stateAfterBrax, legalB1Move);
    expect(stateAfterEscape.turn).toBe('RED');
    // Brax enforcement fulfilled
    expect(stateAfterEscape.activeBrax).toBeNull();
  });

  it('3b. refuses Brax for a move whose piece creates no threat, even while an older threat stands', () => {
    const state = createEmptyTestState();

    // R2 already threatens B1 - that threat was established on an earlier turn.
    state.board['2,0'] = { id: 'R2', color: 'RED', side: 'PLAIN' };
    state.board['3,1'] = { id: 'B1', color: 'BLUE', side: 'PLAIN' };
    // R1 sits far away and cannot reach any BLUE piece.
    state.board['0,6'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    state.board['7,7'] = { id: 'B2', color: 'BLUE', side: 'PLAIN' };

    // The standing threat must not be replayable by moving an unrelated piece.
    const r1Moves = engine.getValidMoves(state, 'R1');
    expect(r1Moves.length).toBeGreaterThan(0);
    expect(r1Moves.some((m) => m.callBrax === true)).toBe(false);

    const declaringMove: MoveAction = {
      pieceId: 'R1',
      to: r1Moves[0].to,
      mid: r1Moves[0].mid,
      callBrax: true,
    };

    const validation = engine.validateMove(state, declaringMove);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('does not create a new threat');

    // Played plainly the move is legal, and it leaves no Brax enforcement behind.
    const next = engine.applyMove(state, { ...declaringMove, callBrax: false });
    expect(next.activeBrax).toBeNull();
  });

  it('4. executes capture at destination node P2 during distance 2 move', () => {
    const state = createEmptyTestState();

    // RED at (1,0), intermediate (1,1) is EMPTY
    state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };

    // BLUE enemy piece waiting at destination P2 (0,1)
    state.board['0,1'] = { id: 'ENEMY_B', color: 'BLUE', side: 'PLAIN' };

    const captureAction: MoveAction = {
      pieceId: 'R1',
      to: { x: 0, y: 1 },
      mid: { x: 1, y: 1 },
    };

    const validation = engine.validateMove(state, captureAction);
    expect(validation.valid).toBe(true);

    const stateAfterCapture = engine.applyMove(state, captureAction);

    // Verify board changes
    expect(stateAfterCapture.board['1,0']).toBeNull();
    expect(stateAfterCapture.board['1,1']).toBeNull();
    expect(stateAfterCapture.board['0,1']?.id).toBe('R1');
    expect(stateAfterCapture.board['0,1']?.color).toBe('RED');

    // Verify captured piece records
    expect(stateAfterCapture.capturedPieces.RED.length).toBe(1);
    expect(stateAfterCapture.capturedPieces.RED[0].id).toBe('ENEMY_B');
    expect(stateAfterCapture.history[0].capturedPiece?.id).toBe('ENEMY_B');
  });

  it('executes distance 1 capture of an adjacent enemy piece along any segment color', () => {
    const state = createEmptyTestState();

    // RED at (1,1), BLUE at (1,2) - adjacent orthogonal node
    state.board['1,1'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    state.board['1,2'] = { id: 'B_ADJACENT', color: 'BLUE', side: 'PLAIN' };
    state.board['8,8'] = { id: 'B_SAFE', color: 'BLUE', side: 'PLAIN' };

    const capture1Step: MoveAction = {
      pieceId: 'R1',
      to: { x: 1, y: 2 },
    };

    const val = engine.validateMove(state, capture1Step);
    expect(val.valid).toBe(true);

    const next = engine.applyMove(state, capture1Step);
    expect(next.board['1,1']).toBeNull();
    expect(next.board['1,2']?.id).toBe('R1');
    expect(next.capturedPieces.RED.length).toBe(1);
    expect(next.capturedPieces.RED[0].id).toBe('B_ADJACENT');
  });

  it('capturing the last remaining opponent piece results in immediate victory', () => {
    const state = createEmptyTestState();

    state.board['1,1'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    state.board['1,2'] = { id: 'LAST_BLUE', color: 'BLUE', side: 'PLAIN' };

    const finalCapture: MoveAction = {
      pieceId: 'R1',
      to: { x: 1, y: 2 },
    };

    const next = engine.applyMove(state, finalCapture);
    expect(next.board['1,2']?.id).toBe('R1');
    expect(next.capturedPieces.RED.length).toBe(1);
    expect(next.result).not.toBeNull();
    expect(next.result?.winner).toBe('RED');
    expect(next.result?.reason).toBe('ALL_PIECES_CAPTURED');
  });

  it('permanently disables Brax calling when pieces reach 2:1 endgame', () => {
    const state = createEmptyTestState();

    // 2 RED pieces and 1 BLUE piece (2:1 endgame)
    state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    state.board['7,0'] = { id: 'R2', color: 'RED', side: 'PLAIN' };
    state.board['1,1'] = { id: 'B1', color: 'BLUE', side: 'PLAIN' };

    // Moving R2 to threaten B1 or calling Brax
    // In a 2:1 state, Brax must be rejected
    const moveWithBrax: MoveAction = {
      pieceId: 'R1',
      to: { x: 0, y: 0 },
      callBrax: true,
    };

    const validation = engine.validateMove(state, moveWithBrax);
    // Even if threat existed, Brax in 2:1 state must be disallowed
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('2:1');
  });

  it('supports full state serialization and deserialization without data loss', () => {
    const state = engine.initGame('two_player');
    const serialized = engine.serialize(state);
    const restored = engine.deserialize(serialized);

    expect(restored.turn).toBe(state.turn);
    expect(restored.turnNumber).toBe(state.turnNumber);
    expect(restored.gameModeId).toBe('two_player');
    expect(restored.board['1,0']?.id).toBe('R1');
  });
});
