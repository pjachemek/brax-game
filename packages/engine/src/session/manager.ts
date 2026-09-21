/**
 * Brax Engine - Server-authoritative session manager.
 *
 * This is the single implementation of "a game in progress". The HTTP service
 * wraps it in routes; the in-process client adapter calls it directly. Both
 * therefore enforce exactly the same rules, history and concurrency semantics.
 */

import { BraxEngine } from '../core/engine.ts';
import {
  GameResult,
  GameState,
  MoveAction,
  NodeCoord,
  PlayerColor,
  PlayerTurnContext,
  ThreatenedPieceInfo,
  ValidationResult,
} from '../core/types.ts';
import { areCoordsEqual } from '../core/geometry.ts';
import { isEndgame1v2 } from '../core/threats.ts';
import { chooseBestMove } from '../core/ai.ts';
import { EngineError } from './errors.ts';
import { InMemoryGameSessionRepository } from './memory-repository.ts';
import {
  ApplyMoveOptions,
  CreateGameOptions,
  GameModeInfo,
  GameSession,
  GameSessionRepository,
  GameSnapshot,
  MoveOutcome,
} from './types.ts';

export interface MoveOptionsResult {
  /** Legal moves from the selected piece to the requested destination. */
  moves: MoveAction[];
  /** True when at least one of them may legally declare Brax. */
  canCallBrax: boolean;
}

/**
 * Everything a UI derives once per turn, answered in one call so a remote
 * client does not need four round trips to render a single position.
 */
export interface TurnContextResult {
  context: PlayerTurnContext;
  /** Brax rights have lapsed for good (Denham's 2:1 / 1:1 endgame rule). */
  isEndgame: boolean;
  /** Pieces the active player currently threatens. */
  threats: ThreatenedPieceInfo[];
  /** Pieces the opponent currently threatens. */
  opponentThreats: ThreatenedPieceInfo[];
}

export interface SessionManagerOptions {
  engine?: BraxEngine;
  repository?: GameSessionRepository;
  /** Maximum retained undo steps per session. Default 100. */
  maxHistory?: number;
  /** Injectable for deterministic tests. */
  idFactory?: () => string;
}

