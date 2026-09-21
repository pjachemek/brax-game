/**
 * Brax Mobile UI - Zustand Game Store
 *
 * Holds the *interaction* state (selection, turn phase, feedback) and a
 * projection of a server-authoritative session. It owns no rules: legality,
 * Brax eligibility, capture resolution, victory and undo all come back from the
 * BraxEngineClient, which may be running in-process or in the hosted service.
 *
 * Consequences of that split, visible throughout this file:
 *  - every action is async and guarded by `isBusy` so a slow engine cannot be
 *    raced by a second tap;
 *  - the local `gameState` is a cache to render from, never a source of truth —
 *    moves are sent with the revision they were decided on, and a conflict
 *    re-pulls the canonical snapshot instead of guessing.
 */

import { create } from 'zustand';
import type { MoveOptionsResult } from '@brax/engine';
import { areCoordsEqual, findPieceCoord, isEngineError } from '@brax/engine/view';
import type {
  GameSnapshot,
  GameState,
  MoveAction,
  MoveOutcome,
  NodeCoord,
} from '@brax/engine/view';

import { GameStoreState, TurnPhase } from '../types.ts';
import { getEngineClient } from '../../services/engineClient.ts';

/** Interaction fields reset whenever the board changes underneath the player. */
const CLEARED_SELECTION = {
  selectedPieceId: null,
  validMoves: [] as MoveAction[],
  pendingMove: null,
  rejectedPieceId: null,
};

