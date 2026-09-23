/**
 * Brax Mobile UI - Primary Screen Component (React Native)
 *
 * The screen is laid out around a single priority: while a game is on, the board
 * is the interface. Everything else is either a one-line header (whose turn it is,
 * plus undo and new game as icons) or an overlay that appears only when it has
 * something to say. Nothing scrolls and nothing sits below the board, so the board
 * takes every pixel the device has left and its pieces are drawn as large as that
 * space allows — which is what makes them reachable under a fingertip.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
// React Native's own SafeAreaView is deprecated (and was iOS-only); the insets
// now come from react-native-safe-area-context, which works on Android, iOS and
// react-native-web alike.
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

/**
 * SafeAreaProvider renders *no children at all* until it has measured its own
 * insets, and on web `initialWindowMetrics` is null — so without a seed the
 * first paint is empty and everything inside, including the board's own width
 * measurement, happens a frame late against a container that is still settling.
 * Zero insets plus the window frame is the right starting point for the web
 * simulator; on a device the measured values land immediately after and correct
 * any real inset.
 */
const INITIAL_METRICS = initialWindowMetrics ?? {
  frame: {
    x: 0,
    y: 0,
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
import { AI_DIFFICULTIES, DIFFICULTY_PROFILES } from '@brax/engine/view';
import type { AIDifficulty, PlayerColor } from '@brax/engine/view';
import { PLAYER_PALETTE, SIGNAL } from '../theme.ts';
import { useGameStore, bootstrapGameSession, selectIsBotThinking } from '../store/useGameStore.ts';
import { BraxBoard } from './BraxBoard.tsx';
import { BraxModal } from './BraxModal.tsx';

/** How long the new-game button stays armed before it disarms itself. */
const RESET_CONFIRM_MS = 4000;

/** Polish labels for the difficulty badges, keyed by the engine's own ids. */
const DIFFICULTY_LABELS: Record<AIDifficulty, string> = {
  novice: 'Nowicjusz',
  intermediate: 'Średni',
  master: 'Mistrz',
};

/**
 * On web this screen is still an app, not a document: none of its text is there
 * to be copied, and letting the browser select it turns a missed grab at a piece
 * into a highlighted header. Native platforms already behave this way, so the
 * rule only has to be stated for the web build. The board repeats it for its own
 * surface, where a stray selection would also hijack the drag gesture.
 */
const WEB_UNSELECTABLE =
  Platform.OS === 'web'
    ? ({
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
      } as never)
    : null;

/**
 * The screen is also the mobile app's root, and it is embedded in hosts (such as
 * the web simulator) that provide no provider of their own, so it carries its
 * own SafeAreaProvider rather than relying on one above it.
 */
export const MobileGameScreen: React.FC = () => (
  <SafeAreaProvider initialMetrics={INITIAL_METRICS}>
    <MobileGameScreenContent />
  </SafeAreaProvider>
);

const MobileGameScreenContent: React.FC = () => {
  // The board must size itself to the space this screen actually gets, not to the
  // window: when this screen is embedded in the web simulator's phone frame, the
  // window is far wider than the frame and a window-sized board overflows it.
  const [boardSize, setBoardSize] = React.useState<number | null>(null);

  // New game wipes the game and is now behind a small icon, so it is armed by one
  // press and fired by a second rather than going off on a mis-tap.
  const [resetArmed, setResetArmed] = React.useState(false);

  // Opponent setup is a sheet rather than a permanent strip: it is touched once
  // at the start of a game and would otherwise spend the whole match taking
  // pixels away from the board.
  const [setupOpen, setSetupOpen] = React.useState(false);

  const {
    gameId,
    gameState,
    turnPhase,
    connectionError,
    isBusy,
    canUndo,
    botConfig,
    isBotTurnInFlight,
    undoMove,
    resetGame,
    dismissError,
    initGame,
    playBotTurn,
  } = useGameStore();

  const isBotThinking = useGameStore(selectIsBotThinking);

  // The engine may be a hosted service, so the first position arrives after a
  // round trip. Opening the session here (rather than at module load) keeps the
  // screen self-sufficient wherever it is embedded, and is idempotent.
  React.useEffect(() => {
    if (!gameId && turnPhase === 'CONNECTING' && !isBusy) {
      void bootstrapGameSession();
    }
  }, [gameId, turnPhase, isBusy]);

  React.useEffect(() => {
    if (!resetArmed) return;
    const timer = setTimeout(() => setResetArmed(false), RESET_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [resetArmed]);

  /**
   * Hands the turn to the bot whenever the position says it is the bot's.
   *
   * Driven off the position, not off the player's move, which is what makes the
   * "human plays BLUE" case need no special handling at all: on a fresh board
   * RED is to move, RED is the bot, and this fires on the very first render.
   * The same property covers undo, reset and a mid-game colour switch.
   *
   * `playBotTurn` is idempotent and guards its own preconditions, so firing it
   * once per render pass is safe.
   *
   * `isBusy` and `isBotTurnInFlight` are dependencies even though this effect
   * never reads them, because `playBotTurn` does - it declines while either is
   * set. Without them a bot turn that arrived during a busy moment would be
   * dropped and never retried: the position would not change, so nothing would
   * re-run this, and the board would sit on the bot's turn forever. Listing
   * them means the attempt is simply made again once the way is clear.
   */
  React.useEffect(() => {
    if (!gameState || gameState.result !== null) return;
    if (!botConfig.enabled || gameState.turn !== botConfig.botColor) return;
    void playBotTurn();
  }, [
    gameState,
    botConfig.enabled,
    botConfig.botColor,
    botConfig.difficulty,
    isBusy,
    isBotTurnInFlight,
    playBotTurn,
  ]);

  if (!gameState) {
    return (
      <SafeAreaView style={[styles.safeArea, WEB_UNSELECTABLE]}>
        <View style={styles.connectingWrapper}>
          <Text style={styles.connectingTitle}>BRAX</Text>
          <Text style={styles.connectingText}>
            {connectionError ?? 'Łączenie z silnikiem gry...'}
          </Text>
          {connectionError && (
            <TouchableOpacity style={styles.gameOverBtn} onPress={() => initGame()}>
              <Text style={styles.gameOverBtnText}>Spróbuj ponownie</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const isRedTurn = gameState.turn === 'RED';
  const isGameOver = gameState.result !== null;
  // Undo is refused by the store while the bot is on the clock, so the button
  // has to look refused too - a control that accepts a press and does nothing
  // reads as a broken app rather than as a rule.
  const undoDisabled = !canUndo || isBusy || isBotThinking;

  return (
    <SafeAreaView style={[styles.safeArea, WEB_UNSELECTABLE]}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.screen}>
        {/* One-line command bar: whose turn it is, and the only two actions a game
            in progress needs. Both are icons, pushed clear of the board. */}
        <View style={styles.header}>
          <View style={styles.turnBadge}>
            <View
              style={[
                styles.turnDot,
                { backgroundColor: PLAYER_PALETTE[isRedTurn ? 'RED' : 'BLUE'].piece },
              ]}
            />
            <Text style={styles.turnText}>{isRedTurn ? 'CZERWONY' : 'NIEBIESKI'}</Text>
          </View>

          {/* One discreet pill, never two: while the bot is on the clock it says
              so, and the rest of the time it is the shortcut into setup. Both
              live in the same slot so the header never reflows mid-game. */}
          {isBotThinking ? (
            <View style={styles.botPill} accessibilityLabel="Bot myśli">
              <View style={styles.botPillDot} />
              <Text style={styles.botPillText}>Bot myśli…</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.modePill}
              accessibilityLabel="Ustawienia przeciwnika"
              onPress={() => setSetupOpen(true)}
            >
              <Text style={styles.modePillText}>
                {botConfig.enabled
                  ? `Bot · ${DIFFICULTY_LABELS[botConfig.difficulty]}`
                  : '2 Graczy'}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.headerActions}>
            {resetArmed ? (
              <>
                <TouchableOpacity
                  style={[styles.iconBtn, styles.confirmBtn, isBusy && styles.disabledBtn]}
                  disabled={isBusy}
                  accessibilityLabel="Potwierdź nową grę"
                  onPress={() => {
                    setResetArmed(false);
                    void resetGame();
                  }}
                >
                  <Text style={styles.confirmBtnText}>Nowa gra?</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  accessibilityLabel="Anuluj"
                  onPress={() => setResetArmed(false)}
                >
                  <Text style={styles.iconBtnText}>✕</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.iconBtn, undoDisabled && styles.disabledBtn]}
                  disabled={undoDisabled}
                  accessibilityLabel="Cofnij ruch"
                  onPress={() => void undoMove()}
                >
                  <Text style={[styles.iconBtnText, undoDisabled && styles.disabledBtnText]}>
                    ↩
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconBtn, isBusy && styles.disabledBtn]}
                  disabled={isBusy}
                  accessibilityLabel="Nowa gra"
                  onPress={() => setResetArmed(true)}
                >
                  <Text style={[styles.iconBtnText, isBusy && styles.disabledBtnText]}>＋</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* The board claims all remaining space and takes the shorter of the two
            axes, so it is as large as the device allows in either orientation. */}
        <View
          style={styles.boardWrapper}
          onLayout={(e) => {
            // A container laid out while it is hidden — a background tab, or a
            // frame that has not been sized yet — measures 0. Latching that
            // would leave the board stuck until something forced a re-layout,
            // which is why rotating the screen used to be the way to fix it.
            const { width, height } = e.nativeEvent.layout;
            const side = Math.min(width, height);
            if (side > 0) setBoardSize(side);
          }}
        >
          {boardSize !== null && <BraxBoard size={boardSize} />}
        </View>
      </View>

      {/* Game over: an overlay rather than a card in the flow, so the final
          position stays exactly where it was played. */}
      {isGameOver && (
        <View style={styles.overlay}>
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
              onPress={() => void resetGame()}
            >
              <Text style={styles.gameOverBtnText}>Zagraj ponownie</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* A lost engine connection is not a rules refusal, so it gets its own
          banner rather than the status strip's error slot. It floats over the
          board instead of taking space from it — a reconnect must not resize
          the board under the player's hand. */}
      {connectionError && (
        <TouchableOpacity style={styles.connectionBanner} onPress={dismissError}>
          <Text style={styles.connectionBannerText}>{connectionError}</Text>
        </TouchableOpacity>
      )}

      {setupOpen && <BotSetupSheet onClose={() => setSetupOpen(false)} />}

      {/* Brax Choice Modal */}
      <BraxModal />
    </SafeAreaView>
  );
};

/**
 * Opponent setup, as a bottom sheet.
 *
 * Everything is a full-width row of large buttons rather than a switch or a
 * picker: the whole sheet has to be workable with one thumb on a phone held in
 * one hand, and a 44pt target that says what it does beats a control that needs
 * a second hand to hit and a label to explain.
 *
 * Choices apply immediately and do not restart the game. Switching colour
 * mid-game simply hands the other side to the bot, which answers on its next
 * turn - there is nothing here that needs a confirmation step.
 */
const BotSetupSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { botConfig, setBotConfig, resetExperience, resetGame } = useGameStore();
  const humanColor: PlayerColor = botConfig.botColor === 'RED' ? 'BLUE' : 'RED';

  return (
    <View style={styles.overlay}>
      {/* The scrim closes the sheet, which is how a bottom sheet is expected to
          behave and saves a thumb the trip to a close button. */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        accessibilityLabel="Zamknij ustawienia"
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Przeciwnik</Text>

        <View style={styles.sheetRow}>
          <SheetButton
            label="2 Graczy"
            active={!botConfig.enabled}
            onPress={() => setBotConfig({ enabled: false })}
          />
          <SheetButton
            label="Gra z Botem"
            active={botConfig.enabled}
            onPress={() => setBotConfig({ enabled: true })}
          />
        </View>

        {botConfig.enabled && (
          <>
            <Text style={styles.sheetLabel}>Poziom</Text>
            <View style={styles.sheetRow}>
              {AI_DIFFICULTIES.map((level: AIDifficulty) => (
                <SheetButton
                  key={level}
                  label={DIFFICULTY_LABELS[level]}
                  // The badge carries the engine's own budget, so the levels are
                  // distinguishable by more than a name the player has to guess at.
                  hint={`${DIFFICULTY_PROFILES[level].minSimulations}+`}
                  active={botConfig.difficulty === level}
                  onPress={() => setBotConfig({ difficulty: level })}
                />
              ))}
            </View>

            <Text style={styles.sheetLabel}>Twój kolor</Text>
            <View style={styles.sheetRow}>
              <SheetButton
                label="Czerwony"
                hint="zaczynasz"
                active={humanColor === 'RED'}
                onPress={() => setBotConfig({ botColor: 'BLUE' })}
              />
              <SheetButton
                label="Niebieski"
                hint="bot zaczyna"
                active={humanColor === 'BLUE'}
                onPress={() => setBotConfig({ botColor: 'RED' })}
              />
            </View>

            <TouchableOpacity
              style={styles.sheetGhostBtn}
              accessibilityLabel="Wyczyść pamięć bota"
              onPress={() => void resetExperience()}
            >
              <Text style={styles.sheetGhostBtnText}>Wyczyść pamięć bota</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.sheetFooter}>
          <TouchableOpacity
            style={styles.sheetGhostBtn}
            accessibilityLabel="Nowa gra"
            onPress={() => {
              onClose();
              void resetGame();
            }}
          >
            <Text style={styles.sheetGhostBtnText}>Nowa gra</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetPrimaryBtn} onPress={onClose}>
            <Text style={styles.sheetPrimaryBtnText}>Graj</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const SheetButton: React.FC<{
  label: string;
  hint?: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, hint, active, onPress }) => (
  <TouchableOpacity
    style={[styles.sheetBtn, active && styles.sheetBtnActive]}
    accessibilityLabel={label}
    accessibilityState={{ selected: active }}
    onPress={onPress}
  >
    <Text style={[styles.sheetBtnText, active && styles.sheetBtnTextActive]}>{label}</Text>
    {hint && (
      <Text style={[styles.sheetBtnHint, active && styles.sheetBtnHintActive]}>{hint}</Text>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  screen: {
    flex: 1,
    padding: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  turnBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  turnDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  turnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  botPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  botPillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#2563EB',
  },
  botPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  modePill: {
    // Same 44pt rule as the icon buttons: this is a real control, not a label.
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  modePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 6,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  sheetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  sheetRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sheetBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  sheetBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  sheetBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
  },
  sheetBtnTextActive: {
    color: '#FFFFFF',
  },
  sheetBtnHint: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 2,
  },
  sheetBtnHintActive: {
    color: '#CBD5E1',
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  sheetGhostBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetGhostBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  sheetPrimaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  iconBtn: {
    // 44pt is the smallest target a thumb hits reliably: the icons are small,
    // the things you press are not.
    minWidth: 44,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: '#334155',
  },
  confirmBtn: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  disabledBtn: {
    opacity: 0.35,
  },
  disabledBtnText: {
    color: '#94A3B8',
  },
  boardWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    paddingHorizontal: 24,
  },
  gameOverCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: SIGNAL.select,
    borderRadius: 20,
    padding: 20,
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
  connectingWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  connectingTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 2,
  },
  connectingText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 8,
  },
  connectionBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 12,
  },
  connectionBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
});
