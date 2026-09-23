/**
 * Brax AI - The bot, as everything outside this folder sees it.
 *
 * `BraxBot` owns the two things a caller should not have to assemble itself:
 * the search configured for a difficulty, and the Experience Book those
 * searches read from and every finished game writes back to. One bot instance
 * per process is the intended shape - the book is the point, and a book that is
 * rebuilt per move learns nothing.
 *
 * The declaration decision lives here rather than inside the search. Whether to
 * call "Brax!" does not change where the piece lands, so folding it into the
 * move list would double the branching factor for free; instead the search
 * settles the move and `shouldDeclareBrax` then asks the narrower question of
 * whether forcing the opponent's reply is actually worth the tempo.
 */

import type { GameState, MoveAction, PlayerColor } from '../types.ts';
import { BraxEngine } from '../engine.ts';
import { calculateThreats, getThreatsCreatedByMove, getUniqueThreatenedPieceIds } from '../threats.ts';
import { MCTSSearch } from './mcts.ts';
import { ExperienceBook, type ExperienceBookOptions } from './experience.ts';
import { shouldDeclareBrax } from './evaluation.ts';
import { listBotMoves, simulateMove } from './simulation.ts';
import type { AIDifficulty, BotMove, MoveHistoryItem, SearchResult } from './types.ts';

export interface BraxBotOptions {
  engine?: BraxEngine;
  experience?: ExperienceBook;
  /** Used when no book is supplied; lets a host pick its own storage. */
  experienceOptions?: ExperienceBookOptions;
  random?: () => number;
}

export interface BotMoveDecision {
  move: MoveAction;
  search: SearchResult;
}

export class BraxBot {
  private readonly engine: BraxEngine;
  private readonly book: ExperienceBook;
  private readonly random: () => number;

  constructor(options: BraxBotOptions = {}) {
    this.engine = options.engine ?? new BraxEngine();
    this.book =
      options.experience ??
      new ExperienceBook({ engine: this.engine, ...options.experienceOptions });
    this.random = options.random ?? Math.random;
  }

  public get experience(): ExperienceBook {
    return this.book;
  }

  /**
   * Chooses the bot's move without blocking the thread for the whole search.
   *
   * Returns null in exactly one situation: the side to move has no legal move
   * at all, which the rules call a stalemate and score as a loss. A search that
   * ran is always able to name a move, so a caller seeing null is looking at a
   * finished game, never at a bot that failed to think.
   */
  public async decide(
    state: GameState,
    botColor: PlayerColor,
    difficulty: AIDifficulty = 'intermediate'
  ): Promise<BotMoveDecision | null> {
    if (state.turn !== botColor || state.result !== null) return null;

    await this.book.ready();

    const search = new MCTSSearch({
      difficulty,
      experience: this.book,
      random: this.random,
    });

    const result = await search.searchAsync(state, botColor);
    if (!result.move) return null;

    return { move: this.withBraxDecision(state, result.move), search: result };
  }

  /** The blocking variant, for a server or a test that has no frame to protect. */
  public decideSync(
    state: GameState,
    botColor: PlayerColor,
    difficulty: AIDifficulty = 'intermediate'
  ): BotMoveDecision | null {
    if (state.turn !== botColor || state.result !== null) return null;

    const search = new MCTSSearch({
      difficulty,
      experience: this.book,
      random: this.random,
    });

    const result = search.search(state, botColor);
    if (!result.move) return null;

    return { move: this.withBraxDecision(state, result.move), search: result };
  }

  /** Credits a finished game to the book. See ExperienceBook.record. */
  public async learn(
    history: MoveHistoryItem[],
    winner: PlayerColor | 'DRAW',
    modeId = 'two_player'
  ): Promise<void> {
    await this.book.record(history, winner, modeId);
  }

  public async forget(): Promise<void> {
    await this.book.clear();
  }

  /**
   * Decides whether the chosen move should also declare "Brax!".
   *
   * The engine is the authority on whether a declaration is *allowed* - only a
   * move that creates a new threat may declare, and the right lapses altogether
   * in a 2:1 endgame - so the legality question is put to `validateMove` rather
   * than re-derived. Only if the answer is yes does the heuristic get to decide
   * whether declaring is a good idea.
   */
  private withBraxDecision(state: GameState, move: MoveAction): MoveAction {
    const plain: MoveAction = { ...move, callBrax: false };

    const declaring: MoveAction = { ...move, callBrax: true };
    if (!this.engine.validateMove(state, declaring).valid) return plain;

    // Which pieces the declaration would pin down, read off the position the
    // move actually produces.
    const botMove = this.toBotMove(state, move);
    if (!botMove) return plain;

    const after = simulateMove(state, botMove);
    const threats = calculateThreats(after, state.turn);
    const created = getThreatsCreatedByMove(threats, move.pieceId);
    const threatenedIds = getUniqueThreatenedPieceIds(created);

    return shouldDeclareBrax(state, botMove, threatenedIds) ? declaring : plain;
  }

  /** Finds the generated move matching `action`, for its path and capture count. */
  private toBotMove(state: GameState, action: MoveAction): BotMove | null {
    for (const candidate of listBotMoves(state)) {
      if (candidate.pieceId !== action.pieceId) continue;
      if (candidate.to.x !== action.to.x || candidate.to.y !== action.to.y) continue;
      if (action.mid) {
        if (!candidate.mid) continue;
        if (candidate.mid.x !== action.mid.x || candidate.mid.y !== action.mid.y) continue;
      }
      return candidate;
    }
    return null;
  }
}
