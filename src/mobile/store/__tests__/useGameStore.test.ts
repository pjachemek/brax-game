/**
 * Unit Tests for Brax Mobile Zustand Store (useGameStore)
 * Validates selection, validMoves, Braxing phase, Braxed restrictions, and undo.
 *
 * The store now talks to the engine through BraxEngineClient, so every action is
 * awaited. These tests run against the local transport; the same assertions hold
 * over HTTP because both adapters drive the same GameSessionManager.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { GameState, Piece } from '@brax/engine/view';
import { useGameStore } from '../useGameStore.ts';

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
  beforeEach(async () => {
    await useGameStore.getState().initGame('two_player');
  });

  it('initializes game with canonical setup', () => {
    const state = useGameStore.getState();
    expect(state.gameId).not.toBeNull();
    expect(state.gameState?.turn).toBe('RED');
    expect(state.selectedPieceId).toBeNull();
    expect(state.turnPhase).toBe('AWAITING_SELECTION');
    expect(state.validMoves).toEqual([]);
    expect(state.gameState?.board['1,0']?.id).toBe('R1');
  });

  it('selects a friendly piece and populates validMoves', async () => {
    await useGameStore.getState().selectPiece('R1');

    const updated = useGameStore.getState();
    expect(updated.selectedPieceId).toBe('R1');
    expect(updated.turnPhase).toBe('PIECE_SELECTED');
    expect(updated.validMoves.length).toBeGreaterThan(0);
  });

  it('enforces Brax constraint: blocks unthreatened piece with "You are Braxed!"', async () => {
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

    await useGameStore.getState().loadCustomState(testState);

    // Attempt to select unthreatened piece B2
    await useGameStore.getState().selectPiece('B2');

    const storeAfter = useGameStore.getState();
    expect(storeAfter.selectedPieceId).toBeNull();
    expect(storeAfter.errorMessage).toContain('You are Braxed! Move a threatened piece');

    // Selecting threatened piece B1 succeeds
    await useGameStore.getState().selectPiece('B1');
    const storeAfterB1 = useGameStore.getState();
    expect(storeAfterB1.selectedPieceId).toBe('B1');
    expect(storeAfterB1.turnPhase).toBe('PIECE_SELECTED');
  });

  it('detects move that creates threat and triggers PENDING_BRAX_CHOICE phase', async () => {
    const testState = createEmptyTestState();
    // 3 RED pieces and 3 BLUE pieces to avoid 2:1 endgame expiration
    testState.board['2,0'] = { id: 'R2', color: 'RED', side: 'PLAIN' };
    testState.board['0,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    testState.board['7,0'] = { id: 'R3', color: 'RED', side: 'PLAIN' };
    testState.board['3,1'] = { id: 'B1', color: 'BLUE', side: 'PLAIN' };
    testState.board['7,7'] = { id: 'B2', color: 'BLUE', side: 'PLAIN' };
    testState.board['8,8'] = { id: 'B3', color: 'BLUE', side: 'PLAIN' };

    await useGameStore.getState().loadCustomState(testState);

    // Select R2
    await useGameStore.getState().selectPiece('R2');
    expect(useGameStore.getState().selectedPieceId).toBe('R2');

    // Move R2 to (3,0) which threatens B1 at (3,1)
    await useGameStore.getState().selectDestination({ x: 3, y: 0 });

    const storeAfterMove = useGameStore.getState();
    // Turn must not end immediately! It must enter PENDING_BRAX_CHOICE
    expect(storeAfterMove.turnPhase).toBe('PENDING_BRAX_CHOICE');
    expect(storeAfterMove.pendingMove).not.toBeNull();
    expect(storeAfterMove.pendingMove?.to).toEqual({ x: 3, y: 0 });

    // Confirm choice with callBrax = true
    await useGameStore.getState().confirmBraxChoice(true);

    const storeAfterBrax = useGameStore.getState();
    expect(storeAfterBrax.turnPhase).toBe('AWAITING_SELECTION');
    expect(storeAfterBrax.gameState?.activeBrax).not.toBeNull();
    expect(storeAfterBrax.gameState?.activeBrax?.threatenedPieceIds).toContain('B1');
    expect(storeAfterBrax.gameState?.turn).toBe('BLUE');
  });

  it('allows choosing normal move without Brax even when threat is created', async () => {
    const testState = createEmptyTestState();
    testState.board['2,0'] = { id: 'R2', color: 'RED', side: 'PLAIN' };
    testState.board['0,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    testState.board['7,0'] = { id: 'R3', color: 'RED', side: 'PLAIN' };
    testState.board['3,1'] = { id: 'B1', color: 'BLUE', side: 'PLAIN' };
    testState.board['7,7'] = { id: 'B2', color: 'BLUE', side: 'PLAIN' };
    testState.board['8,8'] = { id: 'B3', color: 'BLUE', side: 'PLAIN' };

    await useGameStore.getState().loadCustomState(testState);
    await useGameStore.getState().selectPiece('R2');
    await useGameStore.getState().selectDestination({ x: 3, y: 0 });

    expect(useGameStore.getState().turnPhase).toBe('PENDING_BRAX_CHOICE');

    // Confirm choice with callBrax = false
    await useGameStore.getState().confirmBraxChoice(false);

    const storeAfterNormal = useGameStore.getState();
    expect(storeAfterNormal.turnPhase).toBe('AWAITING_SELECTION');
    expect(storeAfterNormal.gameState?.activeBrax).toBeNull();
    expect(storeAfterNormal.gameState?.board['3,0']?.id).toBe('R2');
  });

  it('handles capture and updates graveyard', async () => {
    const testState = createEmptyTestState();
    testState.board['1,0'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
    testState.board['0,1'] = { id: 'ENEMY_B', color: 'BLUE', side: 'PLAIN' };

    await useGameStore.getState().loadCustomState(testState);
    await useGameStore.getState().selectPiece('R1');
    await useGameStore.getState().selectDestination({ x: 0, y: 1 });

    const storeAfter = useGameStore.getState();
    expect(storeAfter.gameState?.board['0,1']?.id).toBe('R1');
    expect(storeAfter.gameState?.capturedPieces.RED.length).toBe(1);
    expect(storeAfter.gameState?.capturedPieces.RED[0].id).toBe('ENEMY_B');
    expect(storeAfter.statusMessage).toContain('Zbicie');
  });

  it('supports undoing a move safely', async () => {
    const initialTurn = useGameStore.getState().gameState?.turn;

    await useGameStore.getState().selectPiece('R1');
    // Move R1 from (1,0) to (1,1)
    await useGameStore.getState().selectDestination({ x: 1, y: 1 });

    expect(useGameStore.getState().gameState?.turn).toBe('BLUE');
    expect(useGameStore.getState().canUndo).toBe(true);

    await useGameStore.getState().undoMove();
    expect(useGameStore.getState().gameState?.turn).toBe(initialTurn);
    expect(useGameStore.getState().gameState?.board['1,0']?.id).toBe('R1');
    expect(useGameStore.getState().gameState?.board['1,1']).toBeNull();
  });

  it('keeps undo history server-side across a page-level remount', async () => {
    // A fresh client attaching by gameId sees the same undoable history: the
    // rollback stack lives in the session, not in this store.
    await useGameStore.getState().selectPiece('R1');
    await useGameStore.getState().selectDestination({ x: 1, y: 1 });

    const gameId = useGameStore.getState().gameId!;
    await useGameStore.getState().attachGame(gameId);

    const reattached = useGameStore.getState();
    expect(reattached.gameId).toBe(gameId);
    expect(reattached.canUndo).toBe(true);
    expect(reattached.gameState?.board['1,1']?.id).toBe('R1');
  });
});
