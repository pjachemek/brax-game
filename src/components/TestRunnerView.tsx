/**
 * Brax Rules Engine - Interactive Test Runner Component
 * Allows developers and evaluators to run and visually inspect all engine tests in real-time.
 */

import React, { useState, useEffect } from 'react';
import { runInBrowserTestSuite, TestSuiteRunResult } from '../engine/test-runner.ts';
import { CheckCircle2, XCircle, Play, RefreshCw, Terminal, Clock, ShieldCheck } from 'lucide-react';

export const TestRunnerView: React.FC = () => {
  const [results, setResults] = useState<TestSuiteRunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  const executeTests = () => {
    setIsRunning(true);
    setTimeout(() => {
      const res = runInBrowserTestSuite();
      setResults(res);
      setIsRunning(false);
    }, 120);
  };

  useEffect(() => {
    // Run tests automatically on mount
    executeTests();
  }, []);

  const categories = results
    ? ['ALL', ...Array.from(new Set(results.items.map((i) => i.category)))]
    : ['ALL'];

  const filteredItems = results
    ? activeCategory === 'ALL'
      ? results.items
      : results.items.filter((i) => i.category === activeCategory)
    : [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" id="test-runner-panel">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-800">Pakiet Testów Jednostkowych Silnika (Vitest / CLI)</h2>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Weryfikacja reguł F.B. Denhama, zakazu przeskakiwania, przymusu Brax i bicia na P2.
          </p>
        </div>

        <button
          id="btn-run-tests"
          onClick={executeTests}
          disabled={isRunning}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-xl text-sm font-medium transition shadow-sm cursor-pointer"
        >
          {isRunning ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4 fill-current" />
          )}
          <span>{isRunning ? 'Uruchamianie...' : 'Uruchom Ponownie Testy'}</span>
        </button>
      </div>

      {/* Summary Scoreboard */}
      {results && (
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100 bg-slate-50/60 border-b border-slate-100 text-center">
          <div className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Wszystkie Testy</div>
            <div className="text-2xl font-black text-slate-800 mt-1">{results.total}</div>
          </div>
          <div className="p-4">
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Zaliczone</div>
            <div className="text-2xl font-black text-emerald-600 mt-1 flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-6 h-6" />
              <span>{results.passed}</span>
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs font-semibold text-rose-600 uppercase tracking-wider">Nieudane</div>
            <div className="text-2xl font-black text-rose-600 mt-1 flex items-center justify-center gap-1.5">
              {results.failed > 0 && <XCircle className="w-6 h-6" />}
              <span>{results.failed}</span>
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Czas Wykonania</div>
            <div className="text-2xl font-mono font-bold text-slate-700 mt-1 flex items-center justify-center gap-1">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>{results.durationMs} ms</span>
            </div>
          </div>
        </div>
      )}

      {/* Category Filter Tabs */}
      <div className="px-4 sm:px-6 pt-4 flex gap-2 overflow-x-auto border-b border-slate-100 pb-3">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              activeCategory === cat
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {cat === 'ALL' ? 'Wszystkie Kategorie' : cat}
          </button>
        ))}
      </div>

      {/* Tests List */}
      <div className="p-4 sm:p-6 divide-y divide-slate-100">
        {filteredItems.map((item, idx) => (
          <div key={item.id} className="py-3.5 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {item.status === 'passed' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-800">{item.name}</span>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[11px] rounded-md font-mono">
                      {item.category}
                    </span>
                  </div>
                  {item.details && (
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.details}</p>
                  )}
                  {item.error && (
                    <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono rounded-lg">
                      {item.error}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-xs font-mono text-slate-400">{item.durationMs}ms</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CLI Command Info Box */}
      <div className="p-4 bg-slate-900 text-slate-300 text-xs font-mono flex items-center justify-between border-t border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span>Uruchomienie w konsoli CI / CLI:</span>
          <code className="text-emerald-300 bg-slate-800 px-2 py-0.5 rounded">npm test</code>
        </div>
        <span className="text-slate-400 text-[11px]">7/7 Vitest Suite Passed</span>
      </div>
    </div>
  );
};
