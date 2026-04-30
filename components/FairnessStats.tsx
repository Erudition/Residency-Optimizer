
import React, { useMemo, useState } from 'react';
import { Resident, ScheduleGrid } from '../types';
import { calculateFairnessMetrics } from '../services/scheduler';
import { AlertCircle, CheckCircle2, Scale, Flame, Activity, HelpCircle, Moon } from 'lucide-react';

interface Props {
    residents: Resident[];
    schedule: ScheduleGrid;
    precalculated?: any[];
}

interface TooltipState {
    x: number;
    y: number;
    type: 'header' | 'streak';
    title: string;
    content: string[];
}

export const FairnessStats: React.FC<Props> = React.memo(({ residents, schedule, precalculated }) => {
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);

    const stats = useMemo(() => {
        if (precalculated) return precalculated;
        return calculateFairnessMetrics(residents, schedule);
    }, [residents, schedule, precalculated]);

    const getRegretColor = (regret: number) => {
        if (regret <= 10) return 'text-green bg-lime-green/20 border-lime-green';
        if (regret <= 25) return 'text-orange bg-creamsicle/30 border-creamsicle';
        return 'text-red bg-red/10 border-red/40';
    };

    const handleHeaderEnter = (e: React.MouseEvent, title: string, text: string) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setTooltip({
            x: rect.left + (rect.width / 2),
            y: rect.top,
            type: 'header',
            title,
            content: [text]
        });
    };

    const handleStreakEnter = (e: React.MouseEvent, rName: string, streak: number, summary: string[]) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setTooltip({
            x: rect.left + (rect.width / 2),
            y: rect.top,
            type: 'streak',
            title: `Streak Breakdown: ${rName}`,
            content: summary
        });
    };

    const handleMouseLeave = () => {
        setTooltip(null);
    };

    return (
        <div className="h-full overflow-y-auto bg-light-1 p-6 relative">
            <div className="max-w-6xl mx-auto space-y-8">

                <div className="bg-white p-6 rounded-lg shadow-sm border border-light-5">
                    <h2 className="text-xl font-bold text-primary flex items-center gap-2">
                        <Scale className="w-6 h-6 text-blue" />
                        Schedule Fairness & Balance Analysis
                    </h2>
                    <p className="mt-2 text-secondary">
                        This report analyzes workload distribution across three main categories: <strong>Core</strong> (High Intensity), <strong>Required</strong> (Specialty reqs), and <strong>Electives</strong> (Flexible time).
                        <br />
                        It also tracks an overall <strong>Intensity Regret</strong> to prevent burnout.
                    </p>
                </div>

                {stats.map(group => (
                    <div key={group.level} className="bg-white rounded-lg shadow-sm border border-light-5 overflow-hidden">
                        <div className="px-6 py-4 border-b border-light-3 flex justify-between items-center bg-light-1/50">
                            <h3 className="text-lg font-bold text-primary">PGY-{group.level} Cohort</h3>
                            <div className={`px-4 py-1.5 rounded-full border font-bold text-sm flex items-center gap-2 ${getRegretColor(group.fairnessRegret)}`}>
                                {group.fairnessRegret <= 10 ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                Fairness Regret: {group.fairnessRegret}%
                            </div>
                        </div>

                        <div className="p-6">
                            <div className="grid grid-cols-3 gap-6 mb-6">
                                <div className="bg-light-blue/20 p-4 rounded-lg border border-light-blue/40">
                                    <div className="text-xs font-bold text-blue uppercase tracking-wider mb-1">Core Weeks (Avg)</div>
                                    <div className="text-2xl font-bold text-primary">{group.meanCore.toFixed(1)} <span className="text-sm font-normal text-muted">± {group.sdCore.toFixed(2)}</span></div>
                                </div>
                                <div className="bg-lime-green/20 p-4 rounded-lg border border-lime-green/40">
                                    <div className="text-xs font-bold text-green uppercase tracking-wider mb-1">Elective Weeks (Avg)</div>
                                    <div className="text-2xl font-bold text-primary">{group.meanElective.toFixed(1)} <span className="text-sm font-normal text-muted">± {group.sdElective.toFixed(2)}</span></div>
                                </div>
                                <div className="bg-light-purple/30 p-4 rounded-lg border border-purple-100">
                                    <div className="text-xs font-bold text-purple uppercase tracking-wider mb-1">Intensity Regret (Avg)</div>
                                    <div className="text-2xl font-bold text-primary">{group.meanIntensity.toFixed(0)} <span className="text-sm font-normal text-muted">± {group.sdIntensity.toFixed(1)}</span></div>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[800px]">
                                    <thead>
                                        <tr className="text-xs text-muted border-b border-light-3">
                                            <th className="text-left py-3 px-2 font-medium pl-2">Resident</th>

                                            <th
                                                className="text-right py-3 px-2 font-medium relative whitespace-nowrap cursor-help group"
                                                onMouseEnter={(e) => handleHeaderEnter(e, 'Core Weeks', 'Wards, ICU, Night Float, EM, and Clinics.')}
                                                onMouseLeave={handleMouseLeave}
                                            >
                                                <div className="flex items-center justify-end gap-1">
                                                    Core
                                                    <HelpCircle size={12} className="text-muted opacity-50" />
                                                </div>
                                            </th>

                                            <th
                                                className="text-right py-3 px-2 font-medium relative whitespace-nowrap cursor-help group"
                                                onMouseEnter={(e) => handleHeaderEnter(e, 'Elective Weeks', 'Flexible/Voluntary time (Research, Generic Electives).')}
                                                onMouseLeave={handleMouseLeave}
                                            >
                                                <div className="flex items-center justify-end gap-1">
                                                    Electives
                                                    <HelpCircle size={12} className="text-muted opacity-50" />
                                                </div>
                                            </th>

                                            <th
                                                className="text-right py-3 px-2 font-medium relative whitespace-nowrap cursor-help group"
                                                onMouseEnter={(e) => handleHeaderEnter(e, 'Night Float', 'Total weeks of Night Float.')}
                                                onMouseLeave={handleMouseLeave}
                                            >
                                                <div className="flex items-center justify-end gap-1">
                                                    <Moon size={14} />
                                                    Night Float
                                                    <HelpCircle size={12} className="text-muted opacity-50" />
                                                </div>
                                            </th>

                                            <th
                                                className="text-right py-3 px-2 font-medium relative whitespace-nowrap cursor-help group"
                                                onMouseEnter={(e) => handleHeaderEnter(e, 'Intensity Regret', 'Sum of (Weeks × Intensity Rating). Higher means harder year.')}
                                                onMouseLeave={handleMouseLeave}
                                            >
                                                <div className="flex items-center justify-end gap-1">
                                                    <Flame size={14} />
                                                    Intensity
                                                    <HelpCircle size={12} className="text-muted opacity-50" />
                                                </div>
                                            </th>

                                            <th
                                                className="text-right py-3 px-2 font-medium relative whitespace-nowrap cursor-help group"
                                                onMouseEnter={(e) => handleHeaderEnter(e, 'Streak', 'Longest run of consecutive high-intensity weeks.')}
                                                onMouseLeave={handleMouseLeave}
                                            >
                                                <div className="flex items-center justify-end gap-1">
                                                    <Activity size={14} />
                                                    Streak
                                                    <HelpCircle size={12} className="text-muted opacity-50" />
                                                </div>
                                            </th>

                                            <th className="text-right py-3 px-2 font-medium pr-2 whitespace-nowrap">Dev</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {group.residents.map(r => {
                                            const dev = Math.abs(r.coreWeeks - group.meanCore) + Math.abs(r.electiveWeeks - group.meanElective);
                                            const isOutlier = dev > 3;

                                            return (
                                                <tr key={r.id} className="hover:bg-light-1">
                                                    <td className="py-3 px-2 font-medium text-black pl-2">{r.name}</td>

                                                    <td className="py-3 px-2 text-right text-secondary">
                                                        {r.coreWeeks}
                                                        <span className="text-xs text-muted ml-1">
                                                            ({(r.coreWeeks - group.meanCore) > 0 ? '+' : ''}{(r.coreWeeks - group.meanCore).toFixed(1)})
                                                        </span>
                                                    </td>

                                                    <td className="py-3 px-2 text-right text-secondary">
                                                        {r.electiveWeeks}
                                                        <span className="text-xs text-muted ml-1">
                                                            ({(r.electiveWeeks - group.meanElective) > 0 ? '+' : ''}{(r.electiveWeeks - group.meanElective).toFixed(1)})
                                                        </span>
                                                    </td>

                                                    <td className="py-3 px-2 text-right text-indigo-700 font-medium">
                                                        {r.nightFloatWeeks}
                                                    </td>

                                                    <td className="py-3 px-2 text-right font-mono text-primary">
                                                        {r.totalIntensityRegret}
                                                    </td>

                                                    <td
                                                        className="py-3 px-2 text-right cursor-help"
                                                        onMouseEnter={(e) => handleStreakEnter(e, r.name, r.maxIntensityStreak, r.streakSummary)}
                                                        onMouseLeave={handleMouseLeave}
                                                    >
                                                        <span className={`px-2 py-0.5 rounded font-bold text-xs ${r.maxIntensityStreak >= 8 ? 'bg-red/20 text-red-2-dark' :
                                                            r.maxIntensityStreak >= 5 ? 'bg-creamsicle/50 text-orange-700' :
                                                                'bg-light-2 text-secondary'
                                                            }`}>
                                                            {r.maxIntensityStreak} wks
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-2 text-right pr-2">
                                                        {isOutlier && (
                                                            <span className="text-xs bg-red/20 text-red px-2 py-0.5 rounded font-bold">
                                                                High Dev
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {tooltip && (
                <div
                    className="fixed z-[250] bg-black text-white text-xs rounded p-2 shadow-xl max-w-xs pointer-events-none transform -translate-x-1/2 -translate-y-full mt-[-8px]"
                    style={{ left: tooltip.x, top: tooltip.y }}
                >
                    <div className="font-bold mb-1 border-b border-light-9 pb-1">{tooltip.title}</div>
                    {tooltip.type === 'streak' ? (
                        <div className="flex flex-wrap gap-1 max-w-[200px] mt-1">
                            {tooltip.content.map((item, i) => (
                                <span key={i} className="bg-light-9 px-1.5 py-0.5 rounded text-[10px]">
                                    {item}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-1">{tooltip.content[0]}</div>
                    )}
                    <div className="absolute left-1/2 top-full -mt-1 -ml-1 border-4 border-transparent border-t-gray-900"></div>
                </div>
            )}
        </div>
    );
});
