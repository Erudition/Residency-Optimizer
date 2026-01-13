import React, { useMemo, useState } from 'react';
import { ScheduleGrid, Resident, AssignmentType, ScheduleCell } from '../types';
import { calculateFairnessMetrics, calculateScheduleScore } from '../services/scheduler';
import { Sparkles, Loader2, Info, Download, Users, Plus, ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react';

interface ScheduleSession {
  id: string;
  name: string;
  data: ScheduleGrid;
  isGenerating?: boolean;
}

const Identicon = ({ id, size = 16 }: { id: string, size?: number }) => {
  const colors = [
    'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
    'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
    'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500',
    'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 'bg-pink-500',
    'bg-rose-500', 'bg-slate-500', 'bg-gray-500', 'bg-zinc-500'
  ];

  const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color1 = colors[hash % colors.length];
  const color2 = colors[(hash * 7) % colors.length];
  const color3 = colors[(hash * 13) % colors.length];
  const color4 = colors[(hash * 19) % colors.length];

  return (
    <div className={`grid grid-cols-2 rounded-sm overflow-hidden flex-shrink-0 bg-white shadow-sm border border-black/5`} style={{ width: size, height: size }}>
      <div className={color1}></div>
      <div className={color2}></div>
      <div className={color3}></div>
      <div className={color4}></div>
    </div>
  );
};

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
  onBatchGenerate: () => Promise<void>;
  progress: BatchProgress | null;
}

interface ScheduleMetrics {
  id: string;
  name: string;
  score: number;
  avgFairness: number;
  pgy1Fairness: number;
  pgy2Fairness: number;
  pgy3Fairness: number;
  totalNF: number;
  streakSD: number;
  maxStreak: number;
}