function defaultIdFactory(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class GameSessionManager {
  private readonly engine: BraxEngine;
  private readonly repository: GameSessionRepository;
  private readonly maxHistory: number;
  private readonly idFactory: () => string;

  constructor(options: SessionManagerOptions = {}) {
    this.engine = options.engine ?? new BraxEngine();
    this.repository = options.repository ?? new InMemoryGameSessionRepository();
    this.maxHistory = options.maxHistory ?? 100;
    this.idFactory = options.idFactory ?? defaultIdFactory;
  }

  public listModes(): GameModeInfo[] {
    return this.engine.getAvailableModes();
  }

  public async createGame(options: CreateGameOptions = {}): Promise<GameSnapshot> {
    const modeId = options.state?.gameModeId ?? options.modeId ?? 'two_player';

    // Surface an unknown mode as MODE_NOT_FOUND rather than a raw engine throw.
    try {
      this.engine.getMode(modeId);
    } catch {
      throw new EngineError('MODE_NOT_FOUND', `Game mode "${modeId}" is not registered.`);
    }

    const state = options.state
      ? this.assertValidState(options.state)
      : this.engine.initGame(modeId);
    const now = Date.now();

    const session: GameSession = {
      gameId: this.idFactory(),
      modeId,
      state,
      history: [],
      revision: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.create(session);
    return toSnapshot(session);
  }

  public async getGame(gameId: string): Promise<GameSnapshot> {
    return toSnapshot(await this.requireSession(gameId));
  }

  public async deleteGame(gameId: string): Promise<void> {
    const deleted = await this.repository.delete(gameId);
    if (!deleted) throw new EngineError('GAME_NOT_FOUND', `No game with id "${gameId}".`);
  }

  public async getValidMoves(gameId: string, pieceId: string): Promise<MoveAction[]> {
    const session = await this.requireSession(gameId);
    return this.engine.getValidMoves(session.state, pieceId);
  }

  public async getAllValidMoves(gameId: string): Promise<MoveAction[]> {
    const session = await this.requireSession(gameId);
    return this.engine.getAllValidMoves(session.state);
  }

  public async getThreats(
    gameId: string,
    attackerColor?: PlayerColor
  ): Promise<ThreatenedPieceInfo[]> {
    const session = await this.requireSession(gameId);
    return this.engine.getThreats(session.state, attackerColor);
  }

  public async getTurnContext(gameId: string): Promise<TurnContextResult> {
    const session = await this.requireSession(gameId);
    const { state } = session;
    const opponent: PlayerColor = state.turn === 'RED' ? 'BLUE' : 'RED';

    return {
      context: this.engine.getTurnOrder(state),
      isEndgame: isEndgame1v2(state),
      threats: this.engine.getThreats(state, state.turn),
      opponentThreats: this.engine.getThreats(state, opponent),
    };
  }

  public async validateMove(gameId: string, move: MoveAction): Promise<ValidationResult> {
    const session = await this.requireSession(gameId);
    return this.engine.validateMove(session.state, move);
  }

  /**
   * Resolves what a player may do by tapping `to` while `pieceId` is selected.
   *
   * The Brax question ("does this move let me declare?") is a rules question, so
   * it is answered here rather than reconstructed by each UI.
   */
  public async getMoveOptions(
    gameId: string,
    pieceId: string,
    to: NodeCoord
  ): Promise<MoveOptionsResult> {
    const session = await this.requireSession(gameId);
    const legal = this.engine.getValidMoves(session.state, pieceId);
    const matching = legal.filter((m) => areCoordsEqual(m.to, to));

    if (matching.length === 0) {
      return { moves: [], canCallBrax: false };
    }

    // Two paths can share a destination while only one of them may declare, so
    // a declaring path is listed first: clients play `moves[0]` and would
    // otherwise be offered a Brax the move they actually send cannot make.
    const declaring = matching.find((m) => m.callBrax === true);
    const moves = declaring
      ? [declaring, ...matching.filter((m) => m !== declaring)]
      : matching;

    return { moves, canCallBrax: declaring !== undefined };
  }

  /**
   * Applies a move to the canonical state. The client never supplies a
   * GameState, so a stale or tampered client cannot rewrite the board.
   */
  public async applyMove(
    gameId: string,
    move: MoveAction,
    options: ApplyMoveOptions = {}
  ): Promise<MoveOutcome> {
    const session = await this.requireSession(gameId);

    if (options.expectedRevision !== undefined && options.expectedRevision !== session.revision) {
      throw new EngineError(
        'REVISION_CONFLICT',
        `Game "${gameId}" has moved on (expected revision ${options.expectedRevision}, now ${session.revision}).`,
        { currentRevision: session.revision }
      );
    }

    if (session.state.result !== null) {
      throw new EngineError('GAME_ALREADY_OVER', 'This game has already finished.');
    }

    const validation = this.engine.validateMove(session.state, move);
    if (!validation.valid) {
      throw new EngineError(
        'INVALID_MOVE',
        validation.reason ?? 'Move rejected by the rules engine.',
        { move }
      );
    }

    const previousState = session.state;
    let nextState: GameState;
    try {
      nextState = this.engine.applyMove(previousState, move);
    } catch (err) {
      throw new EngineError(
        'INVALID_MOVE',
        (err as Error)?.message ?? 'Move could not be applied.',
        { move }
      );
    }

    // checkVictory is the authority on termination; persist its verdict so every
    // later read of the session agrees about the result.
    const result: GameResult | null = nextState.result ?? this.engine.checkVictory(nextState);
    if (result && nextState.result === null) {
      nextState = { ...nextState, result };
    }

    session.history = [...session.history, previousState].slice(-this.maxHistory);
    session.state = nextState;
    session.revision += 1;
    session.updatedAt = Date.now();
    await this.repository.save(session);

    const lastEntry = nextState.history[nextState.history.length - 1];
    const braxCalled = Boolean(move.callBrax && nextState.activeBrax);

    return {
      snapshot: toSnapshot(session),
      capturedPieceId: lastEntry?.capturedPiece?.id ?? null,
      capturedPieceIds: (lastEntry?.capturedPieces ?? []).map((p) => p.id),
      braxCalled,
      enforcedPieceIds: braxCalled ? nextState.activeBrax?.threatenedPieceIds ?? [] : [],
      move,
    };
  }

  /**
   * Picks and plays the bot's move for `botColor`.
   *
   * The AI lives here rather than in a client so every front end faces the same
   * opponent, and so a hosted deployment can improve it without shipping an app
   * update. Returns null when it is not the bot's turn or it has no legal move.
   */
  public async playBotMove(gameId: string, botColor: PlayerColor): Promise<MoveOutcome | null> {
    const session = await this.requireSession(gameId);
    const move = chooseBestMove(this.engine, session.state, botColor);
    if (!move) return null;
    return this.applyMove(gameId, move, { expectedRevision: session.revision });
  }

  public async undo(gameId: string): Promise<GameSnapshot> {
    const session = await this.requireSession(gameId);
    const previous = session.history[session.history.length - 1];
    if (!previous) {
      throw new EngineError('NOTHING_TO_UNDO', 'There is no move to undo.');
    }

    session.history = session.history.slice(0, -1);
    session.state = previous;
    session.revision += 1;
    session.updatedAt = Date.now();
    await this.repository.save(session);

    return toSnapshot(session);
  }

  /**
   * Restarts an existing session in place, keeping its id so open clients stay
   * pointed at the same game.
   */
  public async resetGame(gameId: string, modeId?: string): Promise<GameSnapshot> {
    const session = await this.requireSession(gameId);
    const nextModeId = modeId ?? session.modeId;

    try {
      this.engine.getMode(nextModeId);
    } catch {
      throw new EngineError('MODE_NOT_FOUND', `Game mode "${nextModeId}" is not registered.`);
    }

    session.modeId = nextModeId;
    session.state = this.engine.initGame(nextModeId);
    session.history = [];
    session.revision += 1;
    session.updatedAt = Date.now();
    await this.repository.save(session);

    return toSnapshot(session);
  }

  /**
   * Replaces the session's state wholesale. Used for scenario loading and test
   * fixtures; it clears undo history because the prior line of play no longer
   * leads to this position.
   */
  public async loadState(gameId: string, state: GameState): Promise<GameSnapshot> {
    const session = await this.requireSession(gameId);
    const validated = this.assertValidState(state);

    session.state = validated;
    session.modeId = validated.gameModeId;
    session.history = [];
    session.revision += 1;
    session.updatedAt = Date.now();
    await this.repository.save(session);

    return toSnapshot(session);
  }

  private async requireSession(gameId: string): Promise<GameSession> {
    const session = await this.repository.get(gameId);
    if (!session) {
      throw new EngineError('GAME_NOT_FOUND', `No game with id "${gameId}".`);
    }
    return session;
  }

  private assertValidState(state: GameState): GameState {
    if (!state || typeof state !== 'object' || !state.board || !state.turn || !state.gameModeId) {
      throw new EngineError('INVALID_STATE', 'Supplied GameState is missing core fields.');
    }
    try {
      this.engine.getMode(state.gameModeId);
    } catch {
      throw new EngineError('MODE_NOT_FOUND', `Game mode "${state.gameModeId}" is not registered.`);
    }
    return state;
  }
}

export function toSnapshot(session: GameSession): GameSnapshot {
  return {
    gameId: session.gameId,
    modeId: session.modeId,
    state: session.state,
    revision: session.revision,
    canUndo: session.history.length > 0,
    result: session.state.result,
  };
}
