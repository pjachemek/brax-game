/**
 * Brax Mobile UI - Primary Screen Component (React Native)
 * Orchestrates the full mobile game view: header, scoreboard, Braxed restriction alerts,
 * responsive 9x9 board, interactive bottom controls, and the Brax action modal.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useGameStore } from './useGameStore.ts';
import { BraxBoard } from './BraxBoard.tsx';
import { BraxModal } from './BraxModal.tsx';

export const MobileGameScreen: React.FC = () => {
  // The board must size itself to the space this screen actually gets, not to the
  // window: when this screen is embedded in the web simulator's phone frame, the
  // window is far wider than the frame and a window-sized board overflows it.
  const [boardWidth, setBoardWidth] = React.useState<number | null>(null);

  const {
    gameState,
    selectedPieceId,
    turnPhase,
    statusMessage,
    errorMessage,
    canUndo,
    undoMove,
    resetGame,
    dismissError,
    unselectPiece,
  } = useGameStore();

  const isRedTurn = gameState.turn === 'RED';
  const isGameOver = gameState.result !== null;

  // Check if current player is under Brax enforcement
  const isBraxed =
    gameState.activeBrax !== null &&
    gameState.activeBrax.victimColor === gameState.turn;
  const braxThreatenedIds = isBraxed
    ? gameState.activeBrax!.threatenedPieceIds
    : [];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* App Bar Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>BRAX</Text>
            <Text style={styles.subtitle}>F. B. Denham • Rules Engine</Text>
          </View>

          <View style={styles.turnBadgeContainer}>
            <View
              style={[
                styles.turnDot,
                { backgroundColor: isRedTurn ? '#DC2626' : '#2563EB' },
              ]}
            />
            <Text style={styles.turnText}>
              {isRedTurn ? 'Tura: CZERWONY' : 'Tura: NIEBIESKI'}
            </Text>
          </View>
        </View>

        {/* Brax Enforcement Alert Banner (Required by prompt) */}
        {isBraxed && (
          <View style={styles.braxAlertBanner}>
            <Text style={styles.braxAlertIcon}>⚠️</Text>
            <View style={styles.braxAlertTextContainer}>
              <Text style={styles.braxAlertTitle}>
                You are Braxed! Move a threatened piece.
              </Text>
              <Text style={styles.braxAlertSubtitle}>
                Możesz poruszyć wyłącznie zagrożony pionek:{' '}
                <Text style={styles.boldText}>{braxThreatenedIds.join(', ')}</Text>
              </Text>
            </View>
          </View>
        )}

        {/* Error Notification Banner */}
        {errorMessage && (
          <TouchableOpacity
            style={styles.errorBanner}
            activeOpacity={0.8}
            onPress={dismissError}
          >
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Text style={styles.errorDismiss}>✕</Text>
          </TouchableOpacity>
        )}

        {/* Informational Status Banner */}
        {statusMessage && !errorMessage && !isBraxed && (
          <View style={styles.statusBanner}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        )}

        {/* Scoreboard & Captured Graveyard */}
        <View style={styles.scoreboard}>
          {/* Red Player Stats */}
          <View
            style={[
              styles.playerScoreCard,
              isRedTurn && styles.activePlayerScoreCard,
            ]}
          >
            <View style={styles.playerInfoRow}>
              <View style={[styles.playerColorCircle, { backgroundColor: '#DC2626' }]} />
              <Text style={styles.playerName}>Czerwony</Text>
            </View>
            <Text style={styles.capturedCount}>
              Zbito: {gameState.capturedPieces.RED.length}
            </Text>
          </View>

          {/* Blue Player Stats */}
          <View
            style={[
              styles.playerScoreCard,
              !isRedTurn && styles.activePlayerScoreCard,
            ]}
          >
            <View style={styles.playerInfoRow}>
              <View style={[styles.playerColorCircle, { backgroundColor: '#2563EB' }]} />
              <Text style={styles.playerName}>Niebieski</Text>
            </View>
            <Text style={styles.capturedCount}>
              Zbito: {gameState.capturedPieces.BLUE.length}
            </Text>
          </View>
        </View>

        {/* Main Responsive Game Board */}
        <View
          style={styles.boardWrapper}
          onLayout={(e) => setBoardWidth(e.nativeEvent.layout.width)}
        >
          {boardWidth !== null && <BraxBoard size={boardWidth} />}
        </View>

        {/* Selected Piece Floating Indicator */}
        {selectedPieceId && (
          <View style={styles.selectionBar}>
            <Text style={styles.selectionText}>
              Wybrano pionek: <Text style={styles.boldText}>{selectedPieceId}</Text> (Dotknij węzła docelowego)
            </Text>
            <TouchableOpacity onPress={unselectPiece} style={styles.unselectBtn}>
              <Text style={styles.unselectBtnText}>Odznacz</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom Game Controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, !canUndo && styles.disabledBtn]}
            disabled={!canUndo}
            onPress={undoMove}
          >
            <Text style={[styles.actionBtnText, !canUndo && styles.disabledBtnText]}>
              ↩ Cofnij ruch
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.resetBtn]}
            onPress={() => resetGame()}
          >
            <Text style={styles.resetBtnText}>↺ Nowa gra</Text>
          </TouchableOpacity>
        </View>

        {/* Game Over Modal / Card */}
        {isGameOver && (
          <View style={styles.gameOverCard}>
            <Text style={styles.gameOverTitle}>KONIEC GRY</Text>
            <Text style={styles.gameOverWinner}>
              {gameState.result?.winner === 'RED'
                ? 'Zwycięstwo: GRACZ CZERWONY!'
                : gameState.result?.winner === 'BLUE'
                ? 'Zwycięstwo: GRACZ NIEBIESKI!'
                : 'REMIS!'}
            </Text>
            <Text style={styles.gameOverReason}>
              Powód: {gameState.result?.description || gameState.result?.reason}
            </Text>
            <TouchableOpacity
              style={styles.gameOverBtn}
              onPress={() => resetGame()}
            >
              <Text style={styles.gameOverBtnText}>Zagraj ponownie</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Brax Choice Modal */}
      <BraxModal />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  turnBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  turnDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  turnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  braxAlertBanner: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  braxAlertIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  braxAlertTextContainer: {
    flex: 1,
  },
  braxAlertTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
  },
  braxAlertSubtitle: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
  },
  errorBanner: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '600',
    flex: 1,
  },
  errorDismiss: {
    fontSize: 14,
    color: '#991B1B',
    fontWeight: '700',
    marginLeft: 8,
  },
  statusBanner: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    color: '#1E40AF',
    fontWeight: '600',
    textAlign: 'center',
  },
  scoreboard: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  playerScoreCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  activePlayerScoreCard: {
    borderColor: '#0F172A',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  playerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  playerColorCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  playerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  capturedCount: {
    fontSize: 12,
    color: '#64748B',
  },
  boardWrapper: {
    // Matches the width rules of the banners above so the board lines up with them,
    // and reserves its square footprint up front so nothing jumps once measured.
    width: '100%',
    maxWidth: 480,
    aspectRatio: 1,
    marginVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionBar: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectionText: {
    fontSize: 12,
    color: '#065F46',
    flex: 1,
  },
  unselectBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#D1FAE5',
    borderRadius: 6,
    marginLeft: 8,
  },
  unselectBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  controlsRow: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  disabledBtn: {
    opacity: 0.4,
  },
  disabledBtnText: {
    color: '#94A3B8',
  },
  resetBtn: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  gameOverCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  gameOverTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#065F46',
    letterSpacing: 1,
    marginBottom: 4,
  },
  gameOverWinner: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  gameOverReason: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
  },
  gameOverBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
  },
  gameOverBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  boldText: {
    fontWeight: '700',
  },
});
