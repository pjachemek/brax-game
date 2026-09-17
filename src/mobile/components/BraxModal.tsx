/**
 * Brax Mobile UI - Brax Choice Action Modal Component (React Native)
 * Appears during TurnPhase.PENDING_BRAX_CHOICE when a move creates a direct threat.
 * Offers the player the tactical choice to declare "Call Brax!" or play a normal move.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useGameStore } from '../store/useGameStore.ts';

export const BraxModal: React.FC = () => {
  const {
    turnPhase,
    gameState,
    pendingMove,
    confirmBraxChoice,
    cancelPendingMove,
  } = useGameStore();

  const isVisible = turnPhase === 'PENDING_BRAX_CHOICE' && pendingMove !== null;
  const isRedTurn = gameState.turn === 'RED';
  const playerColorName = isRedTurn ? 'Czerwony (RED)' : 'Niebieski (BLUE)';

  if (!isVisible) return null;

  return (
    <Modal
      transparent
      visible={isVisible}
      animationType="fade"
      onRequestClose={cancelPendingMove}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header Badge */}
          <View style={[styles.badge, isRedTurn ? styles.redBadge : styles.blueBadge]}>
            <Text style={styles.badgeText}>Faza Tury: Zagrożenie Biciem</Text>
          </View>

          {/* Modal Title */}
          <Text style={styles.title}>OGŁOŚ BRAX!</Text>

          {/* Description */}
          <Text style={styles.description}>
            Twój ruch stwarza bezpośrednie zagrożenie zbicia pionka przeciwnika.
            Czy chcesz skorzystać z prawa do zawołania <Text style={styles.boldText}>Brax</Text>?
          </Text>

          {/* Tactical Explanation */}
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              • <Text style={styles.boldText}>Call Brax</Text>: Przeciwnik w swojej turze będzie{' '}
              <Text style={styles.boldText}>zmuszony ruszyć wyłącznie zagrożony pionek</Text>.
            </Text>
            <Text style={[styles.infoText, { marginTop: 6 }]}>
              • <Text style={styles.boldText}>Zwykły ruch</Text>: Przeciwnik zachowuje pełną swobodę wyboru pionka.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonGroup}>
            {/* Primary Action: Call Brax */}
            <TouchableOpacity
              style={[styles.btn, styles.btnBrax]}
              activeOpacity={0.8}
              onPress={() => confirmBraxChoice(true)}
            >
              <Text style={styles.btnBraxText}>⚔️ Ogłoś Brax! (Call Brax)</Text>
            </TouchableOpacity>

            {/* Secondary Action: Normal Move */}
            <TouchableOpacity
              style={[styles.btn, styles.btnNormal]}
              activeOpacity={0.8}
              onPress={() => confirmBraxChoice(false)}
            >
              <Text style={styles.btnNormalText}>Zwykły ruch (Bez Brax)</Text>
            </TouchableOpacity>

            {/* Tertiary: Cancel */}
            <TouchableOpacity
              style={[styles.btn, styles.btnCancel]}
              activeOpacity={0.7}
              onPress={cancelPendingMove}
            >
              <Text style={styles.btnCancelText}>Anuluj i zmień ruch</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 12,
  },
  redBadge: {
    backgroundColor: '#FEE2E2',
  },
  blueBadge: {
    backgroundColor: '#DBEAFE',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
  },
  boldText: {
    fontWeight: '700',
    color: '#0F172A',
  },
  infoBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
    width: '100%',
    marginBottom: 20,
  },
  infoText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#334155',
  },
  buttonGroup: {
    width: '100%',
    gap: 10,
  },
  btn: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBrax: {
    backgroundColor: '#0F172A',
  },
  btnBraxText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  btnNormal: {
    backgroundColor: '#F1F5F9',
  },
  btnNormalText: {
    color: '#1E293B',
    fontSize: 14,
    fontWeight: '600',
  },
  btnCancel: {
    backgroundColor: 'transparent',
    paddingVertical: 8,
  },
  btnCancelText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '500',
  },
});
