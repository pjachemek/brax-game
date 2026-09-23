/**
 * Brax AI - MCTS, evaluation and the Experience Book.
 *
 * The bot is stochastic, so these tests are written to assert things that hold
 * for *every* seed rather than things that happen to hold for one: budgets and
 * visit accounting, tactics that are forced rather than merely good, and the
 * direction a prior moves after a game is recorded. Where a specific draw is
 * needed the PRNG is injected, so a failure here is a real regression and not a
 * bad afternoon.
 */

import { describe, it, expect } from 'vitest';
import { BraxEngine } from '../../engine.ts';
import { GameSessionManager } from '../../../session/manager.ts';
import {
  BraxBot,
  DIFFICULTY_PROFILES,
  ExperienceBook,
  MCTSSearch,
  MemoryExperienceStorage,
  countPieces,
  evaluateTerminal,
  hashState,
  listBotMoves,
  moveKey,
  simulateMove,
} from '../index.ts';
import type { GameState, MoveAction, Piece } from '../../types.ts';

const engine = new BraxEngine();

function emptyState(overrides: Partial<GameState> = {}): GameState {
  const board: Record<string, Piece | null> = {};
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) board[`${x},${y}`] = null;
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
    ...overrides,
  };
}

function place(state: GameState, coord: string, piece: Piece): void {
  state.board[coord] = piece;
}

const red = (id: string): Piece => ({ id, color: 'RED', side: 'PLAIN' });
const blue = (id: string): Piece => ({ id, color: 'BLUE', side: 'PLAIN' });

