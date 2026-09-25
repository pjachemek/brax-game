/**
 * ReCheckers Engine - Transport-agnostic error taxonomy.
 *
 * Both the in-process session manager and the HTTP service raise these, so a
 * client adapter can surface identical failures whether the engine runs locally
 * or behind the network.
 */

export type EngineErrorCode =
  | 'GAME_NOT_FOUND'
  | 'MODE_NOT_FOUND'
  | 'INVALID_MOVE'
  | 'REVISION_CONFLICT'
  | 'NOTHING_TO_UNDO'
  | 'GAME_ALREADY_OVER'
  | 'INVALID_STATE'
  | 'TRANSPORT_ERROR';

const HTTP_STATUS: Record<EngineErrorCode, number> = {
  GAME_NOT_FOUND: 404,
  MODE_NOT_FOUND: 404,
  INVALID_MOVE: 422,
  REVISION_CONFLICT: 409,
  NOTHING_TO_UNDO: 409,
  GAME_ALREADY_OVER: 409,
  INVALID_STATE: 400,
  TRANSPORT_ERROR: 503,
};

export class EngineError extends Error {
  public readonly code: EngineErrorCode;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(code: EngineErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.details = details;
  }

  public toJSON(): { code: EngineErrorCode; message: string; details?: unknown } {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export function isEngineError(err: unknown): err is EngineError {
  return err instanceof EngineError;
}
