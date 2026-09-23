/**
 * Brax Rules Engine - Architecture & Integration Guide Modal/View
 * Technical documentation for TypeScript developers integrating the engine.
 */

import React from 'react';
import { Layers, Code2, Smartphone, Cpu, Check, Copy } from 'lucide-react';

export const ArchitectureView: React.FC = () => {
  const [copied, setCopied] = React.useState(false);

  const integrationSnippet = `// Integracja z silnikiem Brax (React Native / Web / Node)
// Aplikacja nie importuje reguł — rozmawia z silnikiem przez klienta.
import { createEngineClient } from '@brax/engine-client';

// 1. Wybór transportu: silnik lokalny albo hostowany serwis.
//    Zmiana transportu nie wymaga żadnej zmiany w UI.
const engine = createEngineClient({ transport: 'local' });
// const engine = createEngineClient({
//   transport: 'http',
//   baseUrl: 'https://engine.brax.example',
// });

// 2. Sesja gry jest autorytatywna po stronie silnika.
//    Klient trzyma tylko gameId i numer rewizji.
const { gameId, state, revision } = await engine.createGame({ modeId: 'two_player' });

// 3. Legalne ruchy (z uwzględnieniem wymuszeń Brax) liczy silnik.
const validMoves = await engine.getValidMoves(gameId, 'R1');

// 4. Czy ten ruch pozwala zawołać Brax — to też pytanie o regułę.
const { moves, canCallBrax } = await engine.getMoveOptions(gameId, 'R1', { x: 2, y: 1 });

// 5. Wykonanie ruchu. expectedRevision chroni przed nadpisaniem
//    partii, która w międzyczasie poszła dalej (drugi tab, drugi gracz).
const outcome = await engine.applyMove(
  gameId,
  { ...moves[0], callBrax: canCallBrax },
  { expectedRevision: revision }
);

// 6. Historia i cofanie żyją w sesji, nie w aplikacji.
const snapshot = await engine.undo(gameId);`;

  const copyCode = () => {
    navigator.clipboard.writeText(integrationSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6" id="architecture-panel">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-slate-800 text-lg">Architektura Silnika Reguł Brax</h3>
        </div>
        <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-100">
          Pure TypeScript 5.8+
        </span>
      </div>

      <p className="text-sm text-slate-600 leading-relaxed mb-6">
        Silnik reguł Brax jest <strong>osobnym pakietem i osobnym procesem</strong>, a nie biblioteką wkompilowaną
        w aplikację. Warstwa UI zna wyłącznie interfejs <code>BraxEngineClient</code>; pod nim stoi albo
        silnik w tym samym procesie (<code>LocalEngineClient</code>, gra offline), albo hostowany serwis
        (<code>HttpEngineClient</code>). Sesja gry jest autorytatywna po stronie silnika: klient nie odsyła
        <code>GameState</code>, tylko <code>gameId</code> i numer rewizji, więc nie może przepisać planszy.
        Wszystkie struktury danych pozostają niemutowalne i w pełni serializowalne do JSON.
      </p>

      {/* Grid of Key Architecture Principles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm mb-1.5">
            <Cpu className="w-4 h-4 text-indigo-600" />
            <span>Niemutowalność</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Metoda <code>applyMove</code> nie modyfikuje wejściowego stanu. Zwraca nowy obiekt, idealny dla
            React hooks, Redux lub synchronizacji sieciowej.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm mb-1.5">
            <Layers className="w-4 h-4 text-emerald-600" />
            <span>Interfejs BraxGameMode</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Wzorzec Strategy: <code>initBoard</code>, <code>validateMove</code>, <code>applyMove</code>,{' '}
            <code>checkVictory</code>. Pozwala łatwo dołączać tryby 3-4 graczy i Fox & Geese.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm mb-1.5">
            <Smartphone className="w-4 h-4 text-amber-600" />
            <span>Przenośność</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Zero zależności od środowiska przeglądarki. Działa bezpośrednio w React Native, bridge Flutter,
            serwerach Node.js oraz testach Vitest.
          </p>
        </div>
      </div>

      {/* Code Snippet Box */}
      <div className="relative rounded-xl bg-slate-900 text-slate-100 text-xs font-mono p-4 overflow-x-auto">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-slate-400">
          <span className="flex items-center gap-1.5">
            <Code2 className="w-4 h-4 text-indigo-400" />
            TypeScript API Usage
          </span>
          <button
            onClick={copyCode}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] transition cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Skopiowano!' : 'Kopiuj Kod'}</span>
          </button>
        </div>
        <pre className="text-slate-300 leading-relaxed">{integrationSnippet}</pre>
      </div>
    </div>
  );
};