/** Deterministic PRNG so a seeded search is reproducible. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Brax AI - move generation and simulation', () => {
  it('generates only moves the rules engine also accepts', () => {
    const state = engine.initGame('two_player');
    const moves = listBotMoves(state);

    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      const verdict = engine.validateMove(state, {
        pieceId: move.pieceId,
        to: move.to,
        mid: move.mid,
      });
      expect(verdict.valid, `${moveKey(move)}: ${verdict.reason}`).toBe(true);
    }
  });

  it('obeys a standing Brax declaration, generating only for the named pieces', () => {
    const state = engine.initGame('two_player');
    const braxed: GameState = {
      ...state,
      activeBrax: {
        callerColor: 'BLUE',
        victimColor: 'RED',
        threatenedPieceIds: ['R3'],
        enforcedAtTurnNumber: 1,
      },
    };

    const movers = new Set(listBotMoves(braxed).map((m) => m.pieceId));
    expect(Array.from(movers)).toEqual(['R3']);
  });

  it('sweeps both victims of a double capture off the board', () => {
    // (3,0) -> (4,0) -> (4,1) is a RED-RED pair, so RED may pass the first
    // enemy only because a second one stands on the destination.
    const state = emptyState();
    place(state, '3,0', red('R1'));
    place(state, '4,0', blue('B1'));
    place(state, '4,1', blue('B2'));

    const sweep = listBotMoves(state).find((m) => m.captures === 2);
    expect(sweep, 'expected a double capture to be generated').toBeDefined();

    const after = simulateMove(state, sweep!);
    expect(after.board['4,0']).toBeNull();
    expect(after.board['4,1']?.id).toBe('R1');
    expect(countPieces(after.board)).toEqual({ red: 1, blue: 0 });
    expect(after.turn).toBe('BLUE');
  });

  it('recognises the terminal positions a rollout can end in', () => {
    const wiped = emptyState({ turn: 'BLUE' });
    place(wiped, '4,4', red('R1'));
    expect(evaluateTerminal(wiped, listBotMoves(wiped))).toEqual({ over: true, winner: 'RED' });

    // No legal move is a loss for the side to move, not a draw.
    const stalled = emptyState();
    place(stalled, '4,4', red('R1'));
    place(stalled, '8,8', blue('B1'));
    expect(evaluateTerminal(stalled, [])).toEqual({ over: true, winner: 'BLUE' });

    const stale = emptyState({ endgame1v1HalfMovesWithoutCapture: 10 });
    place(stale, '4,4', red('R1'));
    place(stale, '0,0', blue('B1'));
    expect(evaluateTerminal(stale, listBotMoves(stale))).toEqual({ over: true, winner: 'DRAW' });
  });
});

describe('Brax AI - MCTS tree', () => {
  it('accounts for every simulation exactly once across the root children', () => {
    const search = new MCTSSearch({ difficulty: 'intermediate', random: seeded(7) });
    const result = search.search(engine.initGame('two_player'), 'RED');

    const total = result.visits.reduce((sum, v) => sum + v.visits, 0);
    expect(result.simulations).toBeGreaterThan(0);
    expect(total).toBe(result.simulations);
  });

  it('expands the tree one move at a time, never twice for the same move', () => {
    const search = new MCTSSearch({ difficulty: 'intermediate', random: seeded(11) });
    const result = search.search(engine.initGame('two_player'), 'RED');

    const keys = result.visits.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.visits.every((v) => v.visits >= 1)).toBe(true);
    // Sorted strongest first, which is the contract buildResult documents.
    expect([...result.visits].sort((a, b) => b.visits - a.visits)).toEqual(result.visits);
  });

  it('stays inside the difficulty budget and the time cap', () => {
    const profile = DIFFICULTY_PROFILES.novice;
    const search = new MCTSSearch({ difficulty: 'novice', random: seeded(3) });
    const result = search.search(engine.initGame('two_player'), 'RED');

    expect(result.simulations).toBeLessThanOrEqual(profile.maxSimulations);
    expect(result.elapsedMs).toBeLessThanOrEqual(profile.timeBudgetMs + 100);
  });

  it('terminates on a position whose only moves cycle forever', () => {
    // Two lone pieces that can only shuffle: an uncapped playout would never
    // return here, so finishing at all is the assertion.
    const state = emptyState();
    place(state, '0,0', red('R1'));
    place(state, '8,8', blue('B1'));

    const search = new MCTSSearch({ difficulty: 'master', random: seeded(5) });
    const result = search.search(state, 'RED');

    expect(result.move).not.toBeNull();
    expect(result.simulations).toBeGreaterThan(0);
  });

  it('plays the only legal move without spending a search on it', () => {
    // R1 in the corner with its own pieces on every square it could reach but
    // one, and a standing Brax that only R1 may answer: exactly one legal move.
    const state = emptyState();
    place(state, '0,0', red('R1'));
    place(state, '1,0', red('R2'));
    place(state, '1,1', red('R3'));
    place(state, '0,2', red('R4'));
    place(state, '8,8', blue('B1'));
    const braxed: GameState = {
      ...state,
      activeBrax: {
        callerColor: 'BLUE',
        victimColor: 'RED',
        threatenedPieceIds: ['R1'],
        enforcedAtTurnNumber: 1,
      },
    };

    expect(listBotMoves(braxed)).toHaveLength(1);

    const search = new MCTSSearch({ difficulty: 'master' });
    const result = search.search(braxed, 'RED');

    expect(result.simulations).toBe(0);
    expect(result.move?.pieceId).toBe('R1');
    expect(result.move?.to).toEqual({ x: 0, y: 1 });
  });

  it('declines to move when it is not the bot to play', () => {
    const search = new MCTSSearch({ difficulty: 'master' });
    expect(search.search(engine.initGame('two_player'), 'BLUE').move).toBeNull();
  });

  it('yields between batches so an async search does not block the loop', async () => {
    let ticks = 0;
    const interval = setInterval(() => ticks++, 1);

    const search = new MCTSSearch({ difficulty: 'master', random: seeded(13) });
    await search.searchAsync(engine.initGame('two_player'), 'RED', 16);
    clearInterval(interval);

    // A fully blocking search would have starved the timer completely.
    expect(ticks).toBeGreaterThan(0);
  });
});

describe('Brax AI - tactical competence at Master', () => {
  /**
   * Master's own settings, with the wall clock lifted.
   *
   * In production Master is bounded by a 400ms cap, and that cap is what
   * actually stops it - so under a loaded test runner it gets a few hundred
   * playouts instead of a couple of thousand, and an assertion about what it
   * *finds* quietly becomes a benchmark of the machine it ran on. Everything
   * that decides quality - exploration constant, rollout depth and policy,
   * temperature, book weight - is untouched; only the clock moves.
   */
  const masterSearch = () =>
    new MCTSSearch({ difficulty: 'master', profile: { timeBudgetMs: 10_000 } });

  it('takes a hanging piece', () => {
    const state = emptyState();
    place(state, '4,4', red('R1'));
    place(state, '1,0', red('R2'));
    place(state, '7,0', red('R3'));
    place(state, '4,5', blue('B1'));
    place(state, '1,8', blue('B2'));
    place(state, '7,8', blue('B3'));

    const result = masterSearch().search(state, 'RED');

    expect(result.move).not.toBeNull();
    expect(result.move!.to).toEqual({ x: 4, y: 5 });
  }, 20_000);

  it('takes a hanging piece even in a position it is losing anyway', () => {
    // One piece against three: every line ends in defeat. Without the
    // depth-discount on terminal results every rollout returns the same 0 here
    // whether the free piece is taken or not, and the bot declines it at
    // roughly the rate chance would - which is what this asserts against.
    //
    // Stated over a sample because MCTS is a sampler: the claim that survives
    // repetition is "nearly always", not "always". Before the discount this
    // scored about one in eight; the threshold is far below what it does now
    // and far above what chance produces.
    const attempts = 10;
    let captures = 0;

    for (let i = 0; i < attempts; i++) {
      const state = emptyState();
      place(state, '4,4', red('R1'));
      place(state, '4,5', blue('B1'));
      place(state, '0,8', blue('B2'));
      place(state, '8,8', blue('B3'));

      const move = masterSearch().search(state, 'RED').move!;
      if (move.to.x === 4 && move.to.y === 5) captures++;
    }

    expect(captures).toBeGreaterThanOrEqual(8);
  }, 60_000);

  it('prefers the sweeping double capture over taking one piece', () => {
    // R1 can take B1 alone by stepping to (4,0), or take B1 *and* B2 by
    // continuing to (4,1) along its own colour.
    const state = emptyState();
    place(state, '3,0', red('R1'));
    place(state, '1,0', red('R2'));
    place(state, '4,0', blue('B1'));
    place(state, '4,1', blue('B2'));
    place(state, '0,8', blue('B3'));

    const result = masterSearch().search(state, 'RED');

    expect(result.move).not.toBeNull();
    expect(result.move!.to).toEqual({ x: 4, y: 1 });
    expect(result.move!.mid).toEqual({ x: 4, y: 0 });

    const after = engine.applyMove(state, result.move!);
    expect(countPieces(after.board)).toEqual({ red: 2, blue: 1 });
  }, 20_000);

  it('hunts down the last enemy piece rather than shuffling', () => {
    // Winning a piece is not the same as winning: the discount is what makes
    // the bot prefer the line that finishes sooner.
    const state = emptyState();
    place(state, '4,4', red('R1'));
    place(state, '4,6', red('R2'));
    place(state, '4,5', blue('B1'));

    const result = masterSearch().search(state, 'RED');
    const after = engine.applyMove(state, result.move!);

    expect(after.result?.winner).toBe('RED');
  }, 20_000);

  it('routes the chosen difficulty through the bot to the search', async () => {
    const bot = new BraxBot({ engine, experienceOptions: { storage: null } });
    for (const difficulty of ['novice', 'intermediate', 'master'] as const) {
      const decision = await bot.decide(engine.initGame('two_player'), 'RED', difficulty);
      expect(decision, difficulty).not.toBeNull();
      expect(decision!.search.difficulty).toBe(difficulty);
      expect(engine.validateMove(engine.initGame('two_player'), decision!.move).valid).toBe(true);
    }
  }, 20_000);

  it('never returns a move the rules engine would refuse', async () => {
    const bot = new BraxBot({ engine });
    let state = engine.initGame('two_player');

    for (let ply = 0; ply < 12 && state.result === null; ply++) {
      const decision = await bot.decide(state, state.turn, 'novice');
      expect(decision).not.toBeNull();
      const verdict = engine.validateMove(state, decision!.move);
      expect(verdict.valid, verdict.reason).toBe(true);
      state = engine.applyMove(state, decision!.move);
    }
  });
});

