/**
 * Brax Mobile UI Simulator & Code Inspector
 * Presents an interactive mobile phone container running the React Native / Zustand UI,
 * side-by-side with an architecture breakdown and file code inspector.
 */

import React, { useState } from 'react';
import { MobileGameScreen, useGameStore } from '@brax/mobile-ui';
import {
  Smartphone,
  Code2,
  CheckCircle2,
  Copy,
  Layers,
  Shield,
  Zap,
  RotateCcw,
  Sparkles,
  Cpu,
} from 'lucide-react';

const CODE_SNIPPETS: Record<string, { title: string; filename: string; language: string; code: string; desc: string }> = {
  store: {
    title: 'Zustand Store (useGameStore.ts)',
    filename: 'packages/mobile-ui/src/store/useGameStore.ts',
    language: 'typescript',
    desc: 'Trzyma stan interakcji (zaznaczenie, faza tury) i projekcję sesji z silnika. Nie zawiera reguł: legalność ruchów, prawo do Brax, zbicia, wynik i cofanie przychodzą z BraxEngineClient.',
    code: `import { create } from 'zustand';
import { isEngineError } from '@brax/engine';
import { areCoordsEqual, findPieceCoord } from '@brax/engine/view';
import { getEngineClient } from '@brax/mobile-ui/engine';

// Silnik może być lokalny albo hostowany — store tego nie wie.
const client = () => getEngineClient();

export const useGameStore = create<GameStoreState>((set, get) => ({
  gameId: null,          // sesja jest autorytatywna po stronie silnika
  gameState: null,       // lokalna projekcja do renderowania
  revision: 0,           // ochrona przed wyścigiem: z czym się zgadzamy
  canUndo: false,        // historia żyje w sesji, nie tutaj
  selectedPieceId: null,
  validMoves: [],
  turnPhase: 'CONNECTING',
  pendingMove: null,
  isBusy: false,         // zapytanie w locie — blokuje kolejne dotknięcia
  connectionError: null, // brak sieci to nie to samo co zły ruch

  initGame: async (modeId = 'two_player') => {
    const snapshot = await client.createGame({ modeId });
    set({ gameId: snapshot.gameId, gameState: snapshot.state, revision: snapshot.revision });
  },

  selectPiece: async (pieceId: string) => {
    const { gameId, gameState } = get();
    // Wymuszenie Brax odczytujemy ze stanu, który zwrócił silnik.
    const activeBrax = gameState.activeBrax;
    if (activeBrax && activeBrax.victimColor === gameState.turn) {
      if (!activeBrax.threatenedPieceIds.includes(pieceId)) {
        set({ errorMessage: 'You are Braxed! Move a threatened piece' });
        return;
      }
    }
    const legalMoves = await client.getValidMoves(gameId, pieceId);
    set({ selectedPieceId: pieceId, validMoves: legalMoves, turnPhase: 'PIECE_SELECTED' });
  },

  selectDestination: async (targetCoord: NodeCoord) => {
    const { gameId, selectedPieceId, revision } = get();
    // O prawo do Brax pyta się silnik — to reguła, nie heurystyka UI.
    const { moves, canCallBrax } = await client.getMoveOptions(gameId, selectedPieceId, targetCoord);
    if (moves.length === 0) return;

    if (canCallBrax) {
      set({ pendingMove: moves[0], turnPhase: 'PENDING_BRAX_CHOICE' });
      return;
    }

    const outcome = await client.applyMove(
      gameId,
      { ...moves[0], callBrax: false },
      { expectedRevision: revision }   // odrzuci ruch, jeśli partia poszła dalej
    );
    set({ gameState: outcome.snapshot.state, revision: outcome.snapshot.revision });
  },
}));`,
  },
  board: {
    title: 'Responsive Board (BraxBoard.tsx)',
    filename: 'packages/mobile-ui/src/components/BraxBoard.tsx',
    language: 'tsx',
    desc: 'Renderowanie siatki 9x9 w react-native-svg, krawędzi ortogonalnych (RED/BLUE), etykiet startowych 1..7 oraz 81 punktów dotykowych. Rozmiar planszy pochodzi z pomiaru kontenera (onLayout), nie z szerokości okna.',
    code: `import React, { useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Line, Circle, G, Text as SvgText, Rect } from 'react-native-svg';
import { useGameStore } from '../store/useGameStore.ts';
import { PieceRenderer } from './PieceRenderer.tsx';
import { CANONICAL_BRAX_BOARD } from '@brax/engine/view';

export const BraxBoard: React.FC<{ size?: number }> = ({ size }) => {
  const windowDims = useWindowDimensions();
  // \`size\` is the width measured by the parent's onLayout; the window is only a
  // fallback, so the board fits its container instead of overflowing it.
  const boardSize = size ?? Math.min(windowDims.width - 24, 480);
  const padding = boardSize * 0.085;
  const cellSize = (boardSize - 2 * padding) / 8;
  const pieceRadius = Math.max(10, cellSize * 0.38);

  const { gameState, selectedPieceId, validMoves, selectPiece, selectDestination } = useGameStore();
  const allEdges = useMemo(() => CANONICAL_BRAX_BOARD.getAllEdges(), []);

  return (
    <View style={{ width: boardSize, height: boardSize }}>
      <Svg width={boardSize} height={boardSize}>
        {/* Orthogonal Edges */}
        {allEdges.map(edge => (
          <Line
            x1={padding + edge.from.x * cellSize}
            y1={padding + (8 - edge.from.y) * cellSize}
            x2={padding + edge.to.x * cellSize}
            y2={padding + (8 - edge.to.y) * cellSize}
            stroke={edge.color === 'RED' ? '#EF4444' : '#3B82F6'}
            strokeWidth={3}
          />
        ))}
        {/* Starting Ranks 1..7 */}
        {[1, 2, 3, 4, 5, 6, 7].map(num => (
          <SvgText x={padding + num * cellSize} y={padding - pieceRadius - 4} textAnchor="middle">{num}</SvgText>
        ))}
        {/* Pieces & Valid Move Highlights */}
        {/* ... (Mapped with PieceRenderer) */}
      </Svg>
    </View>
  );
};`,
  },
  piece: {
    title: 'Piece Renderer (PieceRenderer.tsx)',
    filename: 'packages/mobile-ui/src/components/PieceRenderer.tsx',
    language: 'tsx',
    desc: 'Renderuje pionki (okrąg RED/BLUE, wzór PLAIN vs MARKED, obwódki zaznaczenia i ostrzeżenia o zagrożeniu).',
    code: `import React from 'react';
import { G, Circle, Text as SvgText, Polygon } from 'react-native-svg';
import { Piece } from '@brax/engine/view';

export const PieceRenderer: React.FC<PieceRendererProps> = ({
  piece, cx, cy, radius, isSelected, isThreatened, isCaptureTarget, isBraxRestricted, onPress
}) => {
  const isRed = piece.color === 'RED';
  return (
    <G x={cx} y={cy} opacity={isBraxRestricted ? 0.45 : 1} onPress={onPress}>
      {isThreatened && <Circle r={radius * 1.35} stroke="#F59E0B" strokeWidth={2.5} strokeDasharray="4,3" fill="none" />}
      {isSelected && <Circle r={radius * 1.25} stroke="#10B981" strokeWidth={3} fill="none" />}
      <Circle r={radius} fill={isRed ? '#DC2626' : '#2563EB'} stroke={isRed ? '#991B1B' : '#1E40AF'} strokeWidth={1.5} />
      {piece.side === 'MARKED' ? (
        <Polygon points="..." fill="#FDE047" stroke="#CA8A04" />
      ) : (
        <SvgText y={radius * 0.22} textAnchor="middle" fill="#FFFFFF" fontWeight="bold">{piece.id}</SvgText>
      )}
    </G>
  );
};`,
  },
  modal: {
    title: 'Brax Choice Modal (BraxModal.tsx)',
    filename: 'packages/mobile-ui/src/components/BraxModal.tsx',
    language: 'tsx',
    desc: 'Wstrzymuje zakończenie tury, gdy ruch stwarza bezpośrednie zagrożenie i umożliwia wybór: "Call Brax!" lub "Zwykły ruch".',
    code: `import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { useGameStore } from '../store/useGameStore.ts';

export const BraxModal: React.FC = () => {
  const { turnPhase, confirmBraxChoice, cancelPendingMove } = useGameStore();
  if (turnPhase !== 'PENDING_BRAX_CHOICE') return null;

  return (
    <Modal transparent visible animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>OGŁOŚ BRAX!</Text>
          <Text>Twój ruch stwarza bezpośrednie zagrożenie zbicia. Czy chcesz ogłosić Brax?</Text>
          <TouchableOpacity onPress={() => confirmBraxChoice(true)}>
            <Text>⚔️ Ogłoś Brax! (Call Brax)</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => confirmBraxChoice(false)}>
            <Text>Zwykły ruch (Bez Brax)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};`,
  },
};

