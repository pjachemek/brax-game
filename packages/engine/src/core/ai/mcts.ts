/**
 * Brax AI - Monte Carlo Tree Search with learned priors (PUCT).
 *
 * Each simulation walks four phases:
 *
 *   select    descend fully-expanded nodes by the PUCT score below
 *   expand    play one untried move and graft the resulting position on
 *   rollout   play on quickly to a capped depth, then evaluate
 *   backprop  carry the result up, crediting every node on the path
 *
 * The selection score is
 *
 *     Q(s,a) + C * (P(s,a) + eps) * sqrt(ln N_parent) / (1 + N)
 *
 * where P comes from the Experience Book (uniform 1/|moves| for a position the
 * bot has never finished a game in). `eps` keeps a move the book has written
 * off from becoming unreachable: a prior of exactly zero would multiply the
 * whole exploration term away and the search could never revisit the move, even
 * in a position where it is now winning.
 *
 * Q is stored from the *root player's* point of view throughout, and flipped
 * when reading it at a node where the opponent chooses. Keeping one sign
 * convention in the tree and inverting at the point of use is what stops the
 * classic minimax sign bug, where a line looks excellent to whoever happens to
 * be to move.
 */

import type { GameState, MoveAction, PlayerColor } from '../types.ts';
import { BoardGraph, CANONICAL_BRAX_BOARD } from '../board.ts';
import {
  evaluateTerminal,
  listBotMoves,
  moveKey,
  simulateMove,
  toMoveAction,
} from './simulation.ts';
import { evaluatePosition } from './evaluation.ts';
import type { ExperienceBook } from './experience.ts';
import { hashState } from './zobrist.ts';
import {
  DIFFICULTY_PROFILES,
  MAX_ROLLOUT_PLIES,
  type AIDifficulty,
  type BotMove,
  type DifficultyProfile,
  type SearchResult,
} from './types.ts';

/** Keeps a written-off prior from disabling exploration of its move entirely. */
const PRIOR_EPSILON = 0.02;

/** Terminal scores, from the perspective the value is being read in. */
const WIN = 1;
const LOSS = 0;
const DRAW = 0.5;

/**
 * Per-ply decay applied to a terminal rollout result, pulling it towards DRAW.
 *
 * Without it, MCTS is exactly indifferent between two moves that both lose -
 * which sounds harmless and is not. In a position where every line eventually
 * loses (a lone piece against three, say), *every* rollout returns 0 whether
 * the bot takes a free piece or wanders off, so the visit counts are driven by
 * nothing but the exploration term and the bot declines material at random. It
 * looks exactly like a bug in the search, and to a player it looks like the bot
 * gave up.
 *
 * Discounting by depth says the obvious thing instead: losing later is better
 * than losing now, and winning sooner is better than winning eventually. Taking
 * a piece postpones the loss, so it scores higher; mate-in-two beats
 * mate-in-six. The decay is gentle, so it never outweighs an actual difference
 * in result.
 */
const RESULT_DECAY = 0.96;

export class MCTSNode {
  public readonly children = new Map<string, MCTSNode>();
  /** Visits. */
  public N = 0;
  /** Cumulative score, always from the root player's perspective. */
  public W = 0;
  public untriedMoves: BotMove[];
  /** Prior P(s,a) of the move that leads here, cached from the parent's lookup. */
  public prior = 0;

  constructor(
    public readonly state: GameState,
    public readonly parent: MCTSNode | null,
    public readonly move: MoveAction | null,
    legalMoves: BotMove[],
    /** The move that led here, as the search generated it. Null at the root. */
    public readonly botMove: BotMove | null = null
  ) {
    this.untriedMoves = legalMoves;
  }

  public get isFullyExpanded(): boolean {
    return this.untriedMoves.length === 0;
  }

  public get isLeaf(): boolean {
    return this.children.size === 0;
  }
}

export interface MCTSOptions {
  difficulty?: AIDifficulty;
  /** Overrides any part of the difficulty profile; used by tests. */
  profile?: Partial<DifficultyProfile>;
  experience?: ExperienceBook | null;
  boardGraph?: BoardGraph;
  /** Injectable for deterministic tests. */
  random?: () => number;
  /** Injectable clock, so a test can pin the time budget. */
  now?: () => number;
}