describe('Brax AI - the bot never passes', () => {
  /**
   * Brax has no pass. A bot turn that produces no move hands the turn back and
   * reads, correctly, as a broken game - so the session manager guarantees a
   * move whenever one is legal, however the search behaved.
   */
  it('plays a legal move even when the search itself throws', async () => {
    const exploding = new BraxBot({ engine, experienceOptions: { storage: null } });
    exploding.decide = async () => {
      throw new Error('search exploded');
    };

    const manager = new GameSessionManager({ engine, bot: exploding });
    const { gameId } = await manager.createGame({ modeId: 'two_player' });

    const outcome = await manager.playBotMove(gameId, 'RED', 'intermediate');

    expect(outcome, 'a thrown search must not become a passed turn').not.toBeNull();
    expect(outcome!.snapshot.state.turn).toBe('BLUE');
    expect(outcome!.snapshot.state.history).toHaveLength(1);
  });

  it('plays a legal move even when the search returns nothing', async () => {
    const mute = new BraxBot({ engine, experienceOptions: { storage: null } });
    mute.decide = async () => null;

    const manager = new GameSessionManager({ engine, bot: mute });
    const { gameId } = await manager.createGame({ modeId: 'two_player' });

    const outcome = await manager.playBotMove(gameId, 'RED', 'intermediate');

    expect(outcome).not.toBeNull();
    expect(outcome!.snapshot.state.history).toHaveLength(1);
  });

  it('still declines when it genuinely is not the bot to move', async () => {
    const manager = new GameSessionManager({
      engine,
      bot: new BraxBot({ engine, experienceOptions: { storage: null } }),
    });
    const { gameId } = await manager.createGame({ modeId: 'two_player' });

    // RED opens, so BLUE has nothing to play - and must not be handed a free
    // move by the fallback above.
    expect(await manager.playBotMove(gameId, 'BLUE', 'novice')).toBeNull();
    expect((await manager.getGame(gameId)).state.history).toHaveLength(0);
  });

  it('never leaves its own turn unplayed over a long game', async () => {
    const manager = new GameSessionManager({
      engine,
      bot: new BraxBot({ engine, experienceOptions: { storage: null } }),
    });
    const { gameId } = await manager.createGame({ modeId: 'two_player' });

    for (let ply = 0; ply < 40; ply++) {
      const before = await manager.getGame(gameId);
      if (before.state.result) break;

      const outcome = await manager.playBotMove(gameId, before.state.turn, 'intermediate');

      expect(outcome, `ply ${ply}: bot passed with legal moves available`).not.toBeNull();
      expect(outcome!.snapshot.state.history.length).toBe(before.state.history.length + 1);
      expect(outcome!.snapshot.state.turn).not.toBe(before.state.turn);
    }
  }, 120_000);
});

