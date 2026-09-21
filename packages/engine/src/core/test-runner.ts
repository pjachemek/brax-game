/**
 * Brax Rules Engine - In-Browser Test Suite Runner
 * Runs all validation and rule tests in the browser runtime without requiring Node/CLI.
 */

import { BraxEngine } from './engine.ts';
import { GameState, MoveAction, Piece } from './types.ts';
import { CANONICAL_BRAX_BOARD } from './board.ts';

export interface TestResultItem {
  id: string;
  name: string;
  category: string;
  status: 'passed' | 'failed';
  durationMs: number;
  error?: string;
  details?: string;
}

export interface TestSuiteRunResult {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  items: TestResultItem[];
}

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

export function runInBrowserTestSuite(): TestSuiteRunResult {
  const engine = new BraxEngine(CANONICAL_BRAX_BOARD);
  const items: TestResultItem[] = [];
  const startSuite = performance.now();

  function test(
    id: string,
    name: string,
    category: string,
    fn: () => void,
    details?: string
  ) {
    const start = performance.now();
    try {
      fn();
      items.push({
        id,
        name,
        category,
        status: 'passed',
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        details,
      });
    } catch (err: any) {
      items.push({
        id,
        name,
        category,
        status: 'failed',
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        error: err?.message || String(err),
        details,
      });
    }
  }

  // 1. Board setup
  test(
    'setup-canonical',
    'Official Board Initialization (7 Red B1-H1, 7 Blue B9-H9)',
    'Geometry & Setup',
    () => {
      const state = engine.initGame('two_player');
      if (state.turn !== 'RED') throw new Error(`Expected RED turn, got ${state.turn}`);
      for (let x = 1; x <= 7; x++) {
        const redPiece = state.board[`${x},0`];
        const bluePiece = state.board[`${x},8`];
        if (!redPiece || redPiece.color !== 'RED') {
          throw new Error(`Expected RED piece at (${x},0)`);
        }
        if (!bluePiece || bluePiece.color !== 'BLUE') {
          throw new Error(`Expected BLUE piece at (${x},8)`);
        }
      }
    },
    'Verifies correct ranks for Red (row 1, B1-H1) and Blue (row 9, B9-H9).'
  );

  // 2. Distance 1 Move along any color
  test(
    'dist1-move',
    'Distance 1 Move Along Any Segment Color (Own or Opponent)',
    'Movement',
    () => {
      const state = createEmptyTestState();
      state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };

      // (1,0) to (2,0) horizontal edge is BLUE ((1+0)%2 === 1 -> BLUE)
      // Moving 1 step along opponent's color is completely legal in Brax!
      const move1Step: MoveAction = { pieceId: 'R1', to: { x: 2, y: 0 } };
      const res = engine.validateMove(state, move1Step);
      if (!res.valid) throw new Error(`Expected distance 1 move to be valid: ${res.reason}`);
      const next = engine.applyMove(state, move1Step);
      if (next.board['2,0']?.id !== 'R1') throw new Error('Piece not moved to (2,0)');
    },
    'Validates that distance 1 moves are allowed along both RED and BLUE segments.'
  );

  // 3. Distance 2 Move with 90-degree turn
  test(
    'dist2-90deg',
    'Distance 2 Move Along Own Color with 90° Turn (Required by prompt)',
    'Movement',
    () => {
      const state = createEmptyTestState();
      state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };

      // (1,0) -> (1,1) [RED] -> (2,1) [RED]
      const move2Step: MoveAction = {
        pieceId: 'R1',
        to: { x: 2, y: 1 },
        mid: { x: 1, y: 1 },
      };
      const res = engine.validateMove(state, move2Step);
      if (!res.valid) {
        throw new Error(`Expected 90° distance 2 move to be valid: ${res.reason}`);
      }
      const next = engine.applyMove(state, move2Step);
      if (next.board['2,1']?.id !== 'R1') throw new Error('Piece did not land on (2,1)');
      if (next.board['1,0'] !== null) throw new Error('Start position not cleared');
      if (next.board['1,1'] !== null) throw new Error('Intermediate node incorrectly modified');
    },
    'Verifies L-shaped 90° path across two consecutive segments of the player’s color.'
  );

  // 4. Blocked Distance 2 (no jumping over own pieces)
  test(
    'dist2-no-jumping',
    'Jump Prohibition: Distance 2 Blocked When Intermediate Node P1 Holds a Friendly Piece',
    'Movement',
    () => {
      const state = createEmptyTestState();
      state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
      state.board['1,1'] = { id: 'OBSTACLE', color: 'RED', side: 'PLAIN' };

      const move2Step: MoveAction = {
        pieceId: 'R1',
        to: { x: 2, y: 1 },
        mid: { x: 1, y: 1 },
      };
      const res = engine.validateMove(state, move2Step);
      if (res.valid) {
        throw new Error('Move should be blocked by friendly obstacle at intermediate node P1');
      }
      const validMoves = engine.getValidMoves(state, 'R1');
      const found = validMoves.some((m) => m.to.x === 2 && m.to.y === 1);
      if (found) throw new Error('Blocked move appeared in getValidMoves output');
    },
    'Verifies that a piece may never jump its own colour: P1 must be free of friendly pieces.'
  );

  // 4b. Double capture across P1 and P2
  test(
    'dist2-double-capture',
    'Double Capture: Distance 2 Move Takes Enemies on Both P1 and P2',
    'Captures',
    () => {
      const state = createEmptyTestState();
      state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
      state.board['1,1'] = { id: 'MID_B', color: 'BLUE', side: 'PLAIN' };
      state.board['0,1'] = { id: 'DEST_B', color: 'BLUE', side: 'PLAIN' };
      state.board['8,8'] = { id: 'SAFE_B', color: 'BLUE', side: 'PLAIN' };

      const sweep: MoveAction = {
        pieceId: 'R1',
        to: { x: 0, y: 1 },
        mid: { x: 1, y: 1 },
      };

      const res = engine.validateMove(state, sweep);
      if (!res.valid) throw new Error(`Double capture rejected: ${res.reason}`);

      const next = engine.applyMove(state, sweep);
      if (next.board['1,1'] !== null) throw new Error('Piece on intermediate node was not captured');
      if (next.board['0,1']?.id !== 'R1') throw new Error('R1 did not land on destination node');

      const takenIds = next.capturedPieces.RED.map((p) => p.id).join(',');
      if (takenIds !== 'MID_B,DEST_B') {
        throw new Error(`Expected MID_B,DEST_B in RED graveyard, got "${takenIds}"`);
      }
    },
    'Verifies that one distance 2 move along the player’s own colour displaces enemy pieces on both nodes it touches.'
  );

  // 5. Brax Call Enforcement
  test(
    'call-brax-forcing',
    'Brax Enforcement: Opponent Forced to Move Threatened Piece (Required by prompt)',
    'Brax Mechanics',
    () => {
      const state = createEmptyTestState();
      state.board['2,0'] = { id: 'R2', color: 'RED', side: 'PLAIN' };
      state.board['3,1'] = { id: 'B1', color: 'BLUE', side: 'PLAIN' };
      state.board['7,7'] = { id: 'B2', color: 'BLUE', side: 'PLAIN' };

      // R2 moves (2,0) -> (3,0) threatening B1 at (3,1) and calls Brax
      const braxMove: MoveAction = {
        pieceId: 'R2',
        to: { x: 3, y: 0 },
        callBrax: true,
      };

      const res = engine.validateMove(state, braxMove);
      if (!res.valid) throw new Error(`Brax move failed validation: ${res.reason}`);

      const stateAfterBrax = engine.applyMove(state, braxMove);
      if (!stateAfterBrax.activeBrax) throw new Error('activeBrax was not established in state');

      // Unthreatened piece B2 must return empty valid moves
      const b2Moves = engine.getValidMoves(stateAfterBrax, 'B2');
      if (b2Moves.length !== 0) {
        throw new Error(`Expected 0 valid moves for unthreatened B2, got ${b2Moves.length}`);
      }

      // Threatened piece B1 must have legal escape moves
      const b1Moves = engine.getValidMoves(stateAfterBrax, 'B1');
      if (b1Moves.length === 0) {
        throw new Error('Expected threatened piece B1 to have legal moves to save itself');
      }

      // Moving B2 must be rejected by validator
      const illegalMove: MoveAction = { pieceId: 'B2', to: { x: 7, y: 8 } };
      const illegalVal = engine.validateMove(stateAfterBrax, illegalMove);
      if (illegalVal.valid) {
        throw new Error('Opponent was illegally allowed to move an unthreatened piece after Brax!');
      }
    },
    'Verifies that callBrax: true enforces the opponent to move only the threatened piece(s).'
  );

  // 6. Capture at P2
  test(
    'capture-at-p2',
    'Capture at Destination Node P2 (Required by prompt)',
    'Captures',
    () => {
      const state = createEmptyTestState();
      state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
      state.board['2,1'] = { id: 'TARGET_B', color: 'BLUE', side: 'PLAIN' };

      const captureMove: MoveAction = {
        pieceId: 'R1',
        to: { x: 2, y: 1 },
        mid: { x: 1, y: 1 },
      };

      const val = engine.validateMove(state, captureMove);
      if (!val.valid) throw new Error(`Capture move rejected: ${val.reason}`);

      const next = engine.applyMove(state, captureMove);
      if (next.board['2,1']?.id !== 'R1') throw new Error('R1 did not land on target node');
      if (next.capturedPieces.RED.length !== 1) {
        throw new Error(`Expected 1 captured piece in RED graveyard, got ${next.capturedPieces.RED.length}`);
      }
      if (next.capturedPieces.RED[0].id !== 'TARGET_B') {
        throw new Error('Wrong piece recorded as captured');
      }
    },
    'Verifies that distance 2 move correctly captures enemy piece on P2 and removes it from the board.'
  );

  // 6b. Capture at Distance 1
  test(
    'capture-at-dist1',
    'Capture at Distance 1 (Adjacent Orthogonal Node Along Any Color)',
    'Captures',
    () => {
      const state = createEmptyTestState();
      state.board['1,1'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
      state.board['1,2'] = { id: 'ADJACENT_B', color: 'BLUE', side: 'PLAIN' };
      state.board['8,8'] = { id: 'B2', color: 'BLUE', side: 'PLAIN' };

      const capture1Step: MoveAction = {
        pieceId: 'R1',
        to: { x: 1, y: 2 },
      };

      const val = engine.validateMove(state, capture1Step);
      if (!val.valid) throw new Error(`Distance 1 capture rejected: ${val.reason}`);

      const next = engine.applyMove(state, capture1Step);
      if (next.board['1,2']?.id !== 'R1') throw new Error('R1 did not occupy captured node (1,2)');
      if (next.board['1,1'] !== null) throw new Error('Source node (1,1) not cleared');
      if (next.capturedPieces.RED.length !== 1) {
        throw new Error(`Expected 1 captured piece, got ${next.capturedPieces.RED.length}`);
      }
      if (next.capturedPieces.RED[0].id !== 'ADJACENT_B') {
        throw new Error('Wrong piece captured in distance 1 move');
      }
    },
    'Verifies that single-step orthogonal moves correctly capture adjacent enemy pieces.'
  );

  // 7. Endgame 2:1 Brax Expiration
  test(
    'endgame-2v1-no-brax',
    'Endgame Rule: Brax Disabled in 2:1 Piece Ratio',
    'Endgame & Scoring',
    () => {
      const state = createEmptyTestState();
      state.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
      state.board['7,0'] = { id: 'R2', color: 'RED', side: 'PLAIN' };
      state.board['1,1'] = { id: 'B1', color: 'BLUE', side: 'PLAIN' };

      const moveWithBrax: MoveAction = {
        pieceId: 'R1',
        to: { x: 0, y: 0 },
        callBrax: true,
      };

      const val = engine.validateMove(state, moveWithBrax);
      if (val.valid) {
        throw new Error('Brax call should have been forbidden in 2:1 endgame ratio');
      }
    },
    'Verifies that when pieces reach 2:1 ratio, Brax rights permanently expire for all players.'
  );

  // 8. State Immutability
  test(
    'immutability-check',
    'State Immutability: Source State Unchanged After applyMove',
    'Engine Architecture',
    () => {
      const state = engine.initGame('two_player');
      const snapshotOriginal = JSON.stringify(state);

      const move: MoveAction = { pieceId: 'R1', to: { x: 1, y: 1 } };
      engine.applyMove(state, move);

      const snapshotAfter = JSON.stringify(state);
      if (snapshotOriginal !== snapshotAfter) {
        throw new Error('Original GameState was mutated during applyMove execution!');
      }
    },
    'Ensures functional pureness and zero mutations of previous state references.'
  );

  const durationMs = Math.round((performance.now() - startSuite) * 100) / 100;
  const passed = items.filter((i) => i.status === 'passed').length;
  const failed = items.filter((i) => i.status === 'failed').length;

  return {
    total: items.length,
    passed,
    failed,
    durationMs,
    items,
  };
}
