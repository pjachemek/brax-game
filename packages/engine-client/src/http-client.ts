/**
 * @brax/engine-client - HTTP adapter for the hosted engine service.
 *
 * Wire contract (see services/engine-api):
 *   GET    /health
 *   GET    /v1/modes
 *   POST   /v1/games                     { modeId?, state? }        -> snapshot
 *   GET    /v1/games/:id                                            -> snapshot
 *   DELETE /v1/games/:id                                            -> 204
 *   POST   /v1/games/:id/reset           { modeId? }                -> snapshot
 *   PUT    /v1/games/:id/state           { state }                  -> snapshot
 *   GET    /v1/games/:id/moves[?pieceId=]                           -> { moves }
 *   POST   /v1/games/:id/move-options    { pieceId, to }            -> { moves, canCallBrax }
 *   GET    /v1/games/:id/threats[?color=]                           -> { threats }
 *   GET    /v1/games/:id/turn-context                               -> turn context
 *   POST   /v1/games/:id/moves/validate  { move }                   -> validation
 *   POST   /v1/games/:id/moves           { move, expectedRevision? } -> outcome
 *   POST   /v1/games/:id/undo                                       -> snapshot
 *   POST   /v1/games/:id/bot-move        { botColor }                -> { outcome }
 *
 * Failures arrive as { error: { code, message, details } } and are rethrown as
 * EngineError, so callers handle local and remote failures identically.
 */

// EngineError is taken from the `view` entry point rather than the package
// index on purpose. It is the only *value* this adapter needs from the engine,
// and the index re-exports the rulebook — modes, threats, the AI. A bundler
// that does not tree-shake (Metro, for the React Native app) would pull all of
// it into a client whose whole point is that the rules run somewhere else.
import { EngineError } from '@brax/engine/view';
import {
  type CreateGameOptions,
  type EngineErrorCode,
  type GameModeInfo,
  type GameSnapshot,
  type GameState,
  type MoveAction,
  type MoveOptionsResult,
  type MoveOutcome,
  type NodeCoord,
  type PlayerColor,
  type ThreatenedPieceInfo,
  type TurnContextResult,
  type ValidationResult,
} from '@brax/engine';