describe('Brax AI - Brax declaration', () => {
  it('only declares where the rules allow a declaration', async () => {
    const bot = new BraxBot({ engine });
    let state = engine.initGame('two_player');

    for (let ply = 0; ply < 16 && state.result === null; ply++) {
      const decision = await bot.decide(state, state.turn, 'novice');
      if (!decision) break;
      if (decision.move.callBrax) {
        // The engine refuses a declaration that creates no new threat, or one
        // made in a 2:1 endgame, so validity here is the whole assertion.
        expect(engine.validateMove(state, decision.move).valid).toBe(true);
      }
      state = engine.applyMove(state, decision.move);
    }
  });

  it('does not declare in an endgame where the right has expired', async () => {
    // 1v1: Denham's rule revokes Brax for both sides permanently.
    const state = emptyState();
    place(state, '4,4', red('R1'));
    place(state, '4,6', blue('B1'));

    const bot = new BraxBot({ engine });
    const decision = await bot.decide(state, 'RED', 'master');

    expect(decision?.move.callBrax).toBe(false);
  });
});

describe('Brax AI - the Experience Book', () => {
  /** Plays `plies` real moves and returns the finished state's history. */
  function playLine(plies: number): GameState {
    const bot = new BraxBot({ engine, random: seeded(21) });
    let state = engine.initGame('two_player');
    for (let i = 0; i < plies; i++) {
      const decision = bot.decideSync(state, state.turn, 'novice');
      if (!decision) break;
      state = engine.applyMove(state, decision.move);
    }
    return state;
  }

  it('returns a uniform prior for a position it has never seen', async () => {
    const book = new ExperienceBook({ engine });
    const state = engine.initGame('two_player');
    const moves = listBotMoves(state);

    const priors = book.getPriors(hashState(state), moves);
    expect(priors).toHaveLength(moves.length);
    for (const p of priors) expect(p).toBeCloseTo(1 / moves.length, 10);
  });

  it('raises the prior of a move that won and lowers one that lost', async () => {
    const opening = engine.initGame('two_player');
    const moves = listBotMoves(opening);
    const hash = hashState(opening);
    const played = moves[0];
    const uniform = 1 / moves.length;

    const winning = new ExperienceBook({ engine });
    // Three games in which RED opened with `played` and went on to win.
    for (let i = 0; i < 3; i++) {
      await winning.record(historyFor(played), 'RED');
    }
    const boosted = winning.getPriors(hash, moves)[0];
    expect(boosted).toBeGreaterThan(uniform);

    const losing = new ExperienceBook({ engine });
    for (let i = 0; i < 3; i++) {
      await losing.record(historyFor(played), 'BLUE');
    }
    const damped = losing.getPriors(hash, moves)[0];
    expect(damped).toBeLessThan(uniform);
  });

  /** A one-move game record in which RED opened with `move`. */
  function historyFor(move: {
    pieceId: string;
    to: { x: number; y: number };
    mid?: { x: number; y: number };
  }) {
    const opening = engine.initGame('two_player');
    const next = engine.applyMove(opening, {
      pieceId: move.pieceId,
      to: move.to,
      mid: move.mid,
    } as MoveAction);
    return next.history;
  }

  it('blends towards uniform at the weight the difficulty asks for', async () => {
    const opening = engine.initGame('two_player');
    const moves = listBotMoves(opening);
    const hash = hashState(opening);

    const book = new ExperienceBook({ engine });
    for (let i = 0; i < 5; i++) await book.record(historyFor(moves[0]), 'RED');

    const full = book.getPriors(hash, moves, 1)[0];
    const half = book.getPriors(hash, moves, 0.5)[0];
    const none = book.getPriors(hash, moves, 0)[0];

    expect(none).toBeCloseTo(1 / moves.length, 10);
    expect(half).toBeGreaterThan(none);
    expect(half).toBeLessThan(full);
  });

  it('keeps Novice from consulting the book at all', () => {
    expect(DIFFICULTY_PROFILES.novice.experienceWeight).toBe(0);
    expect(DIFFICULTY_PROFILES.intermediate.experienceWeight).toBe(0.5);
    expect(DIFFICULTY_PROFILES.master.experienceWeight).toBe(1);
  });

  it('records both sides of a game, not only the winner', async () => {
    const finished = playLine(6);
    expect(finished.history.length).toBeGreaterThan(1);

    const book = new ExperienceBook({ engine });
    await book.record(finished.history, 'RED');

    // One position per recorded half-move.
    expect(book.positionCount).toBe(finished.history.length);
    expect(book.gamesRecorded).toBe(1);

    // The loser's move is present too, credited negatively.
    const second = finished.history[1];
    const stateBefore = engine.applyMove(engine.initGame('two_player'), {
      pieceId: finished.history[0].pieceId,
      to: finished.history[0].to,
      mid: finished.history[0].mid,
      callBrax: finished.history[0].calledBrax,
    });
    const entry = book.getEntry(
      hashState(stateBefore),
      moveKey({ pieceId: second.pieceId, to: second.to, mid: second.mid })
    );
    expect(entry).not.toBeNull();
    expect(entry!.n).toBe(1);
    expect(entry!.w).toBe(-1);
  });

  it('survives a round trip through its storage', async () => {
    const storage = new MemoryExperienceStorage();
    const first = new ExperienceBook({ engine, storage });
    const finished = playLine(4);
    await first.record(finished.history, 'BLUE');

    const second = new ExperienceBook({ engine, storage });
    await second.ready();

    expect(second.positionCount).toBe(first.positionCount);
    expect(second.gamesRecorded).toBe(1);
    expect(second.toSnapshot().entries).toEqual(first.toSnapshot().entries);
  });

  it('forgets everything on reset', async () => {
    const storage = new MemoryExperienceStorage();
    const book = new ExperienceBook({ engine, storage });
    await book.record(playLine(4).history, 'RED');
    expect(book.positionCount).toBeGreaterThan(0);

    await book.clear();
    expect(book.positionCount).toBe(0);
    expect(book.gamesRecorded).toBe(0);
    expect(await storage.load()).toBeNull();
  });

  it('shrugs off a history that no longer replays', async () => {
    const book = new ExperienceBook({ engine });
    await book.record(
      [
        {
          moveNumber: 1,
          player: 'RED',
          pieceId: 'NOT_A_PIECE',
          from: { x: 0, y: 0 },
          to: { x: 0, y: 1 },
          distance: 1,
          calledBrax: false,
          algebraic: 'A1-A2',
          timestamp: 0,
        },
      ],
      'RED'
    );

    // The bad move is still filed - the position it was played from was real -
    // but the replay stopped there instead of throwing.
    expect(book.gamesRecorded).toBe(1);
  });
});

