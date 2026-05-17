import React, { useMemo } from 'react';
import { Resident, ScheduleGrid, AssignmentType, ClinicalSetting, ScheduleHistory } from '../types';
import { ROTATION_METADATA, REQUIREMENTS, ACGME_TYPES, MHS_TYPES } from '../constants';
import { CheckCircle2, XCircle, AlertCircle, ClipboardList, ShieldCheck, ShieldAlert, Clock, AlertTriangle, Users, Building2, Hospital } from 'lucide-react';
import { RequirementsEngine } from '../services/requirementsEngine';

interface Props {
    residents: Resident[];
    schedule: ScheduleGrid;
    history?: ScheduleHistory;
    activeYear?: number;
    mode: 'acgme' | 'mhs';
}

const StackedProgressBar = ({ 
    yearData, 
    minWeeks, 
    colorClass,
    totalValue,
    isCap = false
}: { 
    yearData: Record<number, number>, 
    minWeeks: number, 
    colorClass: string,
    totalValue: number,
    isCap?: boolean
}) => {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-end">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${totalValue > minWeeks && isCap ? 'text-red' : 'text-slate-500'}`}>
                    {totalValue} / {minWeeks}w
                </span>
                {totalValue >= minWeeks && !isCap && <CheckCircle2 size={12} className="text-green mb-0.5" />}
                {totalValue > minWeeks && isCap && <AlertTriangle size={12} className="text-red mb-0.5" />}
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner border border-slate-200/50">
                {[1, 2, 3].map(pgy => {
                    const value = yearData[pgy] || 0;
                    if (value === 0) return null;
                    const width = (value / Math.max(minWeeks, totalValue)) * 100;
                    const opacity = pgy === 1 ? 'opacity-40' : pgy === 2 ? 'opacity-70' : 'opacity-100';
                    return (
                        <div 
                            key={pgy}
                            className={`${colorClass} ${opacity} h-full transition-all duration-500`}
                            style={{ width: `${width}%` }}
                            title={`PGY-${pgy}: ${value}w / ${minWeeks}w`}
                        />
                    );
                })}
            </div>
        </div>
    );
};