export const ScheduleComparison: React.FC<Props> = ({
  residents,
  schedules,
  activeScheduleId,
  onSelect,
  onBatchGenerate,
  progress
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof ScheduleMetrics, direction: 'asc' | 'desc' }>({ key: 'score', direction: 'desc' });

  const handleSort = (key: keyof ScheduleMetrics) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const SortIcon = ({ column }: { column: keyof ScheduleMetrics }) => {
    if (sortConfig.key !== column) return <ArrowUpDown size={12} className="ml-1 opacity-20" />;
    return sortConfig.direction === 'asc' ? <ChevronUp size={12} className="ml-1 text-blue-600" /> : <ChevronDown size={12} className="ml-1 text-blue-600" />;
  };

  const metrics: ScheduleMetrics[] = useMemo(() => {
    return schedules.filter(s => !s.isGenerating).map(s => {
      const groups = calculateFairnessMetrics(residents, s.data);
      const score = calculateScheduleScore(residents, s.data);

      const f1 = groups.find(g => g.level === 1)?.fairnessScore || 0;
      const f2 = groups.find(g => g.level === 2)?.fairnessScore || 0;
      const f3 = groups.find(g => g.level === 3)?.fairnessScore || 0;

      const avgFairness = (f1 + f2 + f3) / 3;

      const allStreaks: number[] = [];
      groups.forEach(g => {
        g.residents.forEach(r => {
          allStreaks.push(r.maxIntensityStreak);
        });
      });
      const maxStreak = Math.max(...allStreaks);
      const streakMean = allStreaks.reduce((a, b) => a + b, 0) / allStreaks.length;
      const streakSD = Math.sqrt(allStreaks.reduce((sum, n) => sum + Math.pow(n - streakMean, 2), 0) / allStreaks.length);

      let totalNF = 0;
      const allWeeks = Object.values(s.data) as ScheduleCell[][];
      allWeeks.forEach(weeks => {
        weeks.forEach(c => { if (c.assignment === AssignmentType.NIGHT_FLOAT) totalNF++; });
      });

      return {
        id: s.id,
        name: s.name,
        score,
        avgFairness,
        pgy1Fairness: f1,
        pgy2Fairness: f2,
        pgy3Fairness: f3,
        totalNF,
        streakSD,
        maxStreak,
      };
    });
  }, [schedules, residents]);

  const sortedMetrics = useMemo(() => {
    return [...metrics].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal === bVal) return 0;
      const res = aVal < bVal ? -1 : 1;
      return sortConfig.direction === 'asc' ? res : -res;
    });
  }, [metrics, sortConfig]);

  const ranges = useMemo(() => {
    const r = {
      score: { min: 0, max: 100000 },
      fairness: { min: 100, max: 0 },
      pgyFairness: { min: 100, max: 0 },
      totalNF: { min: 10000, max: 0 },
      streakSD: { min: 100, max: 0 },
      streak: { min: 100, max: 0 },
    };

    if (metrics.length === 0) return r;

    r.score.min = metrics[0].score;
    r.score.max = metrics[0].score;

    metrics.forEach(m => {
      r.score.min = Math.min(r.score.min, m.score);
      r.score.max = Math.max(r.score.max, m.score);
      r.fairness.min = Math.min(r.fairness.min, m.avgFairness);
      r.fairness.max = Math.max(r.fairness.max, m.avgFairness);

      const minPgy = Math.min(m.pgy1Fairness, m.pgy2Fairness, m.pgy3Fairness);
      const maxPgy = Math.max(m.pgy1Fairness, m.pgy2Fairness, m.pgy3Fairness);
      r.pgyFairness.min = Math.min(r.pgyFairness.min, minPgy);
      r.pgyFairness.max = Math.max(r.pgyFairness.max, maxPgy);

      r.totalNF.min = Math.min(r.totalNF.min, m.totalNF);
      r.totalNF.max = Math.max(r.totalNF.max, m.totalNF);
      r.streakSD.min = Math.min(r.streakSD.min, m.streakSD);
      r.streakSD.max = Math.max(r.streakSD.max, m.streakSD);
      r.streak.min = Math.min(r.streak.min, m.maxStreak);
      r.streak.max = Math.max(r.streak.max, m.maxStreak);
    });
    return r;
  }, [metrics]);

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
    setIsSyncing(true);
    setTimeout(async () => {
      await onBatchGenerate();
      setIsSyncing(false);
    }, 50);
  };

  const generatingSchedules = schedules.filter(s => s.isGenerating);

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-8 flex justify-between items-center bg-white border-b">
        <div>
          <h2 className="text-3xl font-black text-gray-900">Schedule Comparison</h2>
          <p className="text-sm text-gray-500 font-medium tracking-tight">Compare metrics across generated schedules to find the optimal balance.</p>
        </div>
        <div className="flex items-center gap-3">

          {progress ? (
            <div className="flex flex-col items-end min-w-[200px]">
              <div className="flex items-center gap-2 text-xs font-black text-blue-600 uppercase tracking-widest">
                <Loader2 size={12} className="animate-spin" />
                Optimizing: {progress.current}/{progress.total}
              </div>
              <div className="w-full bg-blue-100 rounded-full h-1.5 mt-1.5 border border-blue-200 overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                    transition: 'width 0.4s cubic-bezier(0.1, 0.7, 0.1, 1)'
                  }}
                ></div>
              </div>
            </div>
          ) : (
            <button
              onClick={handleRunOptimization}
              disabled={isSyncing}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md font-bold text-sm transition-all shadow-md active:scale-95 disabled:opacity-50 group"
            >
              <Sparkles size={16} className="group-hover:rotate-12 transition-transform" />
              Batch Optimize
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50/50 p-12 text-center">
            <div className="bg-white p-4 rounded-full shadow-sm border mb-4">
              <Plus size={32} className="text-blue-500 animate-pulse" />
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2">No schedules yet</h3>
            <p className="text-gray-500 font-medium max-w-sm">Get started by clicking the <strong>"+" icon</strong> in the tab bar or <strong>Batch Optimize</strong> above to generate your first schedule version.</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden shadow-sm border border-gray-200">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300 text-gray-500 uppercase text-[10px] font-black tracking-widest">
                  <th className="py-4 px-6 text-left cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('name')}>
                    <div className="flex items-center">Schedule Name <SortIcon column="name" /></div>
                  </th>
                  <th className="py-4 px-6 text-center cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('score')}>
                    <div className="flex items-center justify-center">Score (Lower Better) <SortIcon column="score" /></div>
                  </th>
                  <th className="py-4 px-6 text-center cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('avgFairness')}>
                    <div className="flex items-center justify-center">AVG Fairness <SortIcon column="avgFairness" /></div>
                  </th>
                  <th className="py-4 px-6 text-center cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('pgy1Fairness')}>
                    <div className="flex items-center justify-center">PGY-1 <SortIcon column="pgy1Fairness" /></div>
                  </th>
                  <th className="py-4 px-6 text-center cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('pgy2Fairness')}>
                    <div className="flex items-center justify-center">PGY-2 <SortIcon column="pgy2Fairness" /></div>
                  </th>
                  <th className="py-4 px-6 text-center cursor-pointer hover:bg-gray-200 transition-colors border-r-2 border-blue-100" onClick={() => handleSort('pgy3Fairness')}>
                    <div className="flex items-center justify-center">PGY-3 <SortIcon column="pgy3Fairness" /></div>
                  </th>
                  <th className="py-4 px-6 text-center cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('totalNF')}>
                    <div className="flex items-center justify-center">Night Shifts <SortIcon column="totalNF" /></div>
                  </th>
                  <th className="py-4 px-6 text-center cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('streakSD')}>
                    <div className="flex items-center justify-center">Streak SD <SortIcon column="streakSD" /></div>
                  </th>
                  <th className="py-4 px-6 text-center cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('maxStreak')}>
                    <div className="flex items-center justify-center">Max Streak <SortIcon column="maxStreak" /></div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {generatingSchedules.map(gs => (
                  <tr key={gs.id} className="border-b border-gray-50 animate-pulse bg-blue-50/20">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <Loader2 size={16} className="animate-spin text-blue-400" />
                        <span className="text-gray-400 font-bold italic">{gs.name}...</span>
                      </div>
                    </td>
                    <td colSpan={8} className="py-4 px-6">
                      <div className="w-full bg-blue-100/50 h-2 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400/50 animate-pulse" style={{ width: '30%' }}></div>
                      </div>
                    </td>
                  </tr>
                ))}
                {sortedMetrics.map(m => {
                  const isActive = m.id === activeScheduleId;
                  return (
                    <tr key={m.id} className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${isActive ? 'bg-blue-50/40' : ''}`}>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <Identicon id={m.id} size={14} />
                          <button
                            onClick={() => onSelect(m.id)}
                            className="font-black text-blue-600 hover:text-blue-800 hover:underline text-left"
                          >
                            {m.name}
                          </button>
                        </div>
                      </td>

                      <td className={`py-4 px-6 text-center font-mono ${getColor(m.score, ranges.score.min, ranges.score.max, false)}`}>
                        {Math.round(m.score)}
                      </td>

                      <td className={`py-4 px-6 text-center font-mono ${getColor(m.avgFairness, ranges.fairness.min, ranges.fairness.max, true)}`}>
                        {m.avgFairness.toFixed(1)}%
                      </td>

                      <td className={`py-4 px-6 text-center font-mono text-xs ${getColor(m.pgy1Fairness, ranges.pgyFairness.min, ranges.pgyFairness.max, true)}`}>
                        {m.pgy1Fairness}%
                      </td>
                      <td className={`py-4 px-6 text-center font-mono text-xs ${getColor(m.pgy2Fairness, ranges.pgyFairness.min, ranges.pgyFairness.max, true)}`}>
                        {m.pgy2Fairness}%
                      </td>
                      <td className={`py-4 px-6 text-center font-mono text-xs border-r-2 border-blue-100 ${getColor(m.pgy3Fairness, ranges.pgyFairness.min, ranges.pgyFairness.max, true)}`}>
                        {m.pgy3Fairness}%
                      </td>

                      <td className={`py-4 px-6 text-center font-mono ${getColor(m.totalNF, ranges.totalNF.min, ranges.totalNF.max, false)}`}>
                        {m.totalNF}
                      </td>

                      <td className={`py-4 px-6 text-center font-mono ${getColor(m.streakSD, ranges.streakSD.min, ranges.streakSD.max, false)}`}>
                        ± {m.streakSD.toFixed(2)}
                      </td>

                      <td className={`py-4 px-6 text-center font-mono ${getColor(m.maxStreak, ranges.streak.min, ranges.streak.max, false)}`}>
                        {m.maxStreak}w
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="p-6 bg-gray-50 border-t text-[10px] font-bold text-gray-400 flex justify-between items-center uppercase tracking-widest">
        <div className="flex gap-8">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-100 border border-green-200"></div>
            <span>Above average</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-100 border border-red-200"></div>
            <span>Below Average</span>
          </div>
          <div className="flex items-center gap-2 border-l border-gray-300 pl-8">
            <Info size={14} className="text-gray-300" />
            <span>Cost = (Violations × 1M) + (PGY3 Inequity) + (Streak Deviation)</span>
          </div>
        </div>
        <img src="https://www.hcadam.com/api/public/content/349f5f94cafa4b168f99e74a262b8c24" alt="Residency Scheduler Pro" className="h-6 w-auto object-contain opacity-50 hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
};