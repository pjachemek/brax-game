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
  AIDifficulty,
  BotPlayConfig,
  GameState,
  MoveAction,
  PlayerColor,
  PlayerTurnContext,
  ThreatenedPieceInfo,
} from '@brax/engine/view';
import { botPacingDelay, findPieceCoord, isEngineError } from '@brax/engine/view';

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

  /** Who the bot is, if anyone. Owned here so the board and the toolbar agree. */
  botConfig: BotPlayConfig;
  /** True from the moment the bot's reply is scheduled until it has landed. */
  isBotThinking: boolean;
  /** True while the human may not touch the board: the bot is on the clock. */
  isInputLocked: boolean;

  selectPiece: (pieceId: string) => Promise<void>;
  executeMove: (move: MoveAction, callBraxIfPossible: boolean) => Promise<void>;
  playBotMove: (botColor: PlayerColor, difficulty?: AIDifficulty) => Promise<void>;
  undoMove: () => Promise<void>;
  resetGame: (modeId?: string) => Promise<void>;
  loadState: (state: GameState) => Promise<void>;
  setStatusMessage: (message: string | null) => void;
  setBotConfig: (patch: Partial<BotPlayConfig>) => void;
  /** Wipes the Experience Book, so the bot plays as if it had never played. */
  resetExperience: () => Promise<void>;
}

const EMPTY_THREATS: ThreatenedPieceInfo[] = [];

const DEFAULT_BOT_CONFIG: BotPlayConfig = {
  enabled: false,
  botColor: 'BLUE',
  difficulty: 'intermediate',
};

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

  const [botConfig, setBotConfigState] = useState<BotPlayConfig>(DEFAULT_BOT_CONFIG);

  // Guards a late response from overwriting a newer position: every fetch is
  // stamped, and only the newest one is allowed to land.
  const requestSeq = useRef(0);

  /**
   * "The bot owes a move" - derived, not stored.
   *
   * It is true from the instant the human's move lands until the bot's reply
   * does, which is exactly the window the board must be untouchable for, and
   * covering the pacing delay as well as the search. Holding it as state
   * instead would mean keeping a second copy of a fact the position already
   * states, and every path that changes the position (undo, reset, scenario
   * load, a difficulty switch mid-turn) would have to remember to clear it.
   */
  const isBotThinking = Boolean(
    botConfig.enabled && state && state.result === null && state.turn === botConfig.botColor
  );
  const isInputLocked = isBotThinking || isBusy;

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
      // The bot is on the clock: a selection made now would be aimed at a
      // position that is about to change under the player's hand.
      if (isBotThinking) return;

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
    [gameId, state, threats, isBotThinking, client, reportError]
  );

  const applyOutcome = useCallback(
    (outcome: Awaited<ReturnType<typeof client.applyMove>>) => {
      adopt(outcome.snapshot);
      const captured = outcome.capturedPieceIds ?? [];
      if (captured.length > 0) {
        const captor = outcome.snapshot.state.history.at(-1)?.player;
        const captorName = captor === 'RED' ? 'Czerwony (RED)' : 'Niebieski (BLUE)';
        setStatusMessage(
          captured.length > 1
            ? `Podwójne zbicie! Gracz ${captorName} zbił dwa wrogie pionki (${captured.join(', ')})!`
            : `Zbicie wykonane! Gracz ${captorName} pomyślnie zbił wrogiego pionka ${captured[0]}!`
        );
      } else {
        setStatusMessage(null);
      }
    },
    [adopt]
  );

  const executeMove = useCallback(
    async (move: MoveAction, callBraxIfPossible: boolean) => {
      if (!gameId || isBotThinking) return;
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
    [gameId, revision, isBotThinking, client, applyOutcome, reportError]
  );

  const playBotMove = useCallback(
    async (botColor: PlayerColor, difficulty?: AIDifficulty) => {
      if (!gameId) return;
      setIsBusy(true);
      try {
        const outcome = await client.playBotMove(gameId, botColor, difficulty);
        if (outcome) {
          applyOutcome(outcome);
          return;
        }

        // The engine plays a legal move whenever one exists, so no outcome
        // means this client is looking at a position the engine has moved past
        // (or finished). Re-pulling settles it; doing nothing would leave the
        // auto-play effect asking for the same move forever, with the board
        // locked behind a "Bot myśli..." that never clears.
        adopt(await client.getGame(gameId));
      } catch (err) {
        reportError(err);
      } finally {
        setIsBusy(false);
      }
    },
    [gameId, client, adopt, applyOutcome, reportError]
  );

  /**
   * Undo, meaning "put the board back where I last had a decision to make".
   *
   * Against the bot that is two half-moves, not one: undoing only the bot's
   * reply would leave the human staring at a position they never got to play
   * from, and the auto-play effect would immediately answer again with the same
   * move. The second step is taken only if it is actually there, so undoing the
   * bot's opening move as RED still works.
   */
  const undoMove = useCallback(async () => {
    if (!gameId || !canUndo) return;
    setIsBusy(true);
    try {
      let snapshot = await client.undo(gameId);

      if (botConfig.enabled && snapshot.state.turn === botConfig.botColor && snapshot.canUndo) {
        snapshot = await client.undo(gameId);
      }

      adopt(snapshot);
      setStatusMessage(null);
    } catch (err) {
      reportError(err);
    } finally {
      setIsBusy(false);
    }
  }, [gameId, canUndo, botConfig.enabled, botConfig.botColor, client, adopt, reportError]);

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

  const setBotConfig = useCallback((patch: Partial<BotPlayConfig>) => {
    setBotConfigState((current) => ({ ...current, ...patch }));
  }, []);

  const resetExperience = useCallback(async () => {
    try {
      await client.resetExperience();
      setStatusMessage('Pamięć bota została wyczyszczona. Zaczyna od zera.');
    } catch (err) {
      reportError(err);
    }
  }, [client, reportError]);

  /**
   * Plays the bot's turn whenever it is the bot's turn.
   *
   * Driven off the position rather than off the human's move, so there is
   * nothing extra to do when the human takes BLUE: the bot is RED, RED is to
   * move on a fresh board, and this effect opens the game by itself. The same
   * property makes it self-correcting after an undo, a reset or a loaded
   * scenario - whatever puts the bot on move gets a reply.
   *
   * The timer id doubles as the "already armed" flag. Without it the effect
   * would re-arm on every unrelated re-render and stack up replies, each of
   * them computed against the same position.
   */
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!gameId || !isBotThinking || isBusy) return;
    if (botTimerRef.current !== null) return;

    const id = setTimeout(() => {
      botTimerRef.current = null;
      void playBotMove(botConfig.botColor, botConfig.difficulty);
    }, botPacingDelay());
    botTimerRef.current = id;

    return () => {
      if (botTimerRef.current === id) {
        clearTimeout(id);
        botTimerRef.current = null;
      }
    };
  }, [gameId, isBotThinking, isBusy, botConfig.botColor, botConfig.difficulty, playBotMove]);

  /**
   * Teaches the bot from the game that just finished.
   *
   * Every game is recorded, not only those against the bot: a pass-and-play
   * game between two humans is the highest-quality material the book can get.
   * The guard is per game *result*, so a finished board being re-rendered does
   * not credit the same line twice.
   */
  const recordedResultRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state?.result || state.history.length === 0) return;

    const token = `${gameId}:${state.history.length}:${state.result.winner}`;
    if (recordedResultRef.current === token) return;
    recordedResultRef.current = token;

    void client
      .recordGameExperience(state.history, state.result.winner, state.gameModeId)
      .catch(() => {
        // Learning is best-effort; a book that cannot be written costs the bot
        // a memory, never the players their result.
      });
  }, [gameId, state?.result, state?.history.length, client, state]);

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
    botConfig,
    isBotThinking,
    isInputLocked,
    selectPiece,
    executeMove,
    playBotMove,
    undoMove,
    resetGame,
    loadState,
    setStatusMessage,
    setBotConfig,
    resetExperience,
  };
}