export const RequirementsStats: React.FC<Props> = ({ residents, schedule, history, activeYear, mode }) => {
    const hist = history || {};

    const auditData = useMemo(() => {
        if (activeYear === undefined) return [];

        return residents.map(r => {
            const currentPgy = activeYear - r.startYear + 1;
            const unifiedGrid = schedule[r.id] || [];
            
            const pgyData: Record<number, { outpatient: number, inpatient: number, criticalCare: number, nightFloat: number }> = {
                1: { outpatient: 0, inpatient: 0, criticalCare: 0, nightFloat: 0 },
                2: { outpatient: 0, inpatient: 0, criticalCare: 0, nightFloat: 0 },
                3: { outpatient: 0, inpatient: 0, criticalCare: 0, nightFloat: 0 }
            };

            for (let l = 1; l <= 3; l++) {
                const year = r.startYear + l - 1;
                let weeks: any[] = [];
                
                if (year < activeYear) {
                    weeks = hist[year]?.[r.id] || [];
                } else {
                    const offset = (year - activeYear) * 52;
                    weeks = unifiedGrid.slice(offset, offset + 52);
                }

                weeks.forEach(c => {
                    if (!c?.assignment) return;
                    const meta = ROTATION_METADATA[c.assignment];
                    if (!meta) return;
                    if (meta.setting === ClinicalSetting.OUTPATIENT) pgyData[l].outpatient++;
                    if (meta.setting === ClinicalSetting.INPATIENT) pgyData[l].inpatient++;
                    if (meta.setting === ClinicalSetting.CRITICAL_CARE) pgyData[l].criticalCare++;
                    if (c.assignment === 'NF') pgyData[l].nightFloat++;
                });
            }

            const totalOutpatient = pgyData[1].outpatient + pgyData[2].outpatient + pgyData[3].outpatient;
            const totalInpatient = pgyData[1].inpatient + pgyData[2].inpatient + pgyData[3].inpatient;
            const totalCriticalCare = pgyData[1].criticalCare + pgyData[2].criticalCare + pgyData[3].criticalCare;
            const totalNightFloat = pgyData[1].nightFloat + pgyData[2].nightFloat + pgyData[3].nightFloat;

            // Policy Audit
            const activeYearWeeks = unifiedGrid.slice(0, 52);
            const clinicValid = activeYearWeeks.every(c => !c?.assignment || RequirementsEngine.isClinicSiteCorrect(r, c.assignment));
            
            const blackoutWeeks = [0, 5, 6, 7, 8, 9, 50, 51];
            const hasBlackoutVacation = activeYearWeeks.some((c, idx) => c && c.assignment === 'VAC' && blackoutWeeks.includes(idx));

            const hasSplitBlockDeficit = RequirementsEngine.getViolations([r], schedule, hist, activeYear)
                .some(v => v.year === activeYear && ['Neuro', 'GI', 'Pulm'].includes(v.type));

            const hasElectiveToOverwrite = activeYearWeeks.some(c => c && c.assignment === 'ELECTIVE');

            return {
                ...r,
                pgyData,
                outpatient: totalOutpatient,
                inpatient: totalInpatient,
                criticalCare: totalCriticalCare,
                nightFloat: totalNightFloat,
                critCareViolation: totalCriticalCare > 24,
                nfViolation: totalNightFloat < 6,
                clinicValid,
                hasBlackoutVacation,
                hasSplitBlockDeficit,
                hasElectiveToOverwrite,
                pgy: currentPgy
            };
        });
    }, [residents, hist, schedule, activeYear]);

    const globalStats = useMemo(() => {
        if (mode !== 'acgme') return null;
        const total = auditData.length;
        return {
            outpatientMet: auditData.filter(d => d.outpatient >= 44).length,
            inpatientMet: auditData.filter(d => (d.inpatient + d.criticalCare) >= 48).length,
            critCareSafe: auditData.filter(d => !d.critCareViolation).length,
            nfSafe: auditData.filter(d => d.nightFloat >= 6).length,
            total
        };
    }, [auditData, mode]);

    const jeopardyGapWeeks = useMemo(() => {
        if (mode !== 'mhs' || activeYear === undefined) return [];
        const gaps: number[] = [];
        const totalWeeks = (Object.values(schedule)[0] as any[])?.length || 52;

        for (let w = 0; w < totalWeeks; w++) {
            let pgy2Flexible = 0;
            let pgy3Flexible = 0;

            residents.forEach(res => {
                const currentYear = activeYear + Math.floor(w / 52);
                const pgy = currentYear - res.startYear + 1;
                const cell = schedule[res.id]?.[w];
                if (!cell || !cell.assignment) return;
                
                if (RequirementsEngine.isJeopardyBlock(cell.assignment)) {
                    if (pgy === 2) pgy2Flexible++;
                    if (pgy === 3) pgy3Flexible++;
                }
            });

            if (pgy2Flexible === 0 || pgy3Flexible === 0) gaps.push(w + 1);
        }
        return gaps;
    }, [residents, schedule, activeYear, mode]);

    const isUnified = useMemo(() => {
        const vals = Object.values(schedule);
        return vals.length > 0 ? (vals[0] as any).length > 52 : false;
    }, [schedule]);

    const renderGroup = (level: number) => {
        const groupResidents = residents.filter(r => (activeYear! - r.startYear + 1) === level);
        const allReqs = REQUIREMENTS[level] || [];
        const reqs = allReqs.filter(r => mode === 'acgme' ? ACGME_TYPES.includes(r.type) : MHS_TYPES.includes(r.type));

        if (reqs.length === 0 || groupResidents.length === 0) return null;

        return (
            <div key={level} className="bg-white rounded-xl shadow-sm border border-light-5 overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-light-3 bg-light-1/50 flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide
              ${level === 1 ? 'bg-lime-green/40 text-green-dark' : level === 2 ? 'bg-light-blue text-navy' : 'bg-light-purple/50 text-purple-2'}
           `}>
                        PGY-{level}
                    </span>
                    <h3 className="text-lg font-bold text-primary">{mode === 'acgme' ? 'ACGME' : 'MHS'} {isUnified ? '3-Year' : 'Annual'} Graduation Minimums</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-light-2">
                                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b w-1/4">Resident</th>
                                {reqs.map(r => {
                                    let headerMin = r.minWeeks;
                                    if (isUnified) {
                                        headerMin = 0;
                                        for (let l = 1; l <= 3; l++) {
                                            const levelReqs = REQUIREMENTS[l] || [];
                                            const levelReq = levelReqs.find(rq => rq.type === r.type);
                                            headerMin += levelReq ? levelReq.minWeeks : 0;
                                        }
                                    }
                                    return (
                                        <th key={r.type} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b text-center min-w-[100px]">
                                            {r.label} <span className="text-[9px] font-black opacity-60">({headerMin}w+)</span>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-light-3">
                            {groupResidents.map(res => {
                                return (
                                    <tr key={res.id} className="hover:bg-light-1/30 transition-colors">
                                        <td className="px-6 py-4 border-b">
                                            <div className="font-bold text-primary">{res.name}</div>
                                            <div className="text-[10px] text-slate-400 font-mono uppercase tracking-tighter">ID: {res.id}</div>
                                        </td>
                                        {reqs.map(req => {
                                            const isACGME = ACGME_TYPES.includes(req.type);
                                            const actual = RequirementsEngine.getActualWeeks(res, req.type, schedule, hist, activeYear!, isUnified ? (res.startYear + 2) : activeYear!, isACGME || isUnified);
                                            
                                            let minWeeks = req.minWeeks;
                                            if (isUnified) {
                                                minWeeks = 0;
                                                for (let l = 1; l <= 3; l++) {
                                                    const levelReqs = REQUIREMENTS[l] || [];
                                                    const levelReq = levelReqs.find(rq => rq.type === req.type);
                                                    minWeeks += levelReq ? levelReq.minWeeks : 0;
                                                }
                                            } else if (isACGME) {
                                                minWeeks = 0;
                                                for (let l = 1; l <= level; l++) {
                                                    const levelReqs = REQUIREMENTS[l] || [];
                                                    const levelReq = levelReqs.find(rq => rq.type === req.type);
                                                    minWeeks += levelReq ? levelReq.minWeeks : 0;
                                                }
                                            }

                                            const isViolated = actual < minWeeks;
                                            return (
                                                <td key={req.type} className="px-4 py-4 border-b text-center">
                                                    <div className={`text-sm font-bold ${isViolated ? 'text-red' : 'text-green-dark'}`}>
                                                        {actual} / {minWeeks}
                                                    </div>
                                                    <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1 overflow-hidden">
                                                        <div 
                                                            className={`h-full ${isViolated ? 'bg-red/60' : 'bg-green/60'}`} 
                                                            style={{ width: `${Math.min(100, (actual / minWeeks) * 100)}%` }}
                                                        />
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    if (mode === 'acgme') {
        return (
            <div className="space-y-8">
                {/* Global Stats Summary */}
                {globalStats && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col gap-1">
                            <div className="flex justify-between items-start">
                                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Outpatient (44w+)</span>
                                <Building2 size={16} className="text-blue" />
                            </div>
                            <div className="text-2xl font-black text-primary">{globalStats.outpatientMet} / {globalStats.total}</div>
                            <div className="w-full bg-slate-100 h-1 rounded-full mt-1">
                                <div className="bg-blue h-full rounded-full" style={{ width: `${(globalStats.outpatientMet / globalStats.total) * 100}%` }} />
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col gap-1">
                            <div className="flex justify-between items-start">
                                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Inpatient (48w+)</span>
                                <Hospital size={16} className="text-lime-green" />
                            </div>
                            <div className="text-2xl font-black text-primary">{globalStats.inpatientMet} / {globalStats.total}</div>
                            <div className="w-full bg-slate-100 h-1 rounded-full mt-1">
                                <div className="bg-lime-green h-full rounded-full" style={{ width: `${(globalStats.inpatientMet / globalStats.total) * 100}%` }} />
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col gap-1">
                            <div className="flex justify-between items-start">
                                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Crit Care Safe (24w max)</span>
                                <AlertCircle size={16} className="text-purple" />
                            </div>
                            <div className="text-2xl font-black text-primary">{globalStats.critCareSafe} / {globalStats.total}</div>
                            <div className="w-full bg-slate-100 h-1 rounded-full mt-1">
                                <div className="bg-purple h-full rounded-full" style={{ width: `${(globalStats.critCareSafe / globalStats.total) * 100}%` }} />
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col gap-1">
                            <div className="flex justify-between items-start">
                                <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Night Float Met (6w+)</span>
                                <Clock size={16} className="text-navy" />
                            </div>
                            <div className="text-2xl font-black text-primary">{globalStats.nfSafe} / {globalStats.total}</div>
                            <div className="w-full bg-slate-100 h-1 rounded-full mt-1">
                                <div className="bg-navy h-full rounded-full" style={{ width: `${(globalStats.nfSafe / globalStats.total) * 100}%` }} />
                            </div>
                        </div>
                    </div>
                )}

                {/* ACGME Graduation Requirement Audit */}
                <div className="bg-white rounded-xl shadow-sm border border-light-5 overflow-hidden">
                    <div className="px-6 py-4 border-b border-light-3 bg-light-1/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ClipboardList className="text-primary" size={20} />
                            <h3 className="text-lg font-bold text-primary">ACGME Graduation Requirement Audit</h3>
                        </div>
                        <div className="text-xs font-medium text-slate-400 italic">
                            Cumulative tracking across all 3 years
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-light-2">
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">Resident</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">Outpatient (44w+)</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">Inpatient (48w+)</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">Crit Care (24w max)</th>
                                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">Compliance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-light-3">
                                {auditData.map(d => (
                                    <tr key={d.id} className="hover:bg-light-1/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-primary">{d.name}</div>
                                            <div className="text-xs text-slate-400">PGY-{d.pgy} (Started {d.startYear})</div>
                                        </td>
                                        <td className="px-6 py-4 w-1/4">
                                            <StackedProgressBar 
                                                yearData={Object.fromEntries(Object.entries(d.pgyData).map(([k, v]) => [k, (v as { outpatient: number }).outpatient]))}
                                                minWeeks={44} 
                                                colorClass="bg-blue"
                                                totalValue={d.outpatient}
                                            />
                                        </td>
                                        <td className="px-6 py-4 w-1/4">
                                            <StackedProgressBar 
                                                yearData={Object.fromEntries(Object.entries(d.pgyData).map(([k, v]) => [k, (v as { inpatient: number, criticalCare: number }).inpatient + (v as { inpatient: number, criticalCare: number }).criticalCare]))}
                                                minWeeks={48} 
                                                colorClass="bg-lime-green"
                                                totalValue={d.inpatient + d.criticalCare}
                                            />
                                        </td>
                                        <td className="px-6 py-4 w-1/4">
                                            <StackedProgressBar 
                                                yearData={Object.fromEntries(Object.entries(d.pgyData).map(([k, v]) => [k, (v as { criticalCare: number }).criticalCare]))}
                                                minWeeks={24} 
                                                colorClass="bg-purple"
                                                totalValue={d.criticalCare}
                                                isCap={true}
                                            />
                                        </td>
                                        <td className="px-6 py-4 w-1/4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    {d.clinicValid ? (
                                                        <span className="text-green font-bold flex items-center gap-1">
                                                            <ShieldCheck size={16} /> Valid {d.startYear === 2025 ? 'NIMA' : 'CCIM'}
                                                        </span>
                                                    ) : (
                                                        <span className="text-red font-bold flex items-center gap-1 text-xs uppercase tracking-tighter">
                                                            <ShieldAlert size={16} /> Site Mismatch
                                                        </span>
                                                    )}
                                                </div>
                                                {d.hasBlackoutVacation && (
                                                    <div className="text-red font-bold text-[10px] flex items-center gap-1 bg-red/5 p-1 rounded border border-red/10">
                                                        <AlertTriangle size={12} /> PTO during Blackout
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Jeopardy Monitoring */}
            {jeopardyGapWeeks.length > 0 && (
                <div className="bg-red/5 border border-red/20 rounded-xl p-4 flex items-start gap-3">
                    <div className="bg-red/10 p-2 rounded-lg text-red">
                        <Users size={20} />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-red uppercase tracking-wide">Jeopardy Coverage Gaps Detected</h4>
                        <p className="text-xs text-red/80 mt-1">
                            The following weeks lack minimum senior backup (1 PGY-2 AND 1 PGY-3):
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {jeopardyGapWeeks.map(w => (
                                <span key={w} className="px-2 py-0.5 bg-red text-white text-[10px] font-bold rounded shadow-sm">
                                    Week {w}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* MHS Annual Requirement Tables */}
            {[1, 2, 3].map(renderGroup)}

            {/* Deficit Recovery Audit */}
            <div className="bg-white rounded-xl shadow-sm border border-light-5 overflow-hidden mt-8">
                <div className="px-6 py-4 border-b border-light-3 bg-light-1/50 flex items-center gap-2">
                    <AlertCircle className="text-primary" size={20} />
                    <h3 className="text-lg font-bold text-primary">Deficit Recovery Audit ({isUnified ? '3-Year' : 'Annual'})</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-light-2">
                                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">Resident</th>
                                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">Deficit Recovery Flag</th>
                                <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-light-3">
                            {auditData.map(d => (
                                <tr key={d.id} className="hover:bg-light-1/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-primary">{d.name}</div>
                                        <div className="text-xs text-slate-400">PGY-{d.pgy}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {d.hasSplitBlockDeficit ? (
                                            <div className="flex items-center gap-2 text-red font-bold">
                                                <AlertTriangle size={18} />
                                                <span>Subspecialty Deficit Detected</span>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 text-green font-medium">
                                                <CheckCircle2 size={18} />
                                                <span>No Deficits</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        {d.hasSplitBlockDeficit && (
                                            d.hasElectiveToOverwrite ? (
                                                <div className="text-blue font-bold text-xs uppercase flex items-center gap-1.5">
                                                    <Clock size={14} /> Auto-recovery scheduled
                                                </div>
                                            ) : (
                                                <div className="text-red-dark font-black text-xs uppercase flex items-center gap-1.5">
                                                    <XCircle size={14} /> Training Extension Likely
                                                </div>
                                            )
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