import type { ApplyMoveRequestOptions, BraxEngineClient } from './types.ts';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpEngineClientOptions {
  /** Base URL of the engine service, e.g. https://engine.brax.example */
  baseUrl: string;
  /** Injectable for tests / non-browser runtimes. Defaults to global fetch. */
  fetch?: FetchLike;
  /** Per-request timeout in ms. Default 10000. */
  timeoutMs?: number;
  /** Retries for idempotent (GET) requests only. Default 2. */
  retries?: number;
  /** Extra headers, e.g. auth. Can be a function so tokens stay fresh. */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>);
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export class HttpEngineClient implements BraxEngineClient {
  public readonly transport = 'http' as const;

  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly headersOption: HttpEngineClientOptions['headers'];

  constructor(options: HttpEngineClientOptions) {
    if (!options.baseUrl) {
      throw new Error('HttpEngineClient requires a baseUrl.');
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
    const resolvedFetch = options.fetch ?? (globalFetch ? globalFetch.bind(globalThis) : undefined);
    if (!resolvedFetch) {
      throw new Error('HttpEngineClient requires a fetch implementation.');
    }
    this.fetchImpl = resolvedFetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 2;
    this.headersOption = options.headers;
  }

  // --- Public API ----------------------------------------------------------

  public async listModes(): Promise<GameModeInfo[]> {
    const body = await this.request<{ modes: GameModeInfo[] }>('GET', '/v1/modes');
    return body.modes;
  }

  public createGame(options: CreateGameOptions = {}): Promise<GameSnapshot> {
    return this.request<GameSnapshot>('POST', '/v1/games', options);
  }

  public getGame(gameId: string): Promise<GameSnapshot> {
    return this.request<GameSnapshot>('GET', `/v1/games/${encodeURIComponent(gameId)}`);
  }

  public async deleteGame(gameId: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/games/${encodeURIComponent(gameId)}`);
  }

  public resetGame(gameId: string, modeId?: string): Promise<GameSnapshot> {
    return this.request<GameSnapshot>('POST', `/v1/games/${encodeURIComponent(gameId)}/reset`, {
      modeId,
    });
  }

  public loadState(gameId: string, state: GameState): Promise<GameSnapshot> {
    return this.request<GameSnapshot>('PUT', `/v1/games/${encodeURIComponent(gameId)}/state`, {
      state,
    });
  }

  public async getValidMoves(gameId: string, pieceId: string): Promise<MoveAction[]> {
    const body = await this.request<{ moves: MoveAction[] }>(
      'GET',
      `/v1/games/${encodeURIComponent(gameId)}/moves?pieceId=${encodeURIComponent(pieceId)}`
    );
    return body.moves;
  }

  public async getAllValidMoves(gameId: string): Promise<MoveAction[]> {
    const body = await this.request<{ moves: MoveAction[] }>(
      'GET',
      `/v1/games/${encodeURIComponent(gameId)}/moves`
    );
    return body.moves;
  }

  public getMoveOptions(
    gameId: string,
    pieceId: string,
    to: NodeCoord
  ): Promise<MoveOptionsResult> {
    return this.request<MoveOptionsResult>(
      'POST',
      `/v1/games/${encodeURIComponent(gameId)}/move-options`,
      { pieceId, to }
    );
  }

  public async getThreats(
    gameId: string,
    attackerColor?: PlayerColor
  ): Promise<ThreatenedPieceInfo[]> {
    const query = attackerColor ? `?color=${encodeURIComponent(attackerColor)}` : '';
    const body = await this.request<{ threats: ThreatenedPieceInfo[] }>(
      'GET',
      `/v1/games/${encodeURIComponent(gameId)}/threats${query}`
    );
    return body.threats;
  }

  public getTurnContext(gameId: string): Promise<TurnContextResult> {
    return this.request<TurnContextResult>(
      'GET',
      `/v1/games/${encodeURIComponent(gameId)}/turn-context`
    );
  }

  public validateMove(gameId: string, move: MoveAction): Promise<ValidationResult> {
    return this.request<ValidationResult>(
      'POST',
      `/v1/games/${encodeURIComponent(gameId)}/moves/validate`,
      { move }
    );
  }

  public applyMove(
    gameId: string,
    move: MoveAction,
    options: ApplyMoveRequestOptions = {}
  ): Promise<MoveOutcome> {
    return this.request<MoveOutcome>('POST', `/v1/games/${encodeURIComponent(gameId)}/moves`, {
      move,
      expectedRevision: options.expectedRevision,
    });
  }

  public undo(gameId: string): Promise<GameSnapshot> {
    return this.request<GameSnapshot>('POST', `/v1/games/${encodeURIComponent(gameId)}/undo`);
  }

  public async playBotMove(gameId: string, botColor: PlayerColor): Promise<MoveOutcome | null> {
    const body = await this.request<{ outcome: MoveOutcome | null }>(
      'POST',
      `/v1/games/${encodeURIComponent(gameId)}/bot-move`,
      { botColor }
    );
    return body.outcome;
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.request<{ status: string }>('GET', '/health');
      return true;
    } catch {
      return false;
    }
  }

  // --- Transport -----------------------------------------------------------

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const attempts = method === 'GET' ? this.retries + 1 : 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await this.send<T>(method, path, body);
      } catch (err) {
        lastError = err;
        const retryable =
          err instanceof EngineError && err.code === 'TRANSPORT_ERROR' && attempt < attempts - 1;
        if (!retryable) throw err;
        // Back off a little before retrying a transient network failure.
        await delay(150 * 2 ** attempt);
      }
    }

    throw lastError;
  }

  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(await this.resolveHeaders()),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      throw new EngineError(
        'TRANSPORT_ERROR',
        aborted
          ? `Engine service did not respond within ${this.timeoutMs}ms.`
          : `Could not reach the engine service: ${(err as Error)?.message ?? 'unknown error'}`
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const payload = await readJson(response);

    if (!response.ok) {
      throw toEngineError(response.status, payload);
    }

    return payload as T;
  }

  private async resolveHeaders(): Promise<Record<string, string>> {
    if (!this.headersOption) return {};
    return typeof this.headersOption === 'function'
      ? await this.headersOption()
      : this.headersOption;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: { code: 'TRANSPORT_ERROR', message: text.slice(0, 500) } };
  }
}

function toEngineError(status: number, payload: unknown): EngineError {
  const envelope = (payload as { error?: { code?: string; message?: string; details?: unknown } })
    ?.error;

  const code = (envelope?.code as EngineErrorCode) ?? statusToCode(status);
  const message = envelope?.message ?? `Engine service responded with HTTP ${status}.`;
  return new EngineError(code, message, envelope?.details);
}

function statusToCode(status: number): EngineErrorCode {
  if (status === 404) return 'GAME_NOT_FOUND';
  if (status === 409) return 'REVISION_CONFLICT';
  if (status === 422) return 'INVALID_MOVE';
  if (status === 400) return 'INVALID_STATE';
  if (RETRYABLE_STATUS.has(status)) return 'TRANSPORT_ERROR';
  return 'TRANSPORT_ERROR';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
