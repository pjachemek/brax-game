/**
 * Unit Tests for Brax Mobile Zustand Store (useGameStore)
 * Validates selection, validMoves, Braxing phase, Braxed restrictions, and error rollbacks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../useGameStore.ts';
import { GameState, MoveAction, Piece } from '../../engine/types.ts';

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

describe('useGameStore (React Native Mobile State)', () => {
  beforeEach(() => {
    useGameStore.getState().initGame('two_player');
  });

  it('initializes game with canonical setup', () => {
    const state = useGameStore.getState();
    expect(state.gameState.turn).toBe('RED');
    expect(state.selectedPieceId).toBeNull();
    expect(state.turnPhase).toBe('AWAITING_SELECTION');
    expect(state.validMoves).toEqual([]);
    expect(state.gameState.board['1,0']?.id).toBe('R1');
  });

  it('selects a friendly piece and populates validMoves', () => {
    const store = useGameStore.getState();
    store.selectPiece('R1');

    const updated = useGameStore.getState();
    expect(updated.selectedPieceId).toBe('R1');
    expect(updated.turnPhase).toBe('PIECE_SELECTED');
    expect(updated.validMoves.length).toBeGreaterThan(0);
  });

  it('enforces Brax constraint: blocks unthreatened piece with "You are Braxed!"', () => {
    const testState = createEmptyTestState();
    testState.turn = 'BLUE';
    testState.board['3,1'] = { id: 'B1', color: 'BLUE', side: 'PLAIN' };
    testState.board['7,7'] = { id: 'B2', color: 'BLUE', side: 'PLAIN' };
    testState.board['3,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };

    // Active Brax forcing B1
    testState.activeBrax = {
      callerColor: 'RED',
      victimColor: 'BLUE',
      threatenedPieceIds: ['B1'],
      enforcedAtTurnNumber: 1,
    };

    useGameStore.getState().loadCustomState(testState);

    // Attempt to select unthreatened piece B2
    useGameStore.getState().selectPiece('B2');

    const storeAfter = useGameStore.getState();
    expect(storeAfter.selectedPieceId).toBeNull();
    expect(storeAfter.errorMessage).toContain('You are Braxed! Move a threatened piece');

    // Selecting threatened piece B1 succeeds
    useGameStore.getState().selectPiece('B1');
    const storeAfterB1 = useGameStore.getState();
    expect(storeAfterB1.selectedPieceId).toBe('B1');
    expect(storeAfterB1.turnPhase).toBe('PIECE_SELECTED');
  });

  it('detects move that creates threat and triggers PENDING_BRAX_CHOICE phase', () => {
    const testState = createEmptyTestState();
    // 3 RED pieces and 3 BLUE pieces to avoid 2:1 endgame expiration
    testState.board['2,0'] = { id: 'R2', color: 'RED', side: 'PLAIN' };
    testState.board['0,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    testState.board['7,0'] = { id: 'R3', color: 'RED', side: 'PLAIN' };
    testState.board['3,1'] = { id: 'B1', color: 'BLUE', side: 'PLAIN' };
    testState.board['7,7'] = { id: 'B2', color: 'BLUE', side: 'PLAIN' };
    testState.board['8,8'] = { id: 'B3', color: 'BLUE', side: 'PLAIN' };

    useGameStore.getState().loadCustomState(testState);

    // Select R2
    useGameStore.getState().selectPiece('R2');
    expect(useGameStore.getState().selectedPieceId).toBe('R2');

    // Move R2 to (3,0) which threatens B1 at (3,1)
    useGameStore.getState().selectDestination({ x: 3, y: 0 });

    const storeAfterMove = useGameStore.getState();
    // Turn must not end immediately! It must enter PENDING_BRAX_CHOICE
    expect(storeAfterMove.turnPhase).toBe('PENDING_BRAX_CHOICE');
    expect(storeAfterMove.pendingMove).not.toBeNull();
    expect(storeAfterMove.pendingMove?.to).toEqual({ x: 3, y: 0 });

    // Confirm choice with callBrax = true
    useGameStore.getState().confirmBraxChoice(true);

    const storeAfterBrax = useGameStore.getState();
    expect(storeAfterBrax.turnPhase).toBe('AWAITING_SELECTION');
    expect(storeAfterBrax.gameState.activeBrax).not.toBeNull();
    expect(storeAfterBrax.gameState.activeBrax?.threatenedPieceIds).toContain('B1');
    expect(storeAfterBrax.gameState.turn).toBe('BLUE');
  });

  it('allows choosing normal move without Brax even when threat is created', () => {
    const testState = createEmptyTestState();
    testState.board['2,0'] = { id: 'R2', color: 'RED', side: 'PLAIN' };
    testState.board['0,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    testState.board['7,0'] = { id: 'R3', color: 'RED', side: 'PLAIN' };
    testState.board['3,1'] = { id: 'B1', color: 'BLUE', side: 'PLAIN' };
    testState.board['7,7'] = { id: 'B2', color: 'BLUE', side: 'PLAIN' };
    testState.board['8,8'] = { id: 'B3', color: 'BLUE', side: 'PLAIN' };

    useGameStore.getState().loadCustomState(testState);
    useGameStore.getState().selectPiece('R2');
    useGameStore.getState().selectDestination({ x: 3, y: 0 });

    expect(useGameStore.getState().turnPhase).toBe('PENDING_BRAX_CHOICE');

    // Confirm choice with callBrax = false
    useGameStore.getState().confirmBraxChoice(false);

    const storeAfterNormal = useGameStore.getState();
    expect(storeAfterNormal.turnPhase).toBe('AWAITING_SELECTION');
    expect(storeAfterNormal.gameState.activeBrax).toBeNull();
    expect(storeAfterNormal.gameState.board['3,0']?.id).toBe('R2');
  });

  it('handles capture and updates graveyard', () => {
    const testState = createEmptyTestState();
    testState.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    testState.board['2,1'] = { id: 'ENEMY_B', color: 'BLUE', side: 'PLAIN' };

    useGameStore.getState().loadCustomState(testState);
    useGameStore.getState().selectPiece('R1');
    useGameStore.getState().selectDestination({ x: 2, y: 1 });

    const storeAfter = useGameStore.getState();
    expect(storeAfter.gameState.board['2,1']?.id).toBe('R1');
    expect(storeAfter.gameState.capturedPieces.RED.length).toBe(1);
    expect(storeAfter.gameState.capturedPieces.RED[0].id).toBe('ENEMY_B');
    expect(storeAfter.statusMessage).toContain('Zbicie');
  });

  it('supports undoing a move safely', () => {
    const store = useGameStore.getState();
    const initialTurn = store.gameState.turn;

    store.selectPiece('R1');
    // Move R1 from (1,0) to (1,1)
    store.selectDestination({ x: 1, y: 1 });

    expect(useGameStore.getState().gameState.turn).toBe('BLUE');
    expect(useGameStore.getState().canUndo).toBe(true);

    useGameStore.getState().undoMove();
    expect(useGameStore.getState().gameState.turn).toBe(initialTurn);
    expect(useGameStore.getState().gameState.board['1,0']?.id).toBe('R1');
    expect(useGameStore.getState().gameState.board['1,1']).toBeNull();
  });
});
