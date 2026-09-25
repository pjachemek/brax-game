/**
 * ReCheckers Rules Engine - Unit Test Suite (Vitest / Jest compatible)
 * Tests core movement, jump prohibition, ReCheckers forcing, captures, and endgame mechanics.
 */

import { describe, it, expect } from 'vitest';
import { ReCheckersEngine, getValidMoves, applyMove, validateMove } from '../engine.ts';
import { GameState, MoveAction, Piece } from '../types.ts';
import { CANONICAL_RE_CHECKERS_BOARD } from '../board.ts';
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
    activeReCheckers: null,
    lastReCheckersCallTurn: { RED: null, BLUE: null },
    history: [],
    result: null,
    gameModeId: 'two_player',
    endgame1v1HalfMovesWithoutCapture: 0,
  };
}

describe('ReCheckers Rules Engine - Geometry & Movement', () => {
  const engine = new ReCheckersEngine(CANONICAL_RE_CHECKERS_BOARD);

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
    // Transcribed from "ReCheckers board -vI.svg". Rows run bottom-up in engine
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
        const actual = CANONICAL_RE_CHECKERS_BOARD.getEdgeColor({ x, y }, { x: x + 1, y });
        expect(`h ${x},${y} = ${actual}`).toBe(`h ${x},${y} = ${expected}`);
      }
    }

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 9; x++) {
        const expected = VERTICAL[y][x] === 'R' ? 'RED' : 'BLUE';
        const actual = CANONICAL_RE_CHECKERS_BOARD.getEdgeColor({ x, y }, { x, y: y + 1 });
        expect(`v ${x},${y} = ${actual}`).toBe(`v ${x},${y} = ${expected}`);
      }
    }

    // The artwork splits the 144 segments evenly between the two players.
    const edges = CANONICAL_RE_CHECKERS_BOARD.getAllEdges();
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

  it('2. forbids move of 2 when intermediate node P1 holds a friendly piece (no jumping own pieces)', () => {
    const state = createEmptyTestState();

    // Starting RED piece at (1,0)
    state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };

    // Place a FRIENDLY obstacle at intermediate node (1,1).
    state.board['1,1'] = { id: 'BLOCKER', color: 'RED', side: 'PLAIN' };

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

  it('2b. captures two enemy pieces in one turn when both stand on the path', () => {
    const state = createEmptyTestState();

    // RED at (1,0) with enemies on both nodes of the (1,0) -> (1,1) -> (0,1) path.
    // This is the one case in which an occupied intermediate node may be passed:
    // it is passed because it is being taken, together with the destination.
    state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    state.board['1,1'] = { id: 'B_MID', color: 'BLUE', side: 'PLAIN' };
    state.board['0,1'] = { id: 'B_DEST', color: 'BLUE', side: 'PLAIN' };
    state.board['8,8'] = { id: 'B_SAFE', color: 'BLUE', side: 'PLAIN' };

    const doubleCapture: MoveAction = {
      pieceId: 'R1',
      to: { x: 0, y: 1 },
      mid: { x: 1, y: 1 },
    };

    // The move is offered by the engine, not merely accepted when asked for
    const offered = engine.getValidMoves(state, 'R1');
    expect(
      offered.some((m) => m.to.x === 0 && m.to.y === 1 && m.mid?.x === 1 && m.mid?.y === 1)
    ).toBe(true);

    expect(engine.validateMove(state, doubleCapture).valid).toBe(true);

    const next = engine.applyMove(state, doubleCapture);
    expect(next.board['1,0']).toBeNull();
    expect(next.board['1,1']).toBeNull(); // taken on the way through
    expect(next.board['0,1']?.id).toBe('R1');

    expect(next.capturedPieces.RED.map((p) => p.id)).toEqual(['B_MID', 'B_DEST']);
    expect(next.history[0].capturedPieces?.map((p) => p.id)).toEqual(['B_MID', 'B_DEST']);
    // Both segments carry an "x" when both nodes are taken.
    expect(next.history[0].algebraic).toBe('B1xB2xA2');
  });

  it('2c. forbids passing a lone enemy onto an EMPTY destination - that is a jump, not a capture', () => {
    const state = createEmptyTestState();

    // Same path as 2b, but the destination is empty, so only one piece would be
    // taken. Passing an occupied node is allowed only as half of a double
    // capture, so this move does not exist.
    state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    state.board['1,1'] = { id: 'B_MID', color: 'BLUE', side: 'PLAIN' };
    state.board['8,8'] = { id: 'B_SAFE', color: 'BLUE', side: 'PLAIN' };

    const offered = engine.getValidMoves(state, 'R1');
    expect(
      offered.some((m) => m.to.x === 0 && m.to.y === 1 && m.mid?.x === 1 && m.mid?.y === 1)
    ).toBe(false);

    const hop: MoveAction = {
      pieceId: 'R1',
      to: { x: 0, y: 1 },
      mid: { x: 1, y: 1 },
    };
    const validation = engine.validateMove(state, hop);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('legal path');

    // The lone enemy is still taken the ordinary way: by landing on it.
    expect(offered.some((m) => m.to.x === 1 && m.to.y === 1 && !m.mid)).toBe(true);
  });

  it('2d. captures only the destination when the intermediate node is empty', () => {
    const state = createEmptyTestState();

    state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    state.board['0,1'] = { id: 'B_DEST', color: 'BLUE', side: 'PLAIN' };
    state.board['8,8'] = { id: 'B_SAFE', color: 'BLUE', side: 'PLAIN' };

    const move: MoveAction = {
      pieceId: 'R1',
      to: { x: 0, y: 1 },
      mid: { x: 1, y: 1 },
    };

    const next = engine.applyMove(state, move);
    expect(next.board['1,1']).toBeNull(); // travelled through, nothing left behind
    expect(next.board['0,1']?.id).toBe('R1');
    expect(next.capturedPieces.RED.map((p) => p.id)).toEqual(['B_DEST']);
    // Only the final segment carries an "x" when only the destination is taken.
    expect(next.history[0].algebraic).toBe('B1-B2xA2');
  });

  it('2e. does not threaten a lone enemy on the intermediate node via a move that cannot be played', () => {
    const state = createEmptyTestState();

    // BLUE sits on RED's intermediate node with nothing behind it, so the double
    // capture does not exist and neither does the threat it would carry.
    state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    state.board['1,1'] = { id: 'B_MID', color: 'BLUE', side: 'PLAIN' };

    const threats = engine.getThreats(state, 'RED');
    const onMid = threats.filter((t) => t.threatenedPieceId === 'B_MID');

    // Threatened once - by the 1-step move that lands on it, and by that alone.
    expect(onMid.length).toBe(1);

    // With a second enemy behind it, the double capture exists and threatens both.
    state.board['0,1'] = { id: 'B_DEST', color: 'BLUE', side: 'PLAIN' };
    const bothThreats = engine.getThreats(state, 'RED');
    expect(bothThreats.some((t) => t.threatenedPieceId === 'B_MID')).toBe(true);
    expect(bothThreats.some((t) => t.threatenedPieceId === 'B_DEST')).toBe(true);
  });

  it('3. forces movement of threatened piece following callReCheckers', () => {
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
      callReCheckers: true,
    };

    const validation = engine.validateMove(state, moveR2);
    expect(validation.valid).toBe(true);

    const stateAfterReCheckers = engine.applyMove(state, moveR2);

    // Verify ReCheckers enforcement is active
    expect(stateAfterReCheckers.activeReCheckers).not.toBeNull();
    expect(stateAfterReCheckers.activeReCheckers?.callerColor).toBe('RED');
    expect(stateAfterReCheckers.activeReCheckers?.victimColor).toBe('BLUE');
    expect(stateAfterReCheckers.activeReCheckers?.threatenedPieceIds).toContain('B1');
    expect(stateAfterReCheckers.activeReCheckers?.threatenedPieceIds).not.toContain('B2');

    // On BLUE's turn:
    expect(stateAfterReCheckers.turn).toBe('BLUE');

    // B2 is NOT threatened -> getValidMoves must return empty array!
    const b2Moves = engine.getValidMoves(stateAfterReCheckers, 'B2');
    expect(b2Moves).toEqual([]);

    // B1 IS threatened -> getValidMoves must contain legal escape/moves
    const b1Moves = engine.getValidMoves(stateAfterReCheckers, 'B1');
    expect(b1Moves.length).toBeGreaterThan(0);

    // Attempting to move B2 anyway must fail validation
    const illegalB2Move: MoveAction = {
      pieceId: 'B2',
      to: { x: 7, y: 8 },
    };
    const b2Validation = engine.validateMove(stateAfterReCheckers, illegalB2Move);
    expect(b2Validation.valid).toBe(false);
    expect(b2Validation.reason).toContain('ReCheckers was called');

    // Executing legal move with threatened piece B1 resolves ReCheckers
    const legalB1Move: MoveAction = {
      pieceId: 'B1',
      to: b1Moves[0].to,
    };
    const stateAfterEscape = engine.applyMove(stateAfterReCheckers, legalB1Move);
    expect(stateAfterEscape.turn).toBe('RED');
    // ReCheckers enforcement fulfilled
    expect(stateAfterEscape.activeReCheckers).toBeNull();
  });

  it('3b. refuses ReCheckers for a move whose piece creates no threat, even while an older threat stands', () => {
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
    expect(r1Moves.some((m) => m.callReCheckers === true)).toBe(false);

    const declaringMove: MoveAction = {
      pieceId: 'R1',
      to: r1Moves[0].to,
      mid: r1Moves[0].mid,
      callReCheckers: true,
    };

    const validation = engine.validateMove(state, declaringMove);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('does not create a new threat');

    // Played plainly the move is legal, and it leaves no ReCheckers enforcement behind.
    const next = engine.applyMove(state, { ...declaringMove, callReCheckers: false });
    expect(next.activeReCheckers).toBeNull();
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

  it('permanently disables ReCheckers calling when pieces reach 2:1 endgame', () => {
    const state = createEmptyTestState();

    // 2 RED pieces and 1 BLUE piece (2:1 endgame)
    state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    state.board['7,0'] = { id: 'R2', color: 'RED', side: 'PLAIN' };
    state.board['1,1'] = { id: 'B1', color: 'BLUE', side: 'PLAIN' };

    // Moving R2 to threaten B1 or calling ReCheckers
    // In a 2:1 state, ReCheckers must be rejected
    const moveWithReCheckers: MoveAction = {
      pieceId: 'R1',
      to: { x: 0, y: 0 },
      callReCheckers: true,
    };

    const validation = engine.validateMove(state, moveWithReCheckers);
    // Even if threat existed, ReCheckers in 2:1 state must be disallowed
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
