import React from 'react';
import { Activity, Play, Settings2, Trash2, Trophy } from 'lucide-react';
import { AlgorithmConfig, AlgorithmStats, CompetitionParams, CompetitionPriority } from '../types';

interface Props {
    algorithms: AlgorithmConfig[];
    stats: Record<string, AlgorithmStats>;
    params: CompetitionParams;
    onParamsChange: (params: CompetitionParams) => void;
    onToggleAlgorithm: (id: string) => void;
    onCompete: () => void;
    onClearStats: () => void;
}

export const CompetitorStudio: React.FC<Props> = ({
    algorithms,
    stats,
    params,
    onParamsChange,
    onToggleAlgorithm,
    onCompete,
    onClearStats
}) => {
    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Header Bar */}
            <div className="bg-white border-b border-slate-200 px-8 py-6 flex items-center justify-between shadow-sm sticky top-0 z-10 transition-all">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
                        <Settings2 size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">New Schedule</h1>
                        <p className="text-slate-500 text-sm font-medium">Fine-tune iterations and select your generation algorithms</p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Top</label>
                        <input
                            type="number"
                            min={1}
                            max={20}
                            value={params.topN || 1}
                            onChange={(e) => onParamsChange({ ...params, topN: parseInt(e.target.value) || 1 })}
                            className="w-16 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-center"
                        />
                        <select
                            value={params.priority}
                            onChange={(e) => onParamsChange({ ...params, priority: e.target.value as CompetitionPriority })}
                            className="bg-slate-100 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all cursor-pointer"
                        >
                            {Object.values(CompetitionPriority).map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center gap-3">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">of</label>
                        <input
                            type="number"
                            min={1}
                            max={10000}
                            value={params.tries}
                            onChange={(e) => onParamsChange({ ...params, tries: parseInt(e.target.value) || 100 })}
                            className="w-24 bg-slate-100 border border-slate-200 rounded-lg px-4 py-2.5 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                    </div>

                    <button
                        onClick={onCompete}
                        disabled={params.algorithmIds.length === 0}
                        className="flex items-center gap-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-200 active:scale-95 group"
                    >
                        <Play size={18} fill="currentColor" className="group-hover:translate-x-0.5 transition-transform" />
                        <span>Compete</span>
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-7xl mx-auto flex flex-col gap-10">

                    {/* Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {algorithms.map(algo => {
                            const algoStats = stats[algo.id] || { bestScore: Infinity, worstScore: -Infinity, bestViolations: Infinity, worstViolations: -Infinity };
                            const isEnabled = params.algorithmIds.includes(algo.id);

                            return (
                                <div
                                    key={algo.id}
                                    className={`
                    flex flex-col rounded-3xl overflow-hidden transition-all duration-300 group
                    ${isEnabled ? 'bg-white shadow-xl shadow-slate-200 ring-2' : 'bg-slate-100 opacity-60 grayscale-[0.5]'}
                  `}
                                    style={{ rigColor: algo.color, ringColor: isEnabled ? `${algo.color}40` : 'transparent' }}
                                >
                                    {/* Card Header */}
                                    <div className={`p-6 flex items-center justify-between`} style={{ backgroundColor: isEnabled ? `${algo.color}08` : 'transparent' }}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg" style={{ backgroundColor: algo.color }}>
                                                <Activity size={20} />
                                            </div>
                                            <h3 className="font-black text-slate-800 text-lg tracking-tight">{algo.name}</h3>
                                        </div>
                                        <button
                                            onClick={() => onToggleAlgorithm(algo.id)}
                                            className={`
                        w-12 h-6 rounded-full relative transition-all duration-300
                        ${isEnabled ? 'bg-blue-600' : 'bg-slate-300'}
                      `}
                                        >
                                            <div className={`
                        absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all duration-300
                        ${isEnabled ? 'translate-x-6' : 'translate-x-0'}
                      `} />
                                        </button>
                                    </div>

                                    {/* Card Body */}
                                    <div className="p-6 flex-1 flex flex-col gap-6">
                                        <p className="text-slate-500 text-sm font-medium leading-relaxed">
                                            {algo.description}
                                        </p>

                                        {/* Stats Section */}
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Trophy size={14} className="text-yellow-500" />
                                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Statistics</span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 hover:border-slate-200 transition-colors">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">Best Cost</div>
                                                    <div className="text-sm font-black text-slate-800">
                                                        {algoStats.bestScore === Infinity ? '—' : Math.round(algoStats.bestScore).toLocaleString()}
                                                    </div>
                                                </div>
                                                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 hover:border-slate-200 transition-colors">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">Fewest Viol.</div>
                                                    <div className="text-sm font-black text-slate-800">
                                                        {algoStats.bestViolations === Infinity ? '—' : algoStats.bestViolations}
                                                    </div>
                                                </div>
                                                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 hover:border-slate-200 transition-colors">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">Worst Cost</div>
                                                    <div className="text-sm font-black text-slate-800">
                                                        {algoStats.worstScore === -Infinity ? '—' : Math.round(algoStats.worstScore).toLocaleString()}
                                                    </div>
                                                </div>
                                                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 hover:border-slate-200 transition-colors">
                                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">Most Viol.</div>
                                                    <div className="text-sm font-black text-slate-800">
                                                        {algoStats.worstViolations === -Infinity ? '—' : algoStats.worstViolations}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Aesthetic Footer Strip */}
                                    <div className="h-1.5 w-full" style={{ backgroundColor: algo.color, opacity: isEnabled ? 1 : 0.2 }} />
                                </div>
                            );
                        })}
                    </div>

                </div>
            </div>
        </div>
    );
};
