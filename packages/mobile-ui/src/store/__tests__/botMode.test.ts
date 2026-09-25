/**
 * ReCheckers Mobile - playing against the bot.
 *
 * Covers the three things bot mode changes about the store's contract: the
 * board locks while the bot is on the clock, undo rolls back a whole round
 * rather than a half-move, and a finished game is handed to the Experience
 * Book. The transport is the in-process one, so these run against the same
 * session manager the hosted service exposes.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { LocalEngineClient } from '@re-checkers/engine-client/local';
import type { ReCheckersEngineClient } from '@re-checkers/engine-client';
import { configureEngineClient } from '../../engine.ts';
import { useGameStore, selectIsBotThinking } from '../useGameStore.ts';

describe('useGameStore - bot mode', () => {
  beforeAll(() => {
    configureEngineClient(new LocalEngineClient());
  });

  beforeEach(async () => {
    useGameStore.setState({
      botConfig: { enabled: false, botColor: 'BLUE', difficulty: 'novice' },
      isBotTurnInFlight: false,
    });
    await useGameStore.getState().initGame('two_player');
  });

  it('starts in pass-and-play, with nobody waiting on a bot', () => {
    const state = useGameStore.getState();
    expect(state.botConfig.enabled).toBe(false);
    expect(selectIsBotThinking(state)).toBe(false);
  });

  it('treats the bot as thinking for the whole of its turn', async () => {
    const { setBotConfig } = useGameStore.getState();
    setBotConfig({ enabled: true, botColor: 'BLUE', difficulty: 'novice' });

    // RED (the human) is to move: the board is theirs.
    expect(selectIsBotThinking(useGameStore.getState())).toBe(false);

    await useGameStore.getState().selectPiece('R1');
    await useGameStore.getState().selectDestination({ x: 1, y: 1 });

    // It is now BLUE's turn, and BLUE is the bot.
    expect(useGameStore.getState().gameState?.turn).toBe('BLUE');
    expect(selectIsBotThinking(useGameStore.getState())).toBe(true);
  });

  it('refuses the player’s input while the bot is on the clock', async () => {
    useGameStore.getState().setBotConfig({ enabled: true, botColor: 'BLUE', difficulty: 'novice' });

    await useGameStore.getState().selectPiece('R1');
    await useGameStore.getState().selectDestination({ x: 1, y: 1 });
    expect(selectIsBotThinking(useGameStore.getState())).toBe(true);

    // A tap that arrives during the bot's turn must change nothing at all -
    // not the selection, not the board.
    const before = useGameStore.getState();
    await useGameStore.getState().selectPiece('B1');

    const after = useGameStore.getState();
    expect(after.selectedPieceId).toBe(before.selectedPieceId);
    expect(after.validMoves).toEqual(before.validMoves);
    expect(after.gameState).toBe(before.gameState);
  });

  it('plays the bot turn and hands the board back to the player', async () => {
    useGameStore.getState().setBotConfig({ enabled: true, botColor: 'BLUE', difficulty: 'novice' });

    await useGameStore.getState().selectPiece('R1');
    await useGameStore.getState().selectDestination({ x: 1, y: 1 });
    await useGameStore.getState().playBotTurn();

    const state = useGameStore.getState();
    expect(state.gameState?.turn).toBe('RED');
    expect(state.gameState?.history).toHaveLength(2);
    expect(state.gameState?.history[1].player).toBe('BLUE');
    expect(state.isBotTurnInFlight).toBe(false);
    expect(selectIsBotThinking(state)).toBe(false);
  }, 20_000);

  it('opens the game by itself when the bot has RED', async () => {
    useGameStore.getState().setBotConfig({ enabled: true, botColor: 'RED', difficulty: 'novice' });

    // A fresh board with RED to move is already the bot's turn - nothing the
    // human does is needed to get the first move played.
    expect(useGameStore.getState().gameState?.turn).toBe('RED');
    expect(selectIsBotThinking(useGameStore.getState())).toBe(true);

    await useGameStore.getState().playBotTurn();

    const state = useGameStore.getState();
    expect(state.gameState?.turn).toBe('BLUE');
    expect(state.gameState?.history[0].player).toBe('RED');
  }, 20_000);

  it('does nothing when asked to play on the human’s turn', async () => {
    useGameStore.getState().setBotConfig({ enabled: true, botColor: 'BLUE', difficulty: 'novice' });

    const before = useGameStore.getState().gameState;
    await useGameStore.getState().playBotTurn();
    expect(useGameStore.getState().gameState).toBe(before);
  });

  it('undoes a whole round in bot mode, so the human is on move again', async () => {
    useGameStore.getState().setBotConfig({ enabled: true, botColor: 'BLUE', difficulty: 'novice' });

    await useGameStore.getState().selectPiece('R1');
    await useGameStore.getState().selectDestination({ x: 1, y: 1 });
    await useGameStore.getState().playBotTurn();
    expect(useGameStore.getState().gameState?.history).toHaveLength(2);

    await useGameStore.getState().undoMove();

    const state = useGameStore.getState();
    // Both half-moves are gone: the opening position, with RED to move.
    expect(state.gameState?.history).toHaveLength(0);
    expect(state.gameState?.turn).toBe('RED');
    expect(state.gameState?.board['1,0']?.id).toBe('R1');
    expect(state.gameState?.board['1,1']).toBeNull();
  }, 20_000);

  it('still undoes a single half-move in pass-and-play', async () => {
    await useGameStore.getState().selectPiece('R1');
    await useGameStore.getState().selectDestination({ x: 1, y: 1 });

    await useGameStore.getState().undoMove();

    expect(useGameStore.getState().gameState?.history).toHaveLength(0);
    expect(useGameStore.getState().gameState?.turn).toBe('RED');
  });

  it('undoes only the bot’s opening move when there is no human move behind it', async () => {
    useGameStore.getState().setBotConfig({ enabled: true, botColor: 'RED', difficulty: 'novice' });

    await useGameStore.getState().playBotTurn();
    expect(useGameStore.getState().gameState?.history).toHaveLength(1);
    // The human (BLUE) is on move and may undo the bot's opening. A naive
    // "always go back two" would find nothing for its second step; the rollback
    // has to stop after one rather than fail.
    expect(useGameStore.getState().gameState?.turn).toBe('BLUE');

    await useGameStore.getState().undoMove();

    expect(useGameStore.getState().gameState?.history).toHaveLength(0);
    expect(useGameStore.getState().gameState?.turn).toBe('RED');
  }, 20_000);

  it('hands a finished game to the Experience Book exactly once', async () => {
    const recorded = vi.fn().mockResolvedValue(undefined);
    const client = new LocalEngineClient();
    const spy: ReCheckersEngineClient = Object.assign(Object.create(Object.getPrototypeOf(client)), client, {
      recordGameExperience: recorded,
    });
    configureEngineClient(spy);

    try {
      await useGameStore.getState().initGame('two_player');

      // A won position one move from the end: RED takes BLUE's last piece.
      const state = structuredClone(useGameStore.getState().gameState!);
      for (const key of Object.keys(state.board)) state.board[key] = null;
      state.board['4,4'] = { id: 'R1', color: 'RED', side: 'PLAIN' };
      state.board['4,5'] = { id: 'B1', color: 'BLUE', side: 'PLAIN' };
      state.turn = 'RED';
      await useGameStore.getState().loadCustomState(state);

      await useGameStore.getState().selectPiece('R1');
      await useGameStore.getState().selectDestination({ x: 4, y: 5 });

      expect(useGameStore.getState().gameState?.result?.winner).toBe('RED');
      expect(recorded).toHaveBeenCalledTimes(1);
      expect(recorded.mock.calls[0][1]).toBe('RED');

      // Re-adopting the same finished snapshot must not credit it twice.
      await useGameStore.getState().refresh();
      expect(recorded).toHaveBeenCalledTimes(1);
    } finally {
      configureEngineClient(new LocalEngineClient());
    }
  });
});
