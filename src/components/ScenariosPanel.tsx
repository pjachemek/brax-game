/**
 * Brax Rules Engine - Interactive Scenarios Panel
 * Preset test positions demonstrating Denham rules with 1-click loading.
 */

import React from 'react';
import { GameScenario, getPresetScenarios } from '../engine/scenarios.ts';
import { Bookmark, Sparkles, ArrowRight } from 'lucide-react';

interface ScenariosPanelProps {
  onSelectScenario: (scenario: GameScenario) => void;
  activeScenarioId: string | null;
}

export const ScenariosPanel: React.FC<ScenariosPanelProps> = ({
  onSelectScenario,
  activeScenarioId,
}) => {
  const scenarios = getPresetScenarios();

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5" id="scenarios-panel">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-5 h-5 text-amber-500" />
        <h3 className="font-bold text-slate-800 text-base">Interaktywne Scenariusze Testowe</h3>
      </div>
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
        Wybierz zdefiniowaną sytuację na planszy, aby przetestować w praktyce kluczowe zasady Brax:
      </p>

      <div className="space-y-2.5">
        {scenarios.map((sc) => {
          const isActive = sc.id === activeScenarioId;

          return (
            <div
              key={sc.id}
              onClick={() => onSelectScenario(sc)}
              id={`scenario-item-${sc.id}`}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                isActive
                  ? 'border-slate-900 bg-slate-50 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">{sc.title}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                    {sc.badge}
                  </span>
                </div>
                <ArrowRight className={`w-3.5 h-3.5 ${isActive ? 'text-slate-900' : 'text-slate-400'}`} />
              </div>

              <p className="text-xs text-slate-600 leading-relaxed mb-2">{sc.description}</p>

              <div className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                💡 {sc.hint}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
