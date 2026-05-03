import React, { useMemo } from 'react';
import { Resident, ScheduleGrid, AssignmentType, ClinicalSetting, ScheduleHistory } from '../types';
import { ROTATION_METADATA } from '../constants';
import { ShieldCheck, Clock, Building2, Hospital } from 'lucide-react';

interface Props {
    residents: Resident[];
    history: ScheduleHistory;
    activeYear: number;
}

const StackedProgressBar = ({ 
    yearData, 
    target, 
    colorClass,
    totalValue,
    isCap = false
}: { 
    yearData: Record<number, number>, 
    target: number, 
    colorClass: string,
    totalValue: number,
    isCap?: boolean
}) => {
    // Violation if under target for minimums, or over target for caps
    const isViolation = isCap ? totalValue > target : totalValue < target * 0.8; 

    return (
        <div className="w-full flex flex-col gap-1">
            <div className="flex justify-between text-[10px] font-bold tracking-tight">
                <span className="text-muted flex items-center gap-1">
                    <span className={`${isViolation ? 'text-red-600 font-black' : 'text-primary font-bold'} text-xs`}>{totalValue}</span>
                    <span className="text-muted">/ {target}w</span>
                </span>
                {isCap && totalValue > target && <span className="text-red font-black text-[9px] animate-pulse">! OVER CAP</span>}
            </div>
            
            <div className="flex flex-col gap-0.5">
                {[1, 2, 3].map(pgy => {
                    const value = yearData[pgy] || 0;
                    const yearlyTarget = target / 3;
                    const width = Math.min(100, (value / yearlyTarget) * 100);
                    const opacity = pgy === 1 ? 'opacity-40' : pgy === 2 ? 'opacity-70' : 'opacity-100';
                    
                    return (
                        <div key={pgy} className="h-1 w-full bg-light-3 rounded-full overflow-hidden">
                            <div
                                className={`h-full transition-all duration-500 ${colorClass} ${opacity}`}
                                style={{ width: `${width}%` }}
                                title={`PGY-${pgy}: ${value}w / ${yearlyTarget.toFixed(1)}w`}
                            />
                        </div>
                    );
                })}
            </div>

            <div className="h-2 w-full bg-light-2 rounded-full overflow-hidden border border-light-5 mt-1">
                <div
                    className={`h-full transition-all duration-500 ${colorClass}`}
                    style={{ width: `${Math.min(100, (totalValue / target) * 100)}%` }}
                />
            </div>
        </div>
    );
};

