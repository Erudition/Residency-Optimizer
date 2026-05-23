import React, { useState } from 'react';
import { X, Play, Square, Check, RotateCcw, Zap, Grid, LayoutGrid, Calendar, Users, GitMerge } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isRunning: boolean;
  progress: number;
  originalViolations: number | null;
  currentViolations: number | null;
  onStart: (strategy: string) => void;
  onStop: () => void;
  onApply: () => void;
  onCancel: () => void;
}

interface HealerStrategy {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const STRATEGIES: HealerStrategy[] = [
  {
    id: 'complete',
    name: 'Complete Scan (Annealing)',
    description: 'Dynamic mix of block sizes using Simulated Annealing. Best for global compliance healing.',
    icon: Zap,
    color: 'text-violet bg-violet/10 border-violet/20'
  },
  {
    id: '4-block',
    name: '4-Block Swaps',
    description: 'Restricts simulated annealing to 4-week block swaps to maintain rotation chunks.',
    icon: LayoutGrid,
    color: 'text-blue bg-blue/10 border-blue/20'
  },
  {
    id: '2-block',
    name: '2-Block Swaps',
    description: 'Restricts simulated annealing to 2-week block swaps for medium-sized adjustments.',
    icon: Grid,
    color: 'text-teal bg-teal/10 border-teal/20'
  },
  {
    id: '1-block',
    name: '1-Week Swaps',
    description: 'Restricts simulated annealing to individual 1-week swaps for micro-adjustments.',
    icon: Calendar,
    color: 'text-emerald bg-emerald/10 border-emerald/20'
  },
  {
    id: '2-way',
    name: '2-Resident Swaps (2-Way)',
    description: 'Staffing-neutral exchanges between two active residents of the same PGY level. Guarantees staffing remains unchanged.',
    icon: Users,
    color: 'text-orange bg-orange/10 border-orange/20'
  },
  {
    id: '3-way',
    name: '3-Resident Swaps (3-Way Cycle)',
    description: 'Staffing-neutral cyclic exchanges among three active residents of the same PGY level. Extremely powerful for solving tight constraint deadlocks.',
    icon: GitMerge,
    color: 'text-pink bg-pink/10 border-pink/20'
  }
];

export const HealerPanel: React.FC<Props> = ({
  isOpen,
  onClose,
  isRunning,
  progress,
  originalViolations,
  currentViolations,
  onStart,
  onStop,
  onApply,
  onCancel
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<string>('complete');

  if (!isOpen) return null;

  const currentStrategyInfo = STRATEGIES.find(s => s.id === selectedStrategy);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-fade-in" 
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full animate-slide-in-right border-l border-light-5">
        {/* Header */}
        <div className="px-6 py-5 border-b border-light-5 flex items-center justify-between bg-white shrink-0">
          <div>
            <h2 className="text-lg font-black tracking-tight text-primary uppercase flex items-center gap-2">
              <Zap className="text-violet fill-violet/20" size={20} />
              Manual Healer Control
            </h2>
            <p className="text-xs font-medium text-muted mt-1">Optimize and fix schedule violations with targeted heuristics.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full w-9 h-9 p-0 hover:bg-light-1">
            <X size={18} />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-light-1">
          {/* Progress / Status Block */}
          {(isRunning || progress > 0) && (
            <div className="bg-white p-5 rounded-2xl border border-light-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-muted">
                  {isRunning ? 'Healing in Progress...' : 'Heal Cycle Stopped'}
                </span>
                <span className="text-sm font-black text-violet">{progress}%</span>
              </div>
              <div className="w-full bg-light-1 h-3 rounded-full overflow-hidden border border-light-5">
                <div 
                  className="bg-violet h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {isRunning && (
                <div className="flex items-center gap-2 text-xs font-semibold text-violet animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-violet" />
                  Running strategy: {currentStrategyInfo?.name}
                </div>
              )}
            </div>
          )}

          {/* Scorecard Comparison */}
          {originalViolations !== null && (
            <div className="bg-white p-5 rounded-2xl border border-light-5 shadow-sm space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-muted">Heal Performance Scorecard</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-light-1 rounded-xl border border-light-5 text-center">
                  <span className="text-xs font-bold text-muted uppercase block">Original</span>
                  <span className="text-2xl font-black text-slate-700 block mt-1">
                    {originalViolations}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400 uppercase">Violations</span>
                </div>
                <div className={`p-3 rounded-xl border text-center transition-colors ${
                  currentViolations !== null && currentViolations < originalViolations 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-light-1 border-light-5 text-slate-700'
                }`}>
                  <span className="text-xs font-bold uppercase block">Current</span>
                  <span className="text-2xl font-black block mt-1">
                    {currentViolations !== null ? currentViolations : originalViolations}
                  </span>
                  <span className="text-[10px] font-medium uppercase">Violations</span>
                </div>
              </div>
              {currentViolations !== null && currentViolations < originalViolations && (
                <div className="text-xs font-bold text-emerald-600 text-center bg-emerald-50 py-1.5 px-3 rounded-lg border border-emerald-100 flex items-center justify-center gap-1.5">
                  <Check size={14} /> Saved {originalViolations - currentViolations} violations!
                </div>
              )}
            </div>
          )}

          {/* Heuristic Strategies */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted">Select Healing Strategy</h3>
            <div className="grid grid-cols-1 gap-3">
              {STRATEGIES.map(strategy => {
                const Icon = strategy.icon;
                const isSelected = selectedStrategy === strategy.id;
                return (
                  <button
                    key={strategy.id}
                    disabled={isRunning}
                    onClick={() => setSelectedStrategy(strategy.id)}
                    className={`flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
                      isSelected 
                        ? 'bg-white border-violet shadow-md scale-[1.01]' 
                        : 'bg-white border-light-5 hover:border-slate-300 hover:shadow-sm'
                    } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className={`p-2.5 rounded-xl border shrink-0 ${strategy.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h4 className={`text-sm font-black transition-colors ${isSelected ? 'text-violet' : 'text-primary'}`}>
                        {strategy.name}
                      </h4>
                      <p className="text-xs font-medium text-muted leading-relaxed">
                        {strategy.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-5 border-t border-light-5 bg-white flex flex-col gap-3 shrink-0">
          <div className="flex gap-3">
            {!isRunning ? (
              <Button 
                onClick={() => onStart(selectedStrategy)}
                className="flex-1 bg-violet hover:bg-violet-hover text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-violet/20 hover:shadow-violet/30 transition-all"
              >
                <Play size={16} fill="currentColor" />
                Run Strategy
              </Button>
            ) : (
              <Button 
                onClick={onStop}
                className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 hover:shadow-rose-500/30 transition-all"
              >
                <Square size={16} fill="currentColor" />
                Stop Strategy
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={isRunning || progress === 0}
              onClick={onCancel}
              className="flex-1 border-light-5 hover:bg-light-1 text-slate-700 py-2.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <RotateCcw size={14} />
              Cancel & Revert
            </Button>
            <Button
              disabled={isRunning || progress === 0}
              onClick={onApply}
              className="flex-1 bg-slate-900 hover:bg-black text-white py-2.5 rounded-xl font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Check size={14} />
              Apply & Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
