/**
 * Brax Web - Session hook for the workbench board.
 *
 * The web board is a second front end onto the same engine, so it goes through
 * BraxEngineClient exactly like the mobile store does. It holds no rules: the
 * bot, threat calculation, Brax eligibility, undo and victory all come from the
 * engine, local or hosted.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GameState,
  MoveAction,
  PlayerColor,
  PlayerTurnContext,
  ThreatenedPieceInfo,
} from '@brax/engine/view';
import { findPieceCoord, isEngineError } from '@brax/engine/view';

import { getEngineClient } from '../services/engineClient.ts';

export interface BraxSession {
  state: GameState | null;
  gameId: string | null;
  canUndo: boolean;
  isBusy: boolean;
  connectionError: string | null;
  statusMessage: string | null;

  selectedPieceId: string | null;
  currentValidMoves: MoveAction[];
  threats: ThreatenedPieceInfo[];
  opponentThreats: ThreatenedPieceInfo[];
  turnContext: PlayerTurnContext | null;
  isEndgame: boolean;

  selectPiece: (pieceId: string) => Promise<void>;
  executeMove: (move: MoveAction, callBraxIfPossible: boolean) => Promise<void>;
  playBotMove: (botColor: PlayerColor) => Promise<void>;
  undoMove: () => Promise<void>;
  resetGame: (modeId?: string) => Promise<void>;
  loadState: (state: GameState) => Promise<void>;
  setStatusMessage: (message: string | null) => void;
}

const EMPTY_THREATS: ThreatenedPieceInfo[] = [];

export function useBraxSession(initialModeId = 'two_player'): BraxSession {
  const client = getEngineClient();

  const [gameId, setGameId] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [revision, setRevision] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [currentValidMoves, setCurrentValidMoves] = useState<MoveAction[]>([]);
  const [threats, setThreats] = useState<ThreatenedPieceInfo[]>(EMPTY_THREATS);
  const [opponentThreats, setOpponentThreats] = useState<ThreatenedPieceInfo[]>(EMPTY_THREATS);
  const [turnContext, setTurnContext] = useState<PlayerTurnContext | null>(null);
  const [isEndgame, setIsEndgame] = useState(false);

  // Guards a late response from overwriting a newer position: every fetch is
  // stamped, and only the newest one is allowed to land.
  const requestSeq = useRef(0);

  const reportError = useCallback((err: unknown) => {
    if (isEngineError(err) && err.code === 'TRANSPORT_ERROR') {
      setConnectionError('Brak połączenia z silnikiem gry.');
      return;
    }
    setStatusMessage(
      isEngineError(err) ? err.message : (err as Error)?.message ?? 'Błąd silnika gry.'
    );
  }, []);

  const adopt = useCallback(
    (snapshot: { gameId: string; state: GameState; revision: number; canUndo: boolean }) => {
      setGameId(snapshot.gameId);
      setState(snapshot.state);
      setRevision(snapshot.revision);
      setCanUndo(snapshot.canUndo);
      setSelectedPieceId(null);
      setCurrentValidMoves([]);
      setConnectionError(null);
    },
    []
  );

  // Open a session once, on mount.
  useEffect(() => {
    let cancelled = false;
    setIsBusy(true);
    client
      .createGame({ modeId: initialModeId })
      .then((snapshot) => {
        if (!cancelled) adopt(snapshot);
      })
      .catch((err) => {
        if (!cancelled) reportError(err);
      })
      .finally(() => {
        if (!cancelled) setIsBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Everything the board derives per position comes from one engine call.
  useEffect(() => {
    if (!gameId) return;
    const seq = ++requestSeq.current;

    client
      .getTurnContext(gameId)
      .then((result) => {
        if (seq !== requestSeq.current) return;
        setTurnContext(result.context);
        setIsEndgame(result.isEndgame);
        setThreats(result.threats);
        setOpponentThreats(result.opponentThreats);
      })
      .catch(reportError);
  }, [gameId, revision, client, reportError]);

  const selectPiece = useCallback(
    async (pieceId: string) => {
      if (!gameId || !state || state.result !== null) return;

      const pieceInfo = findPieceCoord(state, pieceId);
      if (!pieceInfo) return;

      if (pieceInfo.piece.color !== state.turn) {
        const oppColorName =
          pieceInfo.piece.color === 'RED' ? 'Czerwony (RED)' : 'Niebieski (BLUE)';
        const myColorName = state.turn === 'RED' ? 'Czerwony (RED)' : 'Niebieski (BLUE)';

        // Auto-select a friendly attacker so the capture trajectory is visible.
        const attackers = threats.filter((t) => t.threatenedPieceId === pieceId);
        if (attackers.length > 0) {
          const attackerId = attackers[0].threatenedByPieceId;
          try {
            setCurrentValidMoves(await client.getValidMoves(gameId, attackerId));
            setSelectedPieceId(attackerId);
            setStatusMessage(
              `Wybrano Twój pionek ${attackerId} zagrażający pionkowi ${pieceId}. Kliknij wrogi pionek ${pieceId}, aby wykonać zbicie!`
            );
          } catch (err) {
            reportError(err);
          }
          return;
        }

        setStatusMessage(
          `To jest pionek przeciwnika (${pieceId} - ${oppColorName}). Twoja tura: ${myColorName}. Wybierz swój pionek, aby wykonać ruch lub zbicie.`
        );
        return;
      }

      // Brax enforcement is recorded in the state the engine returned.
      if (state.activeBrax && state.activeBrax.victimColor === state.turn) {
        if (!state.activeBrax.threatenedPieceIds.includes(pieceId)) {
          setStatusMessage(
            `Wymuszenie Brax! Przeciwnik wymusił ruch zagrożonym pionkiem (${state.activeBrax.threatenedPieceIds.join(
              ', '
            )}). Ten pionek nie może się ruszyć.`
          );
          return;
        }
      }

      try {
        setCurrentValidMoves(await client.getValidMoves(gameId, pieceId));
        setSelectedPieceId(pieceId);
        setStatusMessage(null);
      } catch (err) {
        reportError(err);
      }
    },
    [gameId, state, threats, client, reportError]
  );

  const applyOutcome = useCallback(
    (outcome: Awaited<ReturnType<typeof client.applyMove>>) => {
      adopt(outcome.snapshot);
      if (outcome.capturedPieceId) {
        const captor = outcome.snapshot.state.history.at(-1)?.player;
        const captorName = captor === 'RED' ? 'Czerwony (RED)' : 'Niebieski (BLUE)';
        setStatusMessage(
          `Zbicie wykonane! Gracz ${captorName} pomyślnie zbił wrogiego pionka ${outcome.capturedPieceId}!`
        );
      } else {
        setStatusMessage(null);
      }
    },
    [adopt]
  );

  const executeMove = useCallback(
    async (move: MoveAction, callBraxIfPossible: boolean) => {
      if (!gameId) return;
      setIsBusy(true);
      try {
        // Whether Brax may be declared is the engine's call, not a guess here.
        let outgoing: MoveAction = { ...move, callBrax: false };
        if (callBraxIfPossible) {
          const options = await client.getMoveOptions(gameId, move.pieceId, move.to);
          if (options.canCallBrax) {
            // When the caller left the path open, take the declaring path the
            // engine returned - another path to the same node may not declare.
            const base = move.mid ? move : options.moves[0] ?? move;
            outgoing = { ...base, callBrax: true };
          }
        }
        applyOutcome(await client.applyMove(gameId, outgoing, { expectedRevision: revision }));
      } catch (err) {
        reportError(err);
      } finally {
        setIsBusy(false);
      }
    },
    [gameId, revision, client, applyOutcome, reportError]
  );

  const playBotMove = useCallback(
    async (botColor: PlayerColor) => {
      if (!gameId) return;
      setIsBusy(true);
      try {
        const outcome = await client.playBotMove(gameId, botColor);
        if (outcome) applyOutcome(outcome);
      } catch (err) {
        reportError(err);
      } finally {
        setIsBusy(false);
      }
    },
    [gameId, client, applyOutcome, reportError]
  );

  const undoMove = useCallback(async () => {
    if (!gameId || !canUndo) return;
    setIsBusy(true);
    try {
      adopt(await client.undo(gameId));
      setStatusMessage(null);
    } catch (err) {
      reportError(err);
    } finally {
      setIsBusy(false);
    }
  }, [gameId, canUndo, client, adopt, reportError]);

  const resetGame = useCallback(
    async (modeId = 'two_player') => {
      setIsBusy(true);
      try {
        adopt(gameId ? await client.resetGame(gameId, modeId) : await client.createGame({ modeId }));
        setStatusMessage(null);
      } catch (err) {
        reportError(err);
      } finally {
        setIsBusy(false);
      }
    },
    [gameId, client, adopt, reportError]
  );

  const loadState = useCallback(
    async (nextState: GameState) => {
      setIsBusy(true);
      try {
        adopt(
          gameId
            ? await client.loadState(gameId, nextState)
            : await client.createGame({ state: nextState })
        );
      } catch (err) {
        reportError(err);
      } finally {
        setIsBusy(false);
      }
    },
    [gameId, client, adopt, reportError]
  );

  return {
    state,
    gameId,
    canUndo,
    isBusy,
    connectionError,
    statusMessage,
    selectedPieceId,
    currentValidMoves,
    threats,
    opponentThreats,
    turnContext,
    isEndgame,
    selectPiece,
    executeMove,
    playBotMove,
    undoMove,
    resetGame,
    loadState,
    setStatusMessage,
  };
}