export class MCTSSearch {
  private readonly profile: DifficultyProfile;
  private readonly experience: ExperienceBook | null;
  private readonly boardGraph: BoardGraph;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(options: MCTSOptions = {}) {
    const base = DIFFICULTY_PROFILES[options.difficulty ?? 'intermediate'];
    this.profile = { ...base, ...options.profile };
    // Novice is defined as playing without memory, so the book is dropped here
    // rather than left to every call site to remember.
    this.experience = this.profile.experienceWeight > 0 ? options.experience ?? null : null;
    this.boardGraph = options.boardGraph ?? CANONICAL_BRAX_BOARD;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => Date.now());
  }

  public get difficulty(): AIDifficulty {
    return this.profile.id;
  }

  /**
   * Runs the whole search without yielding. Used by tests and by the server,
   * where there is no frame to drop; interactive callers want `searchAsync`.
   */
  public search(state: GameState, botColor: PlayerColor): SearchResult {
    const prepared = this.prepare(state, botColor);
    if ('move' in prepared) return prepared;

    const { root, budget, deadline, startedAt } = prepared;
    let simulations = 0;
    while (simulations < budget && this.now() < deadline) {
      this.simulate(root, botColor);
      simulations++;
    }

    return this.buildResult(root, simulations, this.now() - startedAt);
  }

  /**
   * The same search, in batches, with the event loop given a turn between them.
   *
   * A Master search is thousands of playouts of real work. Run straight through
   * it blocks the only thread the UI has, and a board that cannot repaint while
   * the bot thinks reads as a frozen app - especially on a phone, where the
   * same thread also services the touch queue. Yielding every batch keeps the
   * "Bot thinking..." pill animating and the gesture responder alive.
   */
  public async searchAsync(
    state: GameState,
    botColor: PlayerColor,
    batchSize = 48
  ): Promise<SearchResult> {
    const prepared = this.prepare(state, botColor);
    if ('move' in prepared) return prepared;

    const { root, budget, deadline, startedAt } = prepared;
    const chunk = Math.max(1, batchSize);
    let simulations = 0;

    while (simulations < budget && this.now() < deadline) {
      const target = Math.min(budget, simulations + chunk);
      while (simulations < target) {
        this.simulate(root, botColor);
        simulations++;
      }
      await yieldToEventLoop();
    }

    return this.buildResult(root, simulations, this.now() - startedAt);
  }

  /**
   * Shared set-up for both loops: the root, the budgets, and the cases where
   * running any playouts at all would be wasted work. Returns a finished
   * SearchResult when there is nothing to search.
   */
  private prepare(
    state: GameState,
    botColor: PlayerColor
  ): { root: MCTSNode; budget: number; deadline: number; startedAt: number } | SearchResult {
    const startedAt = this.now();
    const rootMoves = listBotMoves(state, this.boardGraph);

    const empty: SearchResult = {
      move: null,
      visits: [],
      simulations: 0,
      elapsedMs: 0,
      difficulty: this.profile.id,
    };

    if (state.result !== null || state.turn !== botColor || rootMoves.length === 0) {
      return empty;
    }

    // A forced move needs no search at all: spending 2,000 playouts to discover
    // the one thing that is legal is pure latency.
    if (rootMoves.length === 1) {
      return {
        move: toMoveAction(rootMoves[0]),
        visits: [{ key: moveKey(rootMoves[0]), move: rootMoves[0], visits: 1, winRate: 0.5 }],
        simulations: 0,
        elapsedMs: this.now() - startedAt,
        difficulty: this.profile.id,
      };
    }

    const root = new MCTSNode(state, null, null, [...rootMoves]);
    this.assignPriors(root);

    return {
      root,
      budget: this.simulationBudget(),
      deadline: startedAt + this.profile.timeBudgetMs,
      startedAt,
    };
  }

  /** A budget somewhere in the profile's range, so the bot is not metronomic. */
  private simulationBudget(): number {
    const { minSimulations, maxSimulations } = this.profile;
    if (maxSimulations <= minSimulations) return minSimulations;
    return minSimulations + Math.floor(this.random() * (maxSimulations - minSimulations + 1));
  }

  // --- The four phases -----------------------------------------------------

  private simulate(root: MCTSNode, botColor: PlayerColor): void {
    let node = root;

    // 1. Selection.
    while (node.isFullyExpanded && !node.isLeaf) {
      const next = this.selectChild(node, botColor);
      if (!next) break;
      node = next;
    }

    // 2. Expansion.
    if (!node.isFullyExpanded) {
      const index = Math.floor(this.random() * node.untriedMoves.length);
      const move = node.untriedMoves.splice(index, 1)[0];
      const childState = simulateMove(node.state, move);
      const child = new MCTSNode(
        childState,
        node,
        toMoveAction(move),
        listBotMoves(childState, this.boardGraph),
        move
      );
      child.prior = this.priorOf(node, move);
      node.children.set(moveKey(move), child);
      node = child;
      this.assignPriors(node);
    }

    // 3. Rollout, and 4. backpropagation.
    this.backpropagate(node, this.rollout(node.state, botColor));
  }

  private selectChild(node: MCTSNode, botColor: PlayerColor): MCTSNode | null {
    // At a node where the opponent chooses, they pick what is worst for the bot,
    // so exploitation is read through 1 - Q.
    const maximizing = node.state.turn === botColor;
    const logParent = Math.log(Math.max(1, node.N));
    const sqrtLog = Math.sqrt(logParent);

    let best: MCTSNode | null = null;
    let bestScore = -Infinity;

    for (const child of node.children.values()) {
      const q = child.N === 0 ? 0.5 : child.W / child.N;
      const exploit = maximizing ? q : 1 - q;
      const explore =
        this.profile.exploration * (child.prior + PRIOR_EPSILON) * (sqrtLog / (1 + child.N));
      const score = exploit + explore;

      if (score > bestScore) {
        bestScore = score;
        best = child;
      }
    }

    return best;
  }

  /**
   * Plays on from `state` to the profile's depth, then scores what is left.
   *
   * Capping is not an optimisation here: Brax has no move counter and no
   * repetition rule outside the 1v1 endgame, so two pieces can shuffle between
   * the same pair of nodes indefinitely and an uncapped playout never returns.
   * The cap is bounded again by MAX_ROLLOUT_PLIES so no profile can lift it.
   */
  private rollout(state: GameState, botColor: PlayerColor): number {
    let current = state;
    const depth = Math.min(this.profile.rolloutDepth, MAX_ROLLOUT_PLIES);

    for (let ply = 0; ply < depth; ply++) {
      const moves = listBotMoves(current, this.boardGraph);
      const verdict = evaluateTerminal(current, moves);
      if (verdict.over) {
        if (verdict.winner === 'DRAW') return DRAW;
        const outcome = verdict.winner === botColor ? WIN : LOSS;
        return DRAW + (outcome - DRAW) * Math.pow(RESULT_DECAY, ply);
      }
      current = simulateMove(current, this.pickRolloutMove(moves));
    }

    // Cut off mid-game: score the position instead of guessing a winner.
    return evaluatePosition(current, botColor, this.boardGraph);
  }

  /**
   * The rollout policy, which is what actually separates the three levels.
   *
   * Novice plays uniformly at random, so its playouts say little and its tree
   * stays shallow and beatable. The stronger profiles take the best capture
   * available most of the time - preferring a sweeping double capture, since
   * taking two pieces is the single largest swing the rules allow - which makes
   * their playouts resemble a game somebody is trying to win, and therefore
   * makes the values backed up through the tree worth something.
   */
  private pickRolloutMove(moves: BotMove[]): BotMove {
    if (this.profile.captureBias > 0 && this.random() < this.profile.captureBias) {
      let best: BotMove | null = null;
      for (const move of moves) {
        if (move.captures === 0) continue;
        if (!best || move.captures > best.captures) best = move;
      }
      if (best) return best;
    }
    return moves[Math.floor(this.random() * moves.length)];
  }

  private backpropagate(node: MCTSNode | null, value: number): void {
    let current: MCTSNode | null = node;
    while (current) {
      current.N += 1;
      current.W += value;
      current = current.parent;
    }
  }

  // --- Priors --------------------------------------------------------------

  private assignPriors(node: MCTSNode): void {
    if (!this.experience || node.untriedMoves.length === 0) return;
    const hash = hashState(node.state);
    const priors = this.experience.getPriors(
      hash,
      node.untriedMoves,
      this.profile.experienceWeight
    );
    // Cached per node so the book is consulted once per position rather than
    // once per selection, and stored on the child at expansion time.
    nodePriors.set(node, new Map(node.untriedMoves.map((m, i) => [moveKey(m), priors[i]])));
  }

  private priorOf(parent: MCTSNode, move: BotMove): number {
    const cached = nodePriors.get(parent)?.get(moveKey(move));
    if (cached !== undefined) return cached;
    // No book, or nothing recorded: the uniform prior PUCT expects.
    const total = parent.children.size + parent.untriedMoves.length + 1;
    return 1 / Math.max(1, total);
  }

  // --- Result --------------------------------------------------------------

  /**
   * Turns the finished tree into a move.
   *
   * Visit count, not win rate, is the answer MCTS gives: a child visited two
   * thousand times is the one the search kept choosing to look at, whereas a
   * high average over three visits is usually a fluke rollout. Temperature then
   * decides how strictly that ranking is obeyed, and is the second thing (after
   * the rollout policy) that makes the levels feel different: Master takes the
   * argmax every time, Intermediate samples gently and so occasionally plays
   * the second-best move the way a human does, and Novice samples in proportion
   * to visits, which regularly picks something merely plausible.
   */
  private buildResult(root: MCTSNode, simulations: number, elapsedMs: number): SearchResult {
    const entries = Array.from(root.children.entries()).map(([key, child]) => ({
      key,
      child,
      move: child.botMove!,
      visits: child.N,
      winRate: child.N === 0 ? 0.5 : child.W / child.N,
    }));

    if (entries.length === 0) {
      const fallback = listBotMoves(root.state, this.boardGraph);
      return {
        move: fallback.length > 0 ? toMoveAction(fallback[0]) : null,
        visits: [],
        simulations,
        elapsedMs,
        difficulty: this.profile.id,
      };
    }

    entries.sort((a, b) => b.visits - a.visits);

    const chosen =
      this.profile.temperature <= 0
        ? entries[0]
        : sampleByTemperature(entries, this.profile.temperature, this.random);

    return {
      move: chosen.child.move,
      visits: entries.map(({ key, move, visits, winRate }) => ({ key, move, visits, winRate })),
      simulations,
      elapsedMs,
      difficulty: this.profile.id,
    };
  }
}

