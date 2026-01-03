import React, { useMemo, useState } from 'react';
import { ScheduleGrid, Resident, AssignmentType, ScheduleCell } from '../types';
import { calculateFairnessMetrics, calculateScheduleScore } from '../services/scheduler';
import { Check, X, Sparkles, Loader2, Info } from 'lucide-react';

interface ScheduleSession {
  id: string;
  name: string;
  data: ScheduleGrid;
}

interface BatchProgress {
    current: number;
    total: number;
    bestScore: number;
}

interface Props {
  residents: Resident[];
  schedules: ScheduleSession[];
  activeScheduleId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onBatchGenerate: () => Promise<void>;
  progress: BatchProgress | null;
}

interface ScheduleMetrics {
  id: string;
  name: string;
  score: number;
  avgFairness: number;
  totalNF: number;
  streakSD: number;
  maxStreak: number;
}

export const ScheduleComparison: React.FC<Props> = ({ residents, schedules, activeScheduleId, onSelect, onClose, onBatchGenerate, progress }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const metrics: ScheduleMetrics[] = useMemo(() => {
    return schedules.map(s => {
      const groups = calculateFairnessMetrics(residents, s.data);
      const score = calculateScheduleScore(residents, s.data);
      
      // Calculate Aggregate Metrics across all PGYs
      const avgFairness = groups.reduce((sum, g) => sum + g.fairnessScore, 0) / groups.length;
      
      // Streak Metrics
      const allStreaks: number[] = [];
      groups.forEach(g => {
        g.residents.forEach(r => {
          allStreaks.push(r.maxIntensityStreak);
        });
      });
      const maxStreak = Math.max(...allStreaks);
      const streakMean = allStreaks.reduce((a,b) => a+b, 0) / allStreaks.length;
      const streakSD = Math.sqrt(allStreaks.reduce((sum, n) => sum + Math.pow(n - streakMean, 2), 0) / allStreaks.length);

      // Total Night Float
      let totalNF = 0;
      const allWeeks = Object.values(s.data) as ScheduleCell[][];
      allWeeks.forEach(weeks => {
          weeks.forEach(c => { if(c.assignment === AssignmentType.NIGHT_FLOAT) totalNF++; });
      });

      return {
        id: s.id,
        name: s.name,
        score,
        avgFairness,
        totalNF,
        streakSD,
        maxStreak,
      };
    });
  }, [schedules, residents]);

  // Determine Min/Max for Coloring
  const ranges = useMemo(() => {
    const r = {
      score: { min: -1000, max: 0 },
      fairness: { min: 100, max: 0 },
      totalNF: { min: 10000, max: 0 },
      streakSD: { min: 100, max: 0 },
      streak: { min: 100, max: 0 },
    };
    
    if (metrics.length === 0) return r;

    // Init ranges with first element
    r.score.min = metrics[0].score;
    r.score.max = metrics[0].score;

    metrics.forEach(m => {
      r.score.min = Math.min(r.score.min, m.score);
      r.score.max = Math.max(r.score.max, m.score);

      r.fairness.min = Math.min(r.fairness.min, m.avgFairness);
      r.fairness.max = Math.max(r.fairness.max, m.avgFairness);
      
      r.totalNF.min = Math.min(r.totalNF.min, m.totalNF);
      r.totalNF.max = Math.max(r.totalNF.max, m.totalNF);
      
      r.streakSD.min = Math.min(r.streakSD.min, m.streakSD);
      r.streakSD.max = Math.max(r.streakSD.max, m.streakSD);
      
      r.streak.min = Math.min(r.streak.min, m.maxStreak);
      r.streak.max = Math.max(r.streak.max, m.maxStreak);
    });
    return r;
  }, [metrics]);

  // Color Helper with Accessible Contrast
  const getColor = (val: number, min: number, max: number, higherIsBetter: boolean) => {
    if (min === max) return 'bg-gray-50 text-gray-900'; 

    let ratio = (val - min) / (max - min);
    if (!higherIsBetter) ratio = 1 - ratio; 

    if (ratio >= 0.8) return 'bg-green-100 text-green-900 font-bold';
    if (ratio >= 0.6) return 'bg-green-50 text-green-900 font-medium';
    if (ratio >= 0.4) return 'bg-gray-50 text-gray-900';
    if (ratio >= 0.2) return 'bg-red-50 text-red-900 font-medium';
    return 'bg-red-100 text-red-900 font-bold';
  };

  const handleRunOptimization = async () => {
      setIsGenerating(true);
      // Small delay to let UI render the loading state
      setTimeout(async () => {
          await onBatchGenerate();
          setIsGenerating(false);
      }, 50);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex justify-between items-center bg-gray-50">
          <div>
             <h2 className="text-xl font-bold text-gray-800">Schedule Comparison</h2>
             <p className="text-sm text-gray-500">Compare metrics across generated schedules to find the optimal balance.</p>
          </div>
          <div className="flex items-center gap-4">
              {progress ? (
                <div className="flex flex-col items-end min-w-[200px]">
                    <div className="flex items-center gap-2 text-sm font-medium text-purple-700">
                         <Loader2 size={16} className="animate-spin" />
                         Processing: {progress.current} / {progress.total}
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                        <div 
                            className="bg-purple-600 h-1.5 rounded-full transition-all duration-300"
                            style={{ width: `${(progress.current / progress.total) * 100}%`}}
                        ></div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Current Best Score: {progress.bestScore}</div>
                </div>
              ) : (
                <button 
                    onClick={handleRunOptimization}
                    disabled={isGenerating}
                    className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md font-medium transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Sparkles size={18} />
                    Auto-Optimize (Batch Generate)
                </button>
              )}
              
              <div className="h-8 w-px bg-gray-300"></div>
              <button onClick={onClose} disabled={isGenerating} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500 disabled:opacity-50">
                <X size={20} />
              </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300 text-gray-700 uppercase text-xs">
                <th className="py-3 px-4 text-left font-bold">Schedule</th>
                <th className="py-3 px-4 text-center font-bold">Total Score</th>
                <th className="py-3 px-4 text-center font-bold">Fairness %</th>
                <th className="py-3 px-4 text-center font-bold">Total Night Shifts</th>
                <th className="py-3 px-4 text-center font-bold">Streak Spread (SD)</th>
                <th className="py-3 px-4 text-center font-bold">Max Streak</th>
                <th className="py-3 px-4 text-center font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => {
                const isActive = m.id === activeScheduleId;
                return (
                  <tr key={m.id} className={`border-b border-gray-100 hover:bg-gray-50 ${isActive ? 'bg-blue-50/30' : ''}`}>
                    <td className="py-3 px-4 font-medium text-gray-900 border-r border-gray-100">
                      {m.name}
                      {isActive && <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">Active</span>}
                    </td>

                    <td className={`py-3 px-4 text-center font-mono ${getColor(m.score, ranges.score.min, ranges.score.max, true)}`}>
                       {Math.round(m.score)}
                    </td>
                    
                    <td className={`py-3 px-4 text-center font-mono ${getColor(m.avgFairness, ranges.fairness.min, ranges.fairness.max, true)}`}>
                       {m.avgFairness.toFixed(1)}%
                    </td>

                    <td className={`py-3 px-4 text-center font-mono ${getColor(m.totalNF, ranges.totalNF.min, ranges.totalNF.max, false)}`}>
                       {m.totalNF}
                    </td>

                    <td className={`py-3 px-4 text-center font-mono ${getColor(m.streakSD, ranges.streakSD.min, ranges.streakSD.max, false)}`}>
                       ± {m.streakSD.toFixed(2)}
                    </td>

                    <td className={`py-3 px-4 text-center font-mono ${getColor(m.maxStreak, ranges.streak.min, ranges.streak.max, false)}`}>
                       {m.maxStreak} wks
                    </td>

                    <td className="py-3 px-4 text-center">
                       {isActive ? (
                         <span className="text-green-600 flex justify-center font-bold"><Check size={20}/></span>
                       ) : (
                         <button 
                            onClick={() => { onSelect(m.id); }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-medium shadow-sm"
                         >
                            Select
                         </button>
                       )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 bg-gray-50 border-t text-xs text-gray-600 flex justify-between items-center">
           <div className="flex gap-4">
               <div>
                    <strong>Legend:</strong>{' '}
                    <span className="bg-green-100 text-green-900 px-1 rounded font-bold">Best</span>{' '}
                    <span className="bg-red-100 text-red-900 px-1 rounded font-bold">Worst</span> relative performance.
               </div>
               <div className="flex items-center gap-1.5 border-l border-gray-300 pl-4 text-gray-500">
                    <Info size={14} />
                    <span>Score = <strong>Fairness</strong> + 600 - (StreakSD × 20) - (TotalNF × 2) - MaxStreak</span>
               </div>
           </div>
           <button onClick={onClose} disabled={isGenerating} className="bg-white border hover:bg-gray-100 px-6 py-2 rounded font-medium text-gray-700 transition-colors disabled:opacity-50">
             Close
           </button>
        </div>
      </div>
    </div>
  );
};