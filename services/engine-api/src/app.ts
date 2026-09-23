/**
 * Brax Engine Service - HTTP surface.
 *
 * A thin transport shell: every rule, every state transition and all history
 * live in GameSessionManager. Deploy this independently of any client.
 */

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import {
  EngineError,
  GameSessionManager,
  type NodeCoord,
  type PlayerColor,
} from '@brax/engine';

export interface CreateAppOptions {
  manager?: GameSessionManager;
  /** Allowed browser origins. '*' by default; pin this in production. */
  allowedOrigins?: string[] | '*';
  /** Max JSON body size. Default '512kb' — a GameState is small. */
  bodyLimit?: string;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const manager = options.manager ?? new GameSessionManager();
  const allowedOrigins = options.allowedOrigins ?? '*';

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: options.bodyLimit ?? '512kb' }));
  app.use(corsMiddleware(allowedOrigins));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'brax-engine', modes: manager.listModes().length });
  });

  app.get('/v1/modes', (_req, res) => {
    res.json({ modes: manager.listModes() });
  });

  app.post(
    '/v1/games',
    handler(async (req, res) => {
      const snapshot = await manager.createGame({
        modeId: req.body?.modeId,
        state: req.body?.state,
      });
      res.status(201).json(snapshot);
    })
  );

  app.get(
    '/v1/games/:gameId',
    handler(async (req, res) => {
      res.json(await manager.getGame(req.params.gameId));
    })
  );

  app.delete(
    '/v1/games/:gameId',
    handler(async (req, res) => {
      await manager.deleteGame(req.params.gameId);
      res.status(204).end();
    })
  );

  app.post(
    '/v1/games/:gameId/reset',
    handler(async (req, res) => {
      res.json(await manager.resetGame(req.params.gameId, req.body?.modeId));
    })
  );

  app.put(
    '/v1/games/:gameId/state',
    handler(async (req, res) => {
      res.json(await manager.loadState(req.params.gameId, req.body?.state));
    })
  );

  app.get(
    '/v1/games/:gameId/moves',
    handler(async (req, res) => {
      const pieceId = req.query.pieceId;
      const moves =
        typeof pieceId === 'string'
          ? await manager.getValidMoves(req.params.gameId, pieceId)
          : await manager.getAllValidMoves(req.params.gameId);
      res.json({ moves });
    })
  );

  app.post(
    '/v1/games/:gameId/move-options',
    handler(async (req, res) => {
      const { pieceId, to } = req.body ?? {};
      if (typeof pieceId !== 'string' || !isNodeCoord(to)) {
        throw new EngineError('INVALID_STATE', 'Body must supply { pieceId: string, to: NodeCoord }.');
      }
      res.json(await manager.getMoveOptions(req.params.gameId, pieceId, to));
    })
  );

  app.get(
    '/v1/games/:gameId/threats',
    handler(async (req, res) => {
      const color = req.query.color;
      if (color !== undefined && color !== 'RED' && color !== 'BLUE') {
        throw new EngineError('INVALID_STATE', 'Query param "color" must be RED or BLUE.');
      }
      const threats = await manager.getThreats(req.params.gameId, color as PlayerColor | undefined);
      res.json({ threats });
    })
  );

  app.get(
    '/v1/games/:gameId/turn-context',
    handler(async (req, res) => {
      res.json(await manager.getTurnContext(req.params.gameId));
    })
  );

  app.post(
    '/v1/games/:gameId/moves/validate',
    handler(async (req, res) => {
      res.json(await manager.validateMove(req.params.gameId, requireMove(req.body?.move)));
    })
  );

  app.post(
    '/v1/games/:gameId/moves',
    handler(async (req, res) => {
      const outcome = await manager.applyMove(req.params.gameId, requireMove(req.body?.move), {
        expectedRevision: req.body?.expectedRevision,
      });
      res.json(outcome);
    })
  );

  app.post(
    '/v1/games/:gameId/undo',
    handler(async (req, res) => {
      res.json(await manager.undo(req.params.gameId));
    })
  );

  app.post(
    '/v1/games/:gameId/bot-move',
    handler(async (req, res) => {
      const botColor = req.body?.botColor;
      if (botColor !== 'RED' && botColor !== 'BLUE') {
        throw new EngineError('INVALID_STATE', 'Body must supply { botColor: "RED" | "BLUE" }.');
      }

      // The difficulty itself is validated by the session manager, so the
      // in-process client refuses exactly what this route refuses.
      res.json({
        outcome: await manager.playBotMove(req.params.gameId, botColor, req.body?.difficulty),
      });
    })
  );

  // --- Experience Book -----------------------------------------------------
  // Not scoped to a game: the book is the service's memory across all of them,
  // which is the whole point of persisting it.

  app.post(
    '/v1/experience/games',
    handler(async (req, res) => {
      // Shape and result are checked by the session manager, for the same
      // reason: one rulebook, one set of refusals, whichever transport asked.
      await manager.recordGameExperience(req.body?.history, req.body?.winner, req.body?.modeId);
      res.json({ recorded: true });
    })
  );

  app.delete(
    '/v1/experience',
    handler(async (_req, res) => {
      await manager.resetExperience();
      res.status(204).end();
    })
  );

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } });
  });

  app.use(errorMiddleware);

  return app;
}

// --- Helpers ---------------------------------------------------------------

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/** Forwards rejected promises to the error middleware (Express 4 does not). */
function handler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

function requireMove(move: unknown) {
  if (!move || typeof move !== 'object' || typeof (move as { pieceId?: unknown }).pieceId !== 'string') {
    throw new EngineError('INVALID_STATE', 'Body must supply a { move } object with a pieceId.');
  }
  if (!isNodeCoord((move as { to?: unknown }).to)) {
    throw new EngineError('INVALID_STATE', 'move.to must be a { x, y } coordinate.');
  }
  return move as Parameters<GameSessionManager['applyMove']>[1];
}

function isNodeCoord(value: unknown): value is NodeCoord {
  const coord = value as NodeCoord | undefined;
  return !!coord && typeof coord.x === 'number' && typeof coord.y === 'number';
}

function corsMiddleware(allowedOrigins: string[] | '*') {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;

    if (allowedOrigins === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof EngineError) {
    res.status(err.status).json({ error: err.toJSON() });
    return;
  }

  // Malformed JSON from express.json() arrives as a SyntaxError with .status.
  const status = (err as { status?: number })?.status;
  if (status === 400) {
    res.status(400).json({ error: { code: 'INVALID_STATE', message: 'Malformed JSON body.' } });
    return;
  }

  console.error('[brax-engine] unhandled error', err);
  res.status(500).json({
    error: { code: 'TRANSPORT_ERROR', message: 'Internal engine service error.' },
  });
}
