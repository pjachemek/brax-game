/**
 * Transport parity tests.
 *
 * The whole point of BraxEngineClient is that the app cannot tell where the
 * rules ran. These tests therefore run one suite twice: once against the
 * in-process engine, once against the real HTTP service over a real socket.
 * If the two ever diverge, moving the engine off-device becomes a behaviour
 * change — which is exactly what this file exists to prevent.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { EngineError, isEngineError } from '@brax/engine';
import { createApp } from '../../../../services/engine-api/src/app.ts';
import { HttpEngineClient } from '../http-client.ts';
import { LocalEngineClient } from '../local-client.ts';
import type { BraxEngineClient } from '../types.ts';

let server: Server;
let httpClient: HttpEngineClient;

beforeAll(async () => {
  const app = createApp();
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  httpClient = new HttpEngineClient({ baseUrl: `http://127.0.0.1:${port}` });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const transports: Array<[string, () => BraxEngineClient]> = [
  ['local', () => new LocalEngineClient()],
  ['http', () => httpClient],
];

describe.each(transports)('BraxEngineClient over %s transport', (_name, makeClient) => {
  it('reports itself healthy and lists the registered modes', async () => {
    const client = makeClient();
    expect(await client.healthCheck()).toBe(true);

    const modes = await client.listModes();
    expect(modes.map((m) => m.id)).toContain('two_player');
  });

  it('creates a session with the canonical opening position', async () => {
    const client = makeClient();
    const snapshot = await client.createGame({ modeId: 'two_player' });

    expect(snapshot.gameId).toBeTruthy();
    expect(snapshot.revision).toBe(0);
    expect(snapshot.canUndo).toBe(false);
    expect(snapshot.state.turn).toBe('RED');
    expect(snapshot.state.board['1,0']?.id).toBe('R1');
  });

  it('applies a legal move, advancing the revision and enabling undo', async () => {
    const client = makeClient();
    const { gameId } = await client.createGame({ modeId: 'two_player' });

    const moves = await client.getValidMoves(gameId, 'R1');
    expect(moves.length).toBeGreaterThan(0);

    const outcome = await client.applyMove(gameId, { ...moves[0], callBrax: false });
    expect(outcome.snapshot.revision).toBe(1);
    expect(outcome.snapshot.canUndo).toBe(true);
    expect(outcome.snapshot.state.turn).toBe('BLUE');

    const undone = await client.undo(gameId);
    expect(undone.state.turn).toBe('RED');
    expect(undone.canUndo).toBe(false);
  });

  it('rejects an illegal move as INVALID_MOVE and leaves the board untouched', async () => {
    const client = makeClient();
    const { gameId } = await client.createGame({ modeId: 'two_player' });

    // R1 cannot teleport across the board.
    await expect(
      client.applyMove(gameId, { pieceId: 'R1', to: { x: 8, y: 8 } })
    ).rejects.toSatisfy((err: unknown) => isEngineError(err) && err.code === 'INVALID_MOVE');

    const after = await client.getGame(gameId);
    expect(after.revision).toBe(0);
    expect(after.state.board['1,0']?.id).toBe('R1');
  });

  it('rejects a move sent against a stale revision', async () => {
    const client = makeClient();
    const { gameId } = await client.createGame({ modeId: 'two_player' });

    const moves = await client.getValidMoves(gameId, 'R1');
    await client.applyMove(gameId, moves[0], { expectedRevision: 0 });

    // The same client replaying revision 0 is the classic double-tap / stale-tab
    // case: the engine must refuse rather than apply the move twice.
    await expect(
      client.applyMove(gameId, moves[0], { expectedRevision: 0 })
    ).rejects.toSatisfy((err: unknown) => isEngineError(err) && err.code === 'REVISION_CONFLICT');
  });

  it('reports an unknown session as GAME_NOT_FOUND', async () => {
    const client = makeClient();
    await expect(client.getGame('no-such-game')).rejects.toSatisfy(
      (err: unknown) => isEngineError(err) && err.code === 'GAME_NOT_FOUND'
    );
  });

  it('answers the Brax question for a destination', async () => {
    const client = makeClient();
    const { gameId } = await client.createGame({ modeId: 'two_player' });

    const moves = await client.getValidMoves(gameId, 'R1');
    const options = await client.getMoveOptions(gameId, 'R1', moves[0].to);
    expect(options.moves.length).toBeGreaterThan(0);
    expect(typeof options.canCallBrax).toBe('boolean');

    // A node the piece cannot reach yields no options rather than an error.
    const none = await client.getMoveOptions(gameId, 'R1', { x: 8, y: 8 });
    expect(none.moves).toEqual([]);
    expect(none.canCallBrax).toBe(false);
  });

  it('returns turn context, threats and endgame status together', async () => {
    const client = makeClient();
    const { gameId } = await client.createGame({ modeId: 'two_player' });

    const result = await client.getTurnContext(gameId);
    expect(result.context.activePlayer).toBe('RED');
    expect(result.context.turnNumber).toBe(1);
    expect(result.isEndgame).toBe(false);
    expect(Array.isArray(result.threats)).toBe(true);
    expect(Array.isArray(result.opponentThreats)).toBe(true);
  });

  it('plays a bot move on request and refuses when it is not the bot turn', async () => {
    const client = makeClient();
    const { gameId } = await client.createGame({ modeId: 'two_player' });

    // RED opens, so BLUE's bot has nothing to play yet.
    expect(await client.playBotMove(gameId, 'BLUE')).toBeNull();

    const outcome = await client.playBotMove(gameId, 'RED');
    expect(outcome).not.toBeNull();
    expect(outcome!.snapshot.state.turn).toBe('BLUE');
  });

  it('plays a bot move at each difficulty, over either transport', async () => {
    for (const difficulty of ['novice', 'intermediate', 'master'] as const) {
      const client = makeClient();
      const { gameId } = await client.createGame({ modeId: 'two_player' });

      const outcome = await client.playBotMove(gameId, 'RED', difficulty);
      expect(outcome, difficulty).not.toBeNull();
      // Whatever the search decided, the canonical state accepted it.
      expect(outcome!.snapshot.state.turn).toBe('BLUE');
      expect(outcome!.snapshot.revision).toBe(1);
    }
  }, 30_000);

  it('rejects a difficulty the engine does not offer', async () => {
    const client = makeClient();
    const { gameId } = await client.createGame({ modeId: 'two_player' });

    await expect(
      // Deliberately outside the union: a stale client or a hand-rolled request
      // must be refused rather than silently downgraded to some default.
      client.playBotMove(gameId, 'RED', 'grandmaster' as never)
    ).rejects.toThrow();
  });

  it('accepts a finished game into the Experience Book and can wipe it again', async () => {
    const client = makeClient();
    const { gameId } = await client.createGame({ modeId: 'two_player' });

    // A short real line, so the history the book replays is a legal one.
    for (let ply = 0; ply < 4; ply++) {
      const outcome = await client.playBotMove(gameId, ply % 2 === 0 ? 'RED' : 'BLUE', 'novice');
      expect(outcome).not.toBeNull();
    }

    const { state } = await client.getGame(gameId);
    await expect(
      client.recordGameExperience(state.history, 'RED', state.gameModeId)
    ).resolves.toBeUndefined();

    await expect(client.resetExperience()).resolves.toBeUndefined();
  }, 30_000);

  it('refuses a game record with no winner the rules recognise', async () => {
    const client = makeClient();
    await expect(client.recordGameExperience([], 'NOBODY' as never)).rejects.toThrow();
  });

  it('loads a custom position and clears the undo history with it', async () => {
    const client = makeClient();
    const { gameId } = await client.createGame({ modeId: 'two_player' });

    const moves = await client.getValidMoves(gameId, 'R1');
    await client.applyMove(gameId, moves[0]);
    expect((await client.getGame(gameId)).canUndo).toBe(true);

    const fresh = await client.createGame({ modeId: 'two_player' });
    const loaded = await client.loadState(gameId, fresh.state);
    expect(loaded.canUndo).toBe(false);
    expect(loaded.state.turn).toBe('RED');
  });

  it('deletes a session', async () => {
    const client = makeClient();
    const { gameId } = await client.createGame({ modeId: 'two_player' });

    await client.deleteGame(gameId);
    await expect(client.getGame(gameId)).rejects.toSatisfy(
      (err: unknown) => isEngineError(err) && err.code === 'GAME_NOT_FOUND'
    );
  });
});

describe('HttpEngineClient transport failures', () => {
  it('surfaces an unreachable service as TRANSPORT_ERROR, not a rules error', async () => {
    const client = new HttpEngineClient({
      // Reserved TEST-NET-1 address: nothing answers, so the request times out.
      baseUrl: 'http://192.0.2.1:9',
      timeoutMs: 150,
      retries: 0,
    });

    await expect(client.createGame({ modeId: 'two_player' })).rejects.toSatisfy(
      (err: unknown) => err instanceof EngineError && err.code === 'TRANSPORT_ERROR'
    );
  });

  it('reports an unhealthy service without throwing', async () => {
    const client = new HttpEngineClient({
      baseUrl: 'http://192.0.2.1:9',
      timeoutMs: 150,
      retries: 0,
    });
    expect(await client.healthCheck()).toBe(false);
  });
});