/**
 * Per-node prior tables.
 *
 * A WeakMap rather than a field on MCTSNode: the table is only needed while a
 * node still has untried moves, and keeping it off the node means a finished
 * tree - which for a Master search is thousands of positions - is collected
 * whole rather than dragging a Map per node behind it.
 */
const nodePriors = new WeakMap<MCTSNode, Map<string, number>>();

/**
 * Samples a move with probability proportional to N^(1/tau).
 *
 * tau = 1 samples in proportion to the visit counts themselves; as tau falls
 * the distribution sharpens towards the argmax, and the caller skips this
 * entirely at tau = 0.
 */
function sampleByTemperature<T extends { visits: number }>(
  entries: T[],
  temperature: number,
  random: () => number
): T {
  const exponent = 1 / temperature;
  const weights = entries.map((entry) => Math.pow(Math.max(entry.visits, 1e-9), exponent));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (!Number.isFinite(total) || total <= 0) return entries[0];

  let roll = random() * total;
  for (let i = 0; i < entries.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return entries[i];
  }
  return entries[entries.length - 1];
}

/**
 * Hands the thread back so the UI can paint.
 *
 * `setTimeout(0)` rather than a microtask on purpose: a microtask runs before
 * the browser gets its turn, so a chain of them starves rendering exactly as
 * badly as not yielding at all. A macrotask lets a frame through. Where no
 * timer exists (a Worker without one, some embeddings), a resolved promise is
 * still better than nothing.
 */
export function yieldToEventLoop(): Promise<void> {
  const timer = (globalThis as { setTimeout?: (fn: () => void, ms: number) => unknown }).setTimeout;
  if (typeof timer === 'function') {
    return new Promise<void>((resolve) => timer(() => resolve(), 0));
  }
  return Promise.resolve();
}