export const useGameStore = create<GameStoreState>((set, get) => {
  const client = getEngineClient();

  /** Folds a snapshot into the store and derives the resting turn phase. */
  const applySnapshot = (snapshot: GameSnapshot, patch: Partial<GameStoreState> = {}) => {
    set({
      gameId: snapshot.gameId,
      gameState: snapshot.state,
      gameModeId: snapshot.modeId,
      revision: snapshot.revision,
      canUndo: snapshot.canUndo,
      turnPhase: snapshot.result ? 'GAME_OVER' : 'AWAITING_SELECTION',
      ...CLEARED_SELECTION,
      isBusy: false,
      connectionError: null,
      errorMessage: null,
      statusMessage: null,
      ...patch,
    });
  };

  /**
   * Refuse an action and point the player at the piece responsible for it.
   * The message still lands in the fixed-height status strip, but the primary
   * feedback is the shake the board plays on `pieceId`.
   */
  const reject = (pieceId: string | null, patch: Partial<GameStoreState>) =>
    set((state) => ({
      ...patch,
      rejectedPieceId: pieceId,
      rejectionNonce: state.rejectionNonce + 1,
    }));

  /**
   * Turns an engine failure into player-facing state. A rules refusal and an
   * unreachable service are different problems and are reported differently:
   * one is the player's move, the other is nothing they did.
   */
  const handleFailure = async (err: unknown, fallbackPhase: TurnPhase) => {
    if (isEngineError(err)) {
      if (err.code === 'TRANSPORT_ERROR') {
        set({
          isBusy: false,
          connectionError: 'Brak połączenia z silnikiem gry. Spróbuj ponownie.',
          turnPhase: fallbackPhase,
          ...CLEARED_SELECTION,
        });
        return;
      }

      if (err.code === 'REVISION_CONFLICT' || err.code === 'GAME_NOT_FOUND') {
        // Someone (or something) else advanced the game. Re-sync rather than
        // rendering a position the server no longer agrees with.
        set({ isBusy: false, statusMessage: 'Synchronizacja z serwerem gry...' });
        await get().refresh();
        return;
      }

      set({
        isBusy: false,
        errorMessage: err.message,
        turnPhase: fallbackPhase,
        ...CLEARED_SELECTION,
      });
      return;
    }

    set({
      isBusy: false,
      errorMessage: (err as Error)?.message ?? 'Nieoczekiwany błąd silnika gry.',
      turnPhase: fallbackPhase,
      ...CLEARED_SELECTION,
    });
  };

  /** Applies the outcome of a completed move, including its feedback message. */
  const applyOutcome = (outcome: MoveOutcome) => {
    let message: string | null = null;
    if (outcome.braxCalled) {
      message = `Brax ogłoszony! Przeciwnik musi ruszyć zagrożonym pionkiem (${outcome.enforcedPieceIds.join(
        ', '
      )}).`;
    } else if (outcome.capturedPieceIds?.length > 1) {
      // A distance 2 move that sweeps both nodes takes two pieces at once; the
      // strip has to name both or the board looks like it lost one silently.
      message = `Podwójne zbicie! Pionki ${outcome.capturedPieceIds.join(' i ')} zostały zbite.`;
    } else if (outcome.capturedPieceId) {
      message = `Zbicie! Pionek ${outcome.capturedPieceId} został zbity.`;
    }

    applySnapshot(outcome.snapshot, { statusMessage: message });
  };

  /** Guard for actions that need an established session. */
  const requireGameId = (): string | null => {
    const { gameId, isBusy } = get();
    if (!gameId || isBusy) return null;
    return gameId;
  };

  const store: GameStoreState = {
    gameId: null,
    gameState: null,
    gameModeId: 'two_player',
    revision: 0,
    canUndo: false,

    selectedPieceId: null,
    validMoves: [],
    turnPhase: 'CONNECTING',
    pendingMove: null,

    isBusy: false,
    connectionError: null,

    statusMessage: null,
    errorMessage: null,
    rejectedPieceId: null,
    rejectionNonce: 0,
    targetHintNonce: 0,

    initGame: async (modeId = 'two_player') => {
      set({ isBusy: true, turnPhase: 'CONNECTING', connectionError: null, errorMessage: null });
      try {
        applySnapshot(await client.createGame({ modeId }));
      } catch (err) {
        await handleFailure(err, 'CONNECTING');
      }
    },

    attachGame: async (gameId: string) => {
      set({ isBusy: true, turnPhase: 'CONNECTING', connectionError: null });
      try {
        applySnapshot(await client.getGame(gameId));
      } catch (err) {
        await handleFailure(err, 'CONNECTING');
      }
    },

    refresh: async () => {
      const { gameId } = get();
      if (!gameId) return;
      try {
        applySnapshot(await client.getGame(gameId));
      } catch (err) {
        if (isEngineError(err) && err.code === 'GAME_NOT_FOUND') {
          // The session is gone for good; start a fresh one rather than
          // stranding the player on a board that no longer exists.
          await get().initGame(get().gameModeId);
          return;
        }
        set({
          isBusy: false,
          connectionError: 'Nie udało się odświeżyć stanu gry.',
        });
      }
    },

    selectPiece: async (pieceId: string) => {
      const gameId = requireGameId();
      const { gameState, selectedPieceId, validMoves } = get();
      if (!gameId || !gameState) return;

      if (gameState.result !== null) {
        set({ turnPhase: 'GAME_OVER' });
        return;
      }

      const pieceInfo = findPieceCoord(gameState, pieceId);
      if (!pieceInfo) return;

      const { piece, coord } = pieceInfo;

      // Clicked on opponent's piece:
      if (piece.color !== gameState.turn) {
        // If a piece is already selected, check if this opponent piece is an eligible capture target!
        if (selectedPieceId) {
          const captureCandidate = validMoves.find((m) => areCoordsEqual(m.to, coord));
          if (captureCandidate) {
            await get().selectDestination(coord);
            return;
          }

          // The piece may also be taken on the way through: a distance 2 move
          // sweeps whatever stands on its intermediate node. Tapping that piece
          // plays the move that takes it, so both halves of a double capture
          // are reachable by aiming at the enemy.
          const sweepCandidate = validMoves.find((m) => m.mid && areCoordsEqual(m.mid, coord));
          if (sweepCandidate) {
            await get().selectDestination(sweepCandidate.to);
            return;
          }
        }

        // Check if any friendly piece currently threatens this opponent piece.
        // Threats are a rules question, so the engine answers it.
        set({ isBusy: true });
        try {
          const threats = await client.getThreats(gameId, gameState.turn);
          const attackers = threats.filter((t) => t.threatenedPieceId === pieceId);

          if (attackers.length > 0) {
            const autoAttackerId = attackers[0].threatenedByPieceId;
            const attackerMoves = await client.getValidMoves(gameId, autoAttackerId);
            set({
              selectedPieceId: autoAttackerId,
              validMoves: attackerMoves,
              turnPhase: 'PIECE_SELECTED',
              isBusy: false,
              errorMessage: null,
              statusMessage: `Wybrano Twój pionek ${autoAttackerId}. Kliknij wrogiego pionka ${pieceId}, aby wykonać zbicie!`,
            });
            return;
          }
        } catch (err) {
          await handleFailure(err, 'AWAITING_SELECTION');
          return;
        }

        const myColor = gameState.turn === 'RED' ? 'Czerwony (RED)' : 'Niebieski (BLUE)';
        const oppColor = piece.color === 'RED' ? 'Czerwony (RED)' : 'Niebieski (BLUE)';
        set({ isBusy: false });
        reject(pieceId, {
          statusMessage: `To jest pionek przeciwnika (${pieceId} - ${oppColor}). Twoja tura: ${myColor}. Wybierz swój pionek.`,
          errorMessage: null,
        });
        return;
      }

      // If clicked on currently selected friendly piece, deselect it
      if (selectedPieceId === pieceId) {
        get().unselectPiece();
        return;
      }

      // Wymuszenie ruchu (Braxed): Check if current player is under Brax enforcement.
      // The enforcement lives in the state the engine returned, so this is a read,
      // not a second opinion about the rules.
      const activeBrax = gameState.activeBrax;
      if (activeBrax && activeBrax.victimColor === gameState.turn) {
        if (!activeBrax.threatenedPieceIds.includes(pieceId)) {
          reject(pieceId, {
            errorMessage: `You are Braxed! Move a threatened piece (${activeBrax.threatenedPieceIds.join(
              ', '
            )}).`,
            statusMessage: null,
          });
          return;
        }
      }

      set({ isBusy: true });
      let legalMoves: MoveAction[];
      try {
        legalMoves = await client.getValidMoves(gameId, pieceId);
      } catch (err) {
        await handleFailure(err, 'AWAITING_SELECTION');
        return;
      }

      const selection: Partial<GameStoreState> = {
        selectedPieceId: pieceId,
        validMoves: legalMoves,
        turnPhase: 'PIECE_SELECTED' as TurnPhase,
        isBusy: false,
        errorMessage: null,
        statusMessage:
          legalMoves.length === 0
            ? `Pionek ${pieceId} nie ma dostępnych legalnych ruchów w tej turze.`
            : null,
      };

      // A piece that is selectable but frozen gets the same shake as a refusal:
      // nothing lights up on the board, so the tap would otherwise feel ignored.
      if (legalMoves.length === 0) {
        reject(pieceId, selection);
      } else {
        set(selection);
      }
    },

    unselectPiece: () => {
      set({
        selectedPieceId: null,
        validMoves: [],
        turnPhase: 'AWAITING_SELECTION',
        errorMessage: null,
        statusMessage: null,
      });
    },

    selectDestination: async (targetCoord: NodeCoord) => {
      const gameId = requireGameId();
      const { selectedPieceId, revision } = get();
      if (!gameId || !selectedPieceId) return;

      set({ isBusy: true });

      let options: MoveOptionsResult;
      try {
        options = await client.getMoveOptions(gameId, selectedPieceId, targetCoord);
      } catch (err) {
        await handleFailure(err, 'PIECE_SELECTED');
        return;
      }

      if (options.moves.length === 0) {
        // Not a refusal by the piece — the player simply aimed at the wrong node,
        // so the board flashes where the legal targets actually are.
        set((state) => ({
          isBusy: false,
          targetHintNonce: state.targetHintNonce + 1,
          errorMessage: null,
        }));
        return;
      }

      const baseMove = options.moves[0];

      // Faza "Braxing": the engine already decided whether this move may declare.
      if (options.canCallBrax) {
        set({
          isBusy: false,
          pendingMove: baseMove,
          turnPhase: 'PENDING_BRAX_CHOICE',
          errorMessage: null,
          statusMessage: 'Ruch stwarza bezpośrednie zagrożenie! Czy chcesz ogłosić Brax?',
        });
        return;
      }

      try {
        const outcome = await client.applyMove(
          gameId,
          { ...baseMove, callBrax: false },
          { expectedRevision: revision }
        );
        applyOutcome(outcome);
      } catch (err) {
        await handleFailure(err, 'AWAITING_SELECTION');
      }
    },

    confirmBraxChoice: async (callBrax: boolean) => {
      const gameId = requireGameId();
      const { pendingMove, revision } = get();
      if (!gameId || !pendingMove) return;

      set({ isBusy: true });

      try {
        const outcome = await client.applyMove(
          gameId,
          { ...pendingMove, callBrax },
          { expectedRevision: revision }
        );
        applyOutcome(outcome);
        return;
      } catch (err) {
        // A refused Brax declaration should not cost the player their move:
        // fall back to the same move played plainly, if the engine allows it.
        const braxRefused = isEngineError(err) && err.code === 'INVALID_MOVE' && callBrax;
        if (!braxRefused) {
          await handleFailure(err, 'AWAITING_SELECTION');
          return;
        }

        try {
          const outcome = await client.applyMove(
            gameId,
            { ...pendingMove, callBrax: false },
            { expectedRevision: get().revision }
          );
          applySnapshot(outcome.snapshot, {
            statusMessage: 'Wykonano zwykły ruch (Brax nie był dozwolony).',
          });
        } catch (fallbackErr) {
          await handleFailure(fallbackErr, 'AWAITING_SELECTION');
        }
      }
    },

    cancelPendingMove: () => {
      set({
        pendingMove: null,
        turnPhase: 'PIECE_SELECTED',
        statusMessage: 'Anulowano wybór opcji Brax.',
      });
    },

    undoMove: async () => {
      const gameId = requireGameId();
      if (!gameId || !get().canUndo) return;

      set({ isBusy: true });
      try {
        applySnapshot(await client.undo(gameId), { statusMessage: 'Cofnięto ostatni ruch.' });
      } catch (err) {
        await handleFailure(err, 'AWAITING_SELECTION');
      }
    },

    resetGame: async (modeId) => {
      const { gameId, gameModeId } = get();
      const nextMode = modeId || gameModeId;

      if (!gameId) {
        await get().initGame(nextMode);
        return;
      }

      set({ isBusy: true });
      try {
        applySnapshot(await client.resetGame(gameId, nextMode));
      } catch (err) {
        if (isEngineError(err) && err.code === 'GAME_NOT_FOUND') {
          await get().initGame(nextMode);
          return;
        }
        await handleFailure(err, 'AWAITING_SELECTION');
      }
    },

    loadCustomState: async (customState: GameState) => {
      const { gameId } = get();
      set({ isBusy: true });

      try {
        // Without a session yet, the scenario seeds a brand new one.
        const snapshot = gameId
          ? await client.loadState(gameId, customState)
          : await client.createGame({ state: customState });
        applySnapshot(snapshot);
      } catch (err) {
        await handleFailure(err, 'AWAITING_SELECTION');
      }
    },

    dismissError: () => {
      set({ errorMessage: null, connectionError: null });
    },
  };

  return store;
});

/**
 * Opens a session so the first render has a board to draw. Kept out of the
 * store initializer because Zustand discards state written before the creator
 * returns; tests call it explicitly against their own client.
 */
export function bootstrapGameSession(modeId = 'two_player'): Promise<void> {
  return useGameStore.getState().initGame(modeId);
}
