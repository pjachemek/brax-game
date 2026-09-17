/**
 * Brax Mobile UI - Zustand Game Store
 * Manages game state, selection, valid moves, turn phases, and Brax choice dialogs.
 * Completely decoupled from rendering, ensuring high portability across React Native & Web.
 */

import { create } from 'zustand';
import { GameStoreState, TurnPhase } from '../types.ts';
import { GameState, MoveAction, NodeCoord, Piece } from '../../engine/types.ts';
import { defaultBraxEngine } from '../../engine/engine.ts';
import { findPieceCoord } from '../../engine/movement.ts';
import { areCoordsEqual } from '../../engine/geometry.ts';

export const useGameStore = create<GameStoreState>((set, get) => {
  const initialGameState = defaultBraxEngine.initGame('two_player');

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

  return {
    gameState: initialGameState,
    gameModeId: 'two_player',
    selectedPieceId: null,
    validMoves: [],
    turnPhase: 'AWAITING_SELECTION',
    pendingMove: null,
    statusMessage: null,
    errorMessage: null,
    rejectedPieceId: null,
    rejectionNonce: 0,
    targetHintNonce: 0,
    history: [],
    canUndo: false,

    initGame: (modeId = 'two_player') => {
      const fresh = defaultBraxEngine.initGame(modeId);
      set({
        gameState: fresh,
        gameModeId: modeId,
        selectedPieceId: null,
        validMoves: [],
        turnPhase: 'AWAITING_SELECTION',
        pendingMove: null,
        statusMessage: null,
        errorMessage: null,
        rejectedPieceId: null,
        history: [],
        canUndo: false,
      });
    },

    loadCustomState: (customState: GameState) => {
      set({
        gameState: customState,
        gameModeId: customState.gameModeId,
        selectedPieceId: null,
        validMoves: [],
        turnPhase: customState.result ? 'GAME_OVER' : 'AWAITING_SELECTION',
        pendingMove: null,
        statusMessage: null,
        errorMessage: null,
        rejectedPieceId: null,
      });
    },

    selectPiece: (pieceId: string) => {
      const { gameState, selectedPieceId, validMoves } = get();

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
            get().selectDestination(coord);
            return;
          }
        }

        // Check if any friendly piece currently threatens this opponent piece:
        const threats = defaultBraxEngine.getThreats(gameState, gameState.turn);
        const attackers = threats.filter((t) => t.threatenedPieceId === pieceId);
        if (attackers.length > 0) {
          const autoAttackerId = attackers[0].threatenedByPieceId;
          const attackerMoves = defaultBraxEngine.getValidMoves(gameState, autoAttackerId);
          set({
            selectedPieceId: autoAttackerId,
            validMoves: attackerMoves,
            turnPhase: 'PIECE_SELECTED',
            errorMessage: null,
            statusMessage: `Wybrano Twój pionek ${autoAttackerId}. Kliknij wrogiego pionka ${pieceId}, aby wykonać zbicie!`,
          });
          return;
        }

        const myColor = gameState.turn === 'RED' ? 'Czerwony (RED)' : 'Niebieski (BLUE)';
        const oppColor = piece.color === 'RED' ? 'Czerwony (RED)' : 'Niebieski (BLUE)';
        reject(pieceId, {
          statusMessage: `To jest pionek przeciwnika (${pieceId} - ${oppColor}). Twoja tura: ${myColor}. Wybierz swój pionek.`,
          errorMessage: null,
        });
        return;
      }

      // If clicked on currently selected friendly piece, deselect it
      if (selectedPieceId === pieceId) {
        set({
          selectedPieceId: null,
          validMoves: [],
          turnPhase: 'AWAITING_SELECTION',
          statusMessage: null,
        });
        return;
      }

      // Wymuszenie ruchu (Braxed): Check if current player is under Brax enforcement
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

      // Fetch legal moves from the pure engine
      const legalMoves = defaultBraxEngine.getValidMoves(gameState, pieceId);

      const selection: Partial<GameStoreState> = {
        selectedPieceId: pieceId,
        validMoves: legalMoves,
        turnPhase: 'PIECE_SELECTED' as TurnPhase,
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

    selectDestination: (targetCoord: NodeCoord) => {
      const { gameState, selectedPieceId, validMoves } = get();
      if (!selectedPieceId) return;

      // Find candidate moves targeting this coordinate
      const matchingMoves = validMoves.filter((m) => areCoordsEqual(m.to, targetCoord));
      if (matchingMoves.length === 0) {
        // Not a refusal by the piece — the player simply aimed at the wrong node,
        // so the board flashes where the legal targets actually are.
        set((state) => ({
          targetHintNonce: state.targetHintNonce + 1,
          errorMessage: null,
        }));
        return;
      }

      const baseMove = matchingMoves[0];

      // Faza "Braxing": Check if this move can legally call Brax
      // A move can call Brax if at least one variant has callBrax === true
      // or validateMove({ ...baseMove, callBrax: true }).valid is true
      const canCallBrax =
        matchingMoves.some((m) => m.callBrax === true) ||
        defaultBraxEngine.validateMove(gameState, { ...baseMove, callBrax: true }).valid;

      if (canCallBrax) {
        // Move creates threat and Brax is allowed! Present the Brax Choice dialog
        set({
          pendingMove: baseMove,
          turnPhase: 'PENDING_BRAX_CHOICE',
          errorMessage: null,
          statusMessage: 'Ruch stwarza bezpośrednie zagrożenie! Czy chcesz ogłosić Brax?',
        });
        return;
      }

      // Brax is not applicable; execute regular move immediately with callBrax: false
      const actionToExecute: MoveAction = {
        ...baseMove,
        callBrax: false,
      };

      try {
        const val = defaultBraxEngine.validateMove(gameState, actionToExecute);
        if (!val.valid) {
          set({
            errorMessage: val.reason,
            turnPhase: 'AWAITING_SELECTION',
            selectedPieceId: null,
            validMoves: [],
          });
          return;
        }

        const nextState = defaultBraxEngine.applyMove(gameState, actionToExecute);
        const victory = defaultBraxEngine.checkVictory(nextState);

        const lastHistory = nextState.history[nextState.history.length - 1];
        const captured = lastHistory?.capturedPiece;

        set((state) => ({
          gameState: nextState,
          history: [...state.history, state.gameState],
          canUndo: true,
          selectedPieceId: null,
          validMoves: [],
          pendingMove: null,
          turnPhase: victory ? 'GAME_OVER' : 'AWAITING_SELECTION',
          errorMessage: null,
          statusMessage: captured
            ? `Zbicie! Pionek ${captured.id} został zbity.`
            : null,
        }));
      } catch (err: any) {
        // Safe error handling - restore UI without crashing
        set({
          errorMessage: err?.message || 'Błąd podczas wykonywania ruchu.',
          selectedPieceId: null,
          validMoves: [],
          pendingMove: null,
          turnPhase: 'AWAITING_SELECTION',
        });
      }
    },

    confirmBraxChoice: (callBrax: boolean) => {
      const { gameState, pendingMove, history } = get();
      if (!pendingMove) return;

      const finalAction: MoveAction = {
        ...pendingMove,
        callBrax,
      };

      try {
        const validation = defaultBraxEngine.validateMove(gameState, finalAction);
        if (!validation.valid) {
          // If Brax was rejected, attempt fallback to normal move
          if (callBrax) {
            const fallbackAction: MoveAction = { ...pendingMove, callBrax: false };
            const fallbackVal = defaultBraxEngine.validateMove(gameState, fallbackAction);
            if (fallbackVal.valid) {
              const fallbackNext = defaultBraxEngine.applyMove(gameState, fallbackAction);
              const victory = defaultBraxEngine.checkVictory(fallbackNext);
              set({
                gameState: fallbackNext,
                history: [...history, gameState],
                canUndo: true,
                selectedPieceId: null,
                validMoves: [],
                pendingMove: null,
                turnPhase: victory ? 'GAME_OVER' : 'AWAITING_SELECTION',
                errorMessage: null,
                statusMessage: 'Wykonano zwykły ruch (Brax nie był dozwolony).',
              });
              return;
            }
          }

          set({
            errorMessage: validation.reason,
            turnPhase: 'AWAITING_SELECTION',
            pendingMove: null,
            selectedPieceId: null,
            validMoves: [],
          });
          return;
        }

        const nextState = defaultBraxEngine.applyMove(gameState, finalAction);
        const victory = defaultBraxEngine.checkVictory(nextState);
        const lastEntry = nextState.history[nextState.history.length - 1];
        const captured = lastEntry?.capturedPiece;

        let msg: string | null = null;
        if (callBrax && nextState.activeBrax) {
          msg = `Brax ogłoszony! Przeciwnik musi ruszyć zagrożonym pionkiem (${nextState.activeBrax.threatenedPieceIds.join(', ')}).`;
        } else if (captured) {
          msg = `Zbicie! Pionek ${captured.id} został pomyślnie zbity.`;
        }

        set({
          gameState: nextState,
          history: [...history, gameState],
          canUndo: true,
          selectedPieceId: null,
          validMoves: [],
          pendingMove: null,
          turnPhase: victory ? 'GAME_OVER' : 'AWAITING_SELECTION',
          errorMessage: null,
          statusMessage: msg,
        });
      } catch (err: any) {
        // Graceful error rollback
        set({
          errorMessage: err?.message || 'Błąd podczas zatwierdzania ruchu.',
          pendingMove: null,
          selectedPieceId: null,
          validMoves: [],
          turnPhase: 'AWAITING_SELECTION',
        });
      }
    },

    cancelPendingMove: () => {
      set({
        pendingMove: null,
        turnPhase: 'PIECE_SELECTED',
        statusMessage: 'Anulowano wybór opcji Brax.',
      });
    },

    undoMove: () => {
      const { history } = get();
      if (history.length === 0) return;

      const previousState = history[history.length - 1];
      const newHistory = history.slice(0, history.length - 1);

      set({
        gameState: previousState,
        history: newHistory,
        canUndo: newHistory.length > 0,
        selectedPieceId: null,
        validMoves: [],
        pendingMove: null,
        turnPhase: 'AWAITING_SELECTION',
        errorMessage: null,
        statusMessage: 'Cofnięto ostatni ruch.',
      });
    },

    resetGame: (modeId) => {
      get().initGame(modeId || get().gameModeId);
    },

    dismissError: () => {
      set({ errorMessage: null });
    },
  };
});