describe('Brax AI - learned priors steer the search', () => {
  it('visits a move the book has been winning with more than the search alone would', () => {
    const opening = engine.initGame('two_player');
    const moves = listBotMoves(opening);
    const hash = hashState(opening);

    // A move the book has never seen win: whatever the plain search makes of it.
    const blind = new MCTSSearch({ difficulty: 'master', random: seeded(31) });
    const before = blind.search(opening, 'RED');

    // Now teach the book that one specific move keeps winning, and ask again
    // with the same seed so the only thing that changed is P(s, a).
    const book = new ExperienceBook({ engine });
    const favoured = moves.find(
      (m) => moveKey(m) === before.visits[before.visits.length - 1].key
    )!;
    const snapshot = book.toSnapshot();
    snapshot.entries[hash] = { [moveKey(favoured)]: { n: 40, w: 40 } };
    book.hydrate(snapshot);

    const taught = new MCTSSearch({
      difficulty: 'master',
      experience: book,
      random: seeded(31),
    });
    const after = taught.search(opening, 'RED');

    const visitsBefore = before.visits.find((v) => v.key === moveKey(favoured))!.visits;
    const visitsAfter = after.visits.find((v) => v.key === moveKey(favoured))!.visits;

    // It was the least-visited move before the book spoke up; a prior 40 games
    // deep has to pull it off the bottom.
    expect(visitsAfter).toBeGreaterThan(visitsBefore);
  });
});