export const ACGMEAudit: React.FC<Props> = React.memo(({ residents, history, activeYear }) => {

    const auditData = useMemo(() => {
        return residents.map(r => {
            const pgyData: Record<number, { outpatient: number, inpatient: number, criticalCare: number, nightFloat: number }> = {
                1: { outpatient: 0, inpatient: 0, criticalCare: 0, nightFloat: 0 },
                2: { outpatient: 0, inpatient: 0, criticalCare: 0, nightFloat: 0 },
                3: { outpatient: 0, inpatient: 0, criticalCare: 0, nightFloat: 0 }
            };

            let totalOutpatient = 0;
            let totalInpatient = 0;
            let totalCriticalCare = 0;
            let totalCriticalCareCore = 0;
            let totalNightFloat = 0;

            Object.entries(history).forEach(([yearStr, grid]) => {
                const year = parseInt(yearStr);
                const pgy = year - r.startYear + 1;
                if (pgy < 1 || pgy > 3) return;

                const weeks = grid[r.id] || [];
                weeks.forEach(c => {
                    if (!c || !c.assignment) return;
                    const meta = ROTATION_METADATA[c.assignment];
                    if (!meta) return;

                    if (meta.setting === ClinicalSetting.OUTPATIENT) {
                        pgyData[pgy].outpatient++;
                        totalOutpatient++;
                    }
                    if (meta.setting === ClinicalSetting.INPATIENT) {
                        pgyData[pgy].inpatient++;
                        totalInpatient++;
                    }
                    if (meta.setting === ClinicalSetting.CRITICAL_CARE) {
                        pgyData[pgy].criticalCare++;
                        totalCriticalCare++;
                        if (c.assignment !== AssignmentType.AMCS_CONSULTS) {
                            totalCriticalCareCore++;
                        }
                    }
                    if (c.assignment === AssignmentType.NIGHT_FLOAT) {
                        pgyData[pgy].nightFloat++;
                        totalNightFloat++;
                    }
                });
            });

            return {
                ...r,
                pgyData,
                outpatient: totalOutpatient,
                inpatient: totalInpatient,
                criticalCare: totalCriticalCare,
                nightFloat: totalNightFloat,
                critCareViolation: totalCriticalCareCore > 24, // ACGME Cap is 6 months (24w)
                nfViolation: totalNightFloat > 6 // MHS/ACGME target is 6 weeks total
            };
        });
    }, [residents, history]);

    const globalStats = useMemo(() => {
        const total = auditData.length;
        return {
            outpatientMet: auditData.filter(d => d.outpatient >= 44).length,
            inpatientMet: auditData.filter(d => (d.inpatient + d.criticalCare) >= 48).length,
            critCareSafe: auditData.filter(d => !d.critCareViolation).length,
            nfSafe: auditData.filter(d => d.nightFloat >= 6).length,
            total
        };
    }, [auditData]);

    return (
        <div className="p-6 h-full overflow-y-auto bg-light-1">
            <div className="max-w-7xl mx-auto space-y-6">

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-light-5">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-light-blue/20 rounded-lg text-blue"><Hospital size={20} /></div>
                            <div className="text-xs font-bold text-muted uppercase">Outpatient Compliance</div>
                        </div>
                        <div className="text-2xl font-bold text-primary">{globalStats.outpatientMet} / {globalStats.total}</div>
                        <div className="text-[10px] text-muted mt-1">Goal: 44 Weeks (11 Months)</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-light-5">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-lime-green/20 rounded-lg text-green"><Building2 size={20} /></div>
                            <div className="text-xs font-bold text-muted uppercase">Inpatient Compliance</div>
                        </div>
                        <div className="text-2xl font-bold text-primary">{globalStats.inpatientMet} / {globalStats.total}</div>
                        <div className="text-[10px] text-muted mt-1">Goal: 48 Weeks (12 Months)</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-light-5">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-light-purple/30 rounded-lg text-purple"><Clock size={20} /></div>
                            <div className="text-2xl font-bold text-primary">{globalStats.critCareSafe} / {globalStats.total}</div>
                            <div className="text-[10px] text-muted mt-1">Goal: Max 24 Weeks (6 Months)</div>
                        </div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-light-5">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-creamsicle/30 rounded-lg text-orange"><ShieldCheck size={20} /></div>
                            <div className="text-xs font-bold text-muted uppercase">Night Float Target</div>
                        </div>
                        <div className="text-2xl font-bold text-primary">{globalStats.nfSafe} / {globalStats.total}</div>
                        <div className="text-[10px] text-muted mt-1">Goal: 6 Weeks Total</div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-md border border-light-5 overflow-hidden">
                    <div className="p-4 border-b bg-light-1 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
                            <ShieldCheck className="text-green" /> ACGME Graduation Requirement Audit (Cumulative)
                        </h2>
                        <span className="text-xs text-muted italic">Tracking progress across all historical and current schedules.</span>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-light-2 text-[10px] uppercase font-bold text-secondary">
                            <tr>
                                <th className="px-6 py-3 sticky left-0 bg-light-2 z-10 w-48">Resident</th>
                                <th className="px-6 py-3">Outpatient (44w)</th>
                                <th className="px-6 py-3">Inpatient (48w)</th>
                                <th className="px-6 py-3">Crit Care (Max 24w)</th>
                                <th className="px-6 py-3">Night Float (6w)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {auditData.map(d => (
                                <tr key={d.id} className="hover:bg-light-1">
                                    <td className="px-6 py-4 font-medium sticky left-0 bg-white z-10 border-r">
                                        <div className="flex flex-col">
                                            <span className="text-black">{d.name}</span>
                                            <span className="text-[10px] text-muted">PGY-{d.level} • Cohort {String.fromCharCode(65 + d.cohort)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 w-1/4">
                                        <StackedProgressBar 
                                            yearData={Object.fromEntries(Object.entries(d.pgyData).map(([y, data]) => [y, (data as any).outpatient]))} 
                                            target={44} 
                                            colorClass="bg-blue"
                                            totalValue={d.outpatient}
                                        />
                                    </td>
                                    <td className="px-6 py-4 w-1/4">
                                        <StackedProgressBar 
                                            yearData={Object.fromEntries(Object.entries(d.pgyData).map(([y, data]) => [y, (data as any).inpatient + (data as any).criticalCare]))} 
                                            target={48} 
                                            colorClass="bg-green-2"
                                            totalValue={d.inpatient + d.criticalCare}
                                        />
                                    </td>
                                    <td className="px-6 py-4 w-1/4">
                                        <StackedProgressBar 
                                            yearData={Object.fromEntries(Object.entries(d.pgyData).map(([y, data]) => [y, (data as any).criticalCare]))} 
                                            target={24} 
                                            colorClass="bg-purple"
                                            totalValue={d.criticalCare}
                                            isCap={true}
                                        />
                                    </td>
                                    <td className="px-6 py-4 w-1/4">
                                        <StackedProgressBar 
                                            yearData={Object.fromEntries(Object.entries(d.pgyData).map(([y, data]) => [y, (data as any).nightFloat]))} 
                                            target={6} 
                                            colorClass="bg-orange"
                                            totalValue={d.nightFloat}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    );
});