export const MobileSimulatorView: React.FC = () => {
  const [activeCodeTab, setActiveCodeTab] = useState<string>('store');
  const [copied, setCopied] = useState<boolean>(false);
  const store = useGameStore();

  const handleCopyCode = () => {
    navigator.clipboard.writeText(CODE_SNIPPETS[activeCodeTab].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-6 border border-slate-700 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                React Native (TypeScript)
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Zustand State Store
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                react-native-svg
              </span>
            </div>
            <h2 className="text-2xl font-bold text-slate-100">
              Mobilna Warstwa UI Gry Brax
            </h2>
            <p className="text-sm text-slate-300 max-w-2xl mt-1">
              Kompletny zestaw natywnych komponentów mobilnych zintegrowanych z bezstanowym
              silnikiem reguł. Zawiera responsywną planszę 9x9, store Zustand, fazę decyzyjną
              &quot;Braxing&quot; oraz mechanizm wymuszenia ruchu dla zagrożonych pionków.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => store.resetGame()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5 transition-colors border border-slate-600"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Symulatora
            </button>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout: Mobile Device Simulator + Architecture & Code Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Mobile Phone Simulator Frame */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-blue-600" />
            Symulator Aplikacji Mobilnej (Live Preview)
          </div>

          {/* Smartphone Frame */}
          <div className="w-full max-w-[420px] bg-slate-900 p-3.5 rounded-[44px] shadow-2xl border-4 border-slate-800 relative">
            {/* Top Speaker / Dynamic Island */}
            <div className="absolute top-5 left-1/2 -translate-x-1/2 w-28 h-4 bg-black rounded-full z-20 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-900 mr-2" />
              <div className="w-8 h-1 rounded-full bg-slate-800" />
            </div>

            {/* Inner Phone Screen */}
            {/* select-none: the simulated phone is an app, not page content — a
                drag that runs off the board must not start selecting the page
                around it. The screen itself sets the same rule for real devices. */}
            <div className="w-full h-[660px] bg-slate-50 rounded-[34px] overflow-hidden flex flex-col pt-6 relative border border-slate-200 select-none">
              <MobileGameScreen />
            </div>

            {/* Home Indicator Bar */}
            <div className="w-32 h-1 bg-slate-700 rounded-full mx-auto mt-2" />
          </div>

          {/* Live Mobile State Debugger Pill */}
          <div className="mt-4 w-full max-w-[420px] bg-white border border-slate-200 rounded-xl p-3 shadow-sm text-xs text-slate-600 flex justify-between items-center">
            <div>
              <span className="font-semibold text-slate-800">Faza tury:</span>{' '}
              <span className="font-mono text-blue-600 font-bold">{store.turnPhase}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-800">Wybrany pionek:</span>{' '}
              <span className="font-mono text-emerald-600 font-bold">{store.selectedPieceId || 'Brak'}</span>
            </div>
          </div>
        </div>

        {/* Right Column: Code & Architecture Inspector */}
        <div className="lg:col-span-6 space-y-4">
          {/* Key Architectural Highlights Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4 text-indigo-600" />
              Zaimplementowane Wymagania Architektury Mobilnej
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-slate-800">Czysty Zustand Store</span>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Zarządza <code className="bg-slate-200 px-1 rounded">GameState</code>, wybranym pionkiem, listą <code className="bg-slate-200 px-1 rounded">validMoves</code> i fazami tury bez mutacji.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-slate-800">Responsywne SVG 9x9</span>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Kwadratowa plansza dynamicznie skalowana do szerokości okna z etykietami 1..7 na rangach startowych.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-slate-800">Faza &quot;Braxing&quot;</span>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Gdy ruch stwarza zagrożenie, UI wstrzymuje zakończenie tury i wyświetla modal wyboru: &quot;Call Brax!&quot; vs &quot;Zwykły ruch&quot;.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <span className="font-bold text-slate-800">Wymuszenie Brax (Braxed)</span>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    Aktywne ograniczenie Brax blokuje wybór niezagrożonych pionków z komunikatem &quot;You are Braxed!&quot;.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* File Code Inspector */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-lg flex flex-col">
            {/* Code Tab Navigation */}
            <div className="flex items-center justify-between bg-slate-950 px-4 py-2.5 border-b border-slate-800">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <button
                  onClick={() => setActiveCodeTab('store')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    activeCodeTab === 'store'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  useGameStore.ts
                </button>

                <button
                  onClick={() => setActiveCodeTab('board')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    activeCodeTab === 'board'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  BraxBoard.tsx
                </button>

                <button
                  onClick={() => setActiveCodeTab('piece')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    activeCodeTab === 'piece'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  PieceRenderer.tsx
                </button>

                <button
                  onClick={() => setActiveCodeTab('modal')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                    activeCodeTab === 'modal'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  BraxModal.tsx
                </button>
              </div>

              <button
                onClick={handleCopyCode}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
                title="Skopiuj kod"
              >
                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Skopiowano' : 'Kopiuj'}</span>
              </button>
            </div>

            {/* File Info Bar */}
            <div className="bg-slate-900/90 px-4 py-2 text-xs border-b border-slate-800/80 flex items-center justify-between text-slate-400">
              <span className="font-mono text-blue-400">{CODE_SNIPPETS[activeCodeTab].filename}</span>
              <span className="text-[11px] text-slate-400 truncate max-w-[280px]">
                {CODE_SNIPPETS[activeCodeTab].desc}
              </span>
            </div>

            {/* Code Body */}
            <pre className="p-4 text-xs font-mono text-slate-200 bg-slate-950 overflow-x-auto max-h-[380px] leading-relaxed select-all">
              <code>{CODE_SNIPPETS[activeCodeTab].code}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