describe('Brax AI - position hashing', () => {
  it('gives one position one stable name', () => {
    const a = engine.initGame('two_player');
    const b = engine.initGame('two_player');
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(a)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('separates positions that differ only in whose turn it is', () => {
    const state = engine.initGame('two_player');
    expect(hashState(state)).not.toBe(hashState({ ...state, turn: 'BLUE' }));
  });

  it('separates a position under Brax from the same board without it', () => {
    const state = engine.initGame('two_player');
    const braxed: GameState = {
      ...state,
      activeBrax: {
        callerColor: 'BLUE',
        victimColor: 'RED',
        threatenedPieceIds: ['R1'],
        enforcedAtTurnNumber: 1,
      },
    };
    expect(hashState(state)).not.toBe(hashState(braxed));
  });

  it('ignores how a position was reached', () => {
    const state = engine.initGame('two_player');
    const sameBoardLaterGame: GameState = {
      ...state,
      turnNumber: 42,
      history: [
        {
          moveNumber: 1,
          player: 'RED',
          pieceId: 'R1',
          from: { x: 1, y: 0 },
          to: { x: 1, y: 1 },
          distance: 1,
          calledBrax: false,
          algebraic: 'B1-B2',
          timestamp: 0,
        },
      ],
    };
    expect(hashState(state)).toBe(hashState(sameBoardLaterGame));
  });
});
