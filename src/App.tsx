/**
 * Brax Board Game - Main Application
 * Integrates the pure TypeScript Brax Rules Engine with an authentic, responsive interface.
 */

import React, { useState, useEffect } from 'react';
import type { MoveAction, PlayerColor } from '@brax/engine/view';
import type { GameScenario } from '@brax/engine';
import { useBraxSession } from './hooks/useBraxSession.ts';
import { BoardView } from './components/BoardView.tsx';
import { TestRunnerView } from './components/TestRunnerView.tsx';
import { ScenariosPanel } from './components/ScenariosPanel.tsx';
import { ArchitectureView } from './components/ArchitectureView.tsx';
import { MobileSimulatorView } from './components/MobileSimulatorView.tsx';
import {
  Swords,
  RotateCcw,
  Bot,
  User,
  AlertTriangle,
  Sparkles,
  Trophy,
  History,
  BookOpen,
  Layers,
  ShieldCheck,
  Flag,
  Smartphone,
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'board' | 'mobile' | 'scenarios' | 'tests' | 'architecture'>('mobile');
  const [callBraxNextMove, setCallBraxNextMove] = useState<boolean>(true);
  const [vsBot, setVsBot] = useState<boolean>(false);
  const [botColor] = useState<PlayerColor>('BLUE');
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);

  // The rules live behind the engine client, so the board reads a session
  // rather than holding a GameState it is free to mutate.
  const {
    state,
    canUndo,
    isBusy,
    connectionError,
    statusMessage,
    selectedPieceId,
    currentValidMoves,
    threats,
    isEndgame,
    selectPiece,
    executeMove: applyMove,
    playBotMove,
    undoMove,
    resetGame: resetSession,
    loadState,
    setStatusMessage,
  } = useBraxSession('two_player');

  // Bot automated move trigger. The move itself is chosen and played by the
  // engine; this only decides when to ask for it.
  useEffect(() => {
    if (!vsBot || !state || state.turn !== botColor || state.result !== null || isBusy) return;
    const timer = setTimeout(() => {
      void playBotMove(botColor);
    }, 550);
    return () => clearTimeout(timer);
  }, [vsBot, state?.turn, state?.result, botColor, isBusy, playBotMove, state]);

  const handleSelectPiece = (pieceId: string) => {
    void selectPiece(pieceId);
  };

  const executeMove = (move: MoveAction) => {
    void applyMove(move, callBraxNextMove);
  };

  const resetGame = (modeId: string = 'two_player') => {
    setActiveScenarioId(null);
    void resetSession(modeId);
  };

  const handleLoadScenario = (scenario: GameScenario) => {
    setActiveScenarioId(scenario.id);
    setActiveTab('board');
    void loadState(scenario.state).then(() => {
      setStatusMessage(`Wczytano scenariusz: ${scenario.title}. ${scenario.hint}`);
    });
  };

  // A session is opened asynchronously on mount; nothing below can render
  // without a position.
  if (!state) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-3 text-slate-600">
        <div className="w-11 h-11 rounded-2xl bg-slate-900 flex items-center justify-center text-amber-400 font-black text-xl">
          B
        </div>
        <p className="text-sm font-semibold">
          {connectionError ?? 'Łączenie z silnikiem gry...'}
        </p>
        {connectionError && (
          <button
            onClick={() => resetGame()}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition cursor-pointer"
          >
            Spróbuj ponownie
          </button>
        )}
      </div>
    );
  }

  const isRedTurn = state.turn === 'RED';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans" id="brax-app">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-amber-400 font-black text-lg shadow-sm">
              B
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-slate-900 text-base sm:text-lg leading-tight">
                  Brax Rules Engine
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                  F.B. Denham (1889)
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Bezstanowy silnik reguł w TypeScript • Geometria 9x9 • Maszyna stanów Brax
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('board')}
              id="tab-board"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'board'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Swords className="w-3.5 h-3.5" />
              <span>Plansza (Web)</span>
            </button>
            <button
              onClick={() => setActiveTab('mobile')}
              id="tab-mobile"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'mobile'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-bold text-blue-900">Mobile (React Native)</span>
            </button>
            <button
              onClick={() => setActiveTab('scenarios')}
              id="tab-scenarios"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'scenarios'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Scenariusze</span>
            </button>
            <button
              onClick={() => setActiveTab('tests')}
              id="tab-tests"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'tests'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Testy (Vitest)</span>
            </button>
            <button
              onClick={() => setActiveTab('architecture')}
              id="tab-architecture"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'architecture'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Architektura & API</span>
              <span className="sm:hidden">API</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {/* TAB 1: BOARD VIEW */}
        {activeTab === 'board' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Board & Active Status */}
            <div className="lg:col-span-7 flex flex-col items-center">
              {/* Turn & Status Bar */}
              <div className="w-full max-w-[540px] mb-4 bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-sm ${
                      isRedTurn ? 'bg-red-600' : 'bg-blue-600'
                    }`}
                  >
                    {isRedTurn ? 'R' : 'B'}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Tura #{state.turnNumber}
                    </div>
                    <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                      <span>Ruch: Gracz {isRedTurn ? 'CZERWONY (RED)' : 'NIEBIESKI (BLUE)'}</span>
                      {vsBot && state.turn === botColor && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold border border-blue-200">
                          Myśli bot...
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Brax Option Toggle */}
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="toggle-call-brax"
                    className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 select-none"
                    title="Jeśli zaznaczone i ruch stworzy zagrożenie, silnik automatycznie zadeklaruje Brax!"
                  >
                    <input
                      id="toggle-call-brax"
                      type="checkbox"
                      checked={callBraxNextMove}
                      onChange={(e) => setCallBraxNextMove(e.target.checked)}
                      disabled={isEndgame}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span>Wołaj „Brax!”</span>
                  </label>
                </div>
              </div>

              {/* Brax Enforcement Alert Banner */}
              {state.activeBrax && (
                <div
                  id="brax-alert-banner"
                  className="w-full max-w-[540px] mb-4 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3"
                >
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 leading-relaxed">
                    <span className="font-bold block">
                      WYMUSZENIE BRAX! Gracz {state.activeBrax.callerColor} zawołał „Brax!”
                    </span>
                    Gracz {state.activeBrax.victimColor} MUSI w tym ruchu ruszyć się jednym z
                    zagrożonych pionków:{' '}
                    <strong>{state.activeBrax.threatenedPieceIds.join(', ')}</strong>. Ruchy innymi
                    pionkami są zablokowane.
                  </div>
                </div>
              )}

              {/* Endgame Alert Banner */}
              {isEndgame && (
                <div className="w-full max-w-[540px] mb-4 p-3 bg-slate-100 border border-slate-200 rounded-xl flex items-center gap-2.5 text-xs text-slate-600">
                  <Flag className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>
                    <strong>Końcówka gry (stan 2:1 lub 1:1):</strong> Zgodnie z oficjalnymi regułami
                    Denhama, prawo do wołania Brax wygasło bezpowrotnie.
                  </span>
                </div>
              )}

              {/* Status Message */}
              {statusMessage && (
                <div className="w-full max-w-[540px] mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                  {statusMessage}
                </div>
              )}

              {/* Game Result Modal / Card */}
              {state.result && (
                <div
                  id="game-result-card"
                  className="w-full max-w-[540px] mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Trophy className="w-8 h-8 text-amber-500 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-900 text-sm">
                        Koniec Gry: {state.result.winner === 'DRAW' ? 'REMIS' : `Wygrywa ${state.result.winner}!`}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5">{state.result.description}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => resetGame()}
                    className="px-3.5 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition cursor-pointer"
                  >
                    Zagraj Znów
                  </button>
                </div>
              )}

              {/* Board Canvas */}
              <BoardView
                state={state}
                selectedPieceId={selectedPieceId}
                validMoves={currentValidMoves}
                threats={threats}
                onSelectPiece={handleSelectPiece}
                onExecuteMove={executeMove}
              />

              {/* Bottom Quick Controls */}
              <div className="w-full max-w-[540px] mt-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void undoMove()}
                    disabled={!canUndo || isBusy}
                    id="btn-undo-move"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 shadow-2xs transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Cofnij</span>
                  </button>
                  <button
                    onClick={() => resetGame()}
                    id="btn-new-game"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 shadow-2xs transition cursor-pointer"
                  >
                    <span>Nowa Gra</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVsBot(!vsBot)}
                    id="btn-toggle-bot"
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      vsBot
                        ? 'bg-blue-50 border-blue-300 text-blue-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {vsBot ? <Bot className="w-3.5 h-3.5 text-blue-600" /> : <User className="w-3.5 h-3.5" />}
                    <span>{vsBot ? 'Gra z Botem (Włączona)' : 'Graj z Botem'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Game Info, Captured Pieces, History, Rules Cheatsheet */}
            <div className="lg:col-span-5 space-y-4">
              {/* Captured Pieces Graveyards */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs" id="captured-pieces-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Zbite Pionki (Cmentarz)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* RED captured */}
                  <div className="p-3 bg-red-50/50 rounded-xl border border-red-100">
                    <div className="text-xs font-bold text-red-900 mb-1 flex items-center justify-between">
                      <span>RED zdobył:</span>
                      <span className="font-mono text-red-700">{state.capturedPieces.RED.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 min-h-[28px] items-center">
                      {state.capturedPieces.RED.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic">Brak</span>
                      ) : (
                        state.capturedPieces.RED.map((p) => (
                          <span
                            key={`cap-${p.id}`}
                            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-600 text-white"
                          >
                            {p.id}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* BLUE captured */}
                  <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                    <div className="text-xs font-bold text-blue-900 mb-1 flex items-center justify-between">
                      <span>BLUE zdobył:</span>
                      <span className="font-mono text-blue-700">{state.capturedPieces.BLUE.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 min-h-[28px] items-center">
                      {state.capturedPieces.BLUE.length === 0 ? (
                        <span className="text-[11px] text-slate-400 italic">Brak</span>
                      ) : (
                        state.capturedPieces.BLUE.map((p) => (
                          <span
                            key={`cap-${p.id}`}
                            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-600 text-white"
                          >
                            {p.id}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Threats Status */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs" id="threats-card">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Aktualne Zagrożenia na Planszy
                  </h3>
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    {threats.length} zagrożeń
                  </span>
                </div>

                {threats.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    Gracz {state.turn} w tej chwili nie zagraża żadnemu wrogiemu pionkowi.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {threats.map((t, idx) => (
                      <div
                        key={`threat-${idx}`}
                        className="text-xs p-2 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-800">
                          Pionek {t.threatenedByPieceId} ({t.threatenedByColor}) zagraża{' '}
                          <strong className="text-amber-800">{t.threatenedPieceId}</strong>
                        </span>
                        <span className="text-[10px] font-mono text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                          Dystans {t.attackPath.distance}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Move History */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs" id="history-card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-500" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Historia Ruchów
                    </h3>
                  </div>
                  <span className="text-xs font-mono text-slate-500">
                    {state.history.length} ruchów
                  </span>
                </div>

                {state.history.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">Brak wykonanych ruchów.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto font-mono text-xs pr-1">
                    {state.history.slice(-8).map((h, i) => (
                      <div
                        key={`hist-${h.moveNumber}-${i}`}
                        className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 border border-slate-100"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-[11px] w-5">#{h.moveNumber}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              h.player === 'RED' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {h.player}
                          </span>
                          <span className="font-semibold text-slate-800">{h.algebraic}</span>
                        </div>
                        {h.capturedPiece && (
                          <span className="text-[11px] text-rose-600 font-bold">x{h.capturedPiece.id}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Rules Quick Reference Card */}
              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs" id="rules-card">
                <div className="flex items-center gap-2 mb-2 text-slate-800 font-bold text-sm">
                  <BookOpen className="w-4 h-4 text-slate-600" />
                  <span>Ściągawka Reguł Gry Brax</span>
                </div>
                <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside leading-relaxed">
                  <li>
                    <strong>Dystans 1:</strong> Ruch o 1 segment dowolnego koloru (własny lub przeciwnika).
                  </li>
                  <li>
                    <strong>Dystans 2:</strong> Tylko gdy OBA segmenty są w Twoim kolorze + zakręt 90°!
                  </li>
                  <li>
                    <strong>Brak skakania:</strong> Węzeł pośredni P1 MUSI być pusty (nie można przeskoczyć pionka).
                  </li>
                  <li>
                    <strong>Wołanie Brax:</strong> Po ruchu stwarzającym zagrożenie zmusza przeciwnika do ruszenia zagrożonym pionkiem.
                  </li>
                  <li>
                    <strong>Końcówka 2:1:</strong> Prawo do Brax wygasa bezpowrotnie.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB: MOBILE SIMULATOR & CODE */}
        {activeTab === 'mobile' && (
          <div className="max-w-7xl mx-auto">
            <MobileSimulatorView />
          </div>
        )}

        {/* TAB 2: SCENARIOS */}
        {activeTab === 'scenarios' && (
          <div className="max-w-4xl mx-auto">
            <ScenariosPanel
              onSelectScenario={handleLoadScenario}
              activeScenarioId={activeScenarioId}
            />
          </div>
        )}

        {/* TAB 3: TEST RUNNER */}
        {activeTab === 'tests' && (
          <div className="max-w-4xl mx-auto">
            <TestRunnerView />
          </div>
        )}

        {/* TAB 4: ARCHITECTURE & API */}
        {activeTab === 'architecture' && (
          <div className="max-w-4xl mx-auto">
            <ArchitectureView />
          </div>
        )}
      </main>
    </div>
  );
}
