
import React, { useMemo } from 'react';
import { Resident, ScheduleGrid, AssignmentType, ClinicalSetting, ScheduleHistory } from '../types';
import { ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement, ACGME_TYPES, MHS_TYPES } from '../constants';
import { CheckCircle2, XCircle, AlertCircle, ClipboardList, Info, ShieldCheck, ShieldAlert, Clock, AlertTriangle, Users, Calendar } from 'lucide-react';

interface Props {
    residents: Resident[];
    schedule: ScheduleGrid;
    history?: ScheduleHistory;
    activeYear?: number;
    precalculatedViolations?: any[];
    mode: 'acgme' | 'mhs';
}

export const RequirementsStats: React.FC<Props> = React.memo(({ residents, schedule, history, activeYear, precalculatedViolations, mode }) => {

    const getResidentCount = (resId: string, type: AssignmentType) => {
        let count = (schedule[resId] || []).filter(c => c && fulfillsRequirement(c.assignment, type)).length;
        if (history && activeYear !== undefined) {
            Object.entries(history).forEach(([yStr, grid]) => {
                const y = parseInt(yStr);
                if (y < activeYear) {
                    const weeks = grid[resId] || [];
                    count += weeks.filter(c => c && fulfillsRequirement(c.assignment, type)).length;
                }
            });
        }
        return count;
    };

    const auditData = useMemo(() => {
        if (mode !== 'mhs' || activeYear === undefined || !history) return [];
        return residents.map(r => {
            const activePgy = activeYear - r.startYear + 1;
            const currentYearGrid = history[activeYear] || {};
            const activeWeeks = currentYearGrid[r.id] || [];

            const isPGY2 = activePgy === 2;
            const hasNIMA = activeWeeks.some(c => c && (c.assignment === AssignmentType.NIMA_BLOCK || c.assignment === AssignmentType.NIMA_CLINIC));
            const hasCCIM = activeWeeks.some(c => c && c.assignment === AssignmentType.CLINIC);
            const clinicValid = isPGY2 ? hasNIMA : hasCCIM;

            const blackoutWeeks = [0, 5, 6, 7, 8, 9, 50, 51];
            const hasBlackoutVacation = activeWeeks.some((c, idx) => c && c.assignment === AssignmentType.VACATION && blackoutWeeks.includes(idx));

            const splitBlocks = [AssignmentType.NEURO, AssignmentType.GI, AssignmentType.PULM];
            const hasSplitBlockDeficit = splitBlocks.some(st => {
                const total = activeWeeks.filter(c => c && c.assignment === st).length;
                return total === 1;
            });

            const hasElectiveToOverwrite = activeWeeks.some(c => c && c.assignment === AssignmentType.ELECTIVE);

            return {
                ...r,
                clinicValid,
                hasBlackoutVacation,
                hasSplitBlockDeficit,
                hasElectiveToOverwrite,
                pgy: activePgy
            };
        });
    }, [residents, history, activeYear, mode]);

    const jeopardyGapWeeks = useMemo(() => {
        if (mode !== 'mhs' || activeYear === undefined || !history) return [];
        const gaps: number[] = [];
        const currentYearGrid = history[activeYear] || {};

        for (let w = 0; w < 52; w++) {
            let pgy2Flexible = 0;
            let pgy3Flexible = 0;

            residents.forEach(res => {
                const pgy = activeYear - res.startYear + 1;
                const cell = currentYearGrid[res.id]?.[w];
                if (!cell || !cell.assignment) return;
                const assign = cell.assignment;
                const isFlexible = assign === AssignmentType.ELECTIVE || [
                    AssignmentType.CARDS, AssignmentType.ID, AssignmentType.NEPH, AssignmentType.PULM,
                    AssignmentType.ONC, AssignmentType.NEURO, AssignmentType.RHEUM, AssignmentType.GI,
                    AssignmentType.ADD_MED, AssignmentType.ENDO, AssignmentType.GERI, AssignmentType.PALLIATIVE
                ].includes(assign);

                if (isFlexible) {
                    if (pgy === 2) pgy2Flexible++;
                    if (pgy === 3) pgy3Flexible++;
                }
            });

            if (pgy2Flexible === 0 || pgy3Flexible === 0) gaps.push(w + 1);
        }
        return gaps;
    }, [residents, history, activeYear, mode]);

    const renderGroup = (level: number) => {
        const groupResidents = residents.filter(r => r.level === level);
        const allReqs = REQUIREMENTS[level] || [];
        const reqs = allReqs.filter(r => mode === 'acgme' ? ACGME_TYPES.includes(r.type) : MHS_TYPES.includes(r.type));

        if (reqs.length === 0 || groupResidents.length === 0) return null;

        return (
            <div className="bg-white rounded-xl shadow-sm border border-light-5 overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-light-3 bg-light-1/50 flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide
              ${level === 1 ? 'bg-lime-green/40 text-green-dark' : level === 2 ? 'bg-light-blue text-navy' : 'bg-light-purple/50 text-purple-2'}
           `}>
                        PGY-{level}
                    </span>
                    <h3 className="text-lg font-bold text-primary">{mode === 'acgme' ? 'ACGME' : 'MHS'} Graduation Targets</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs text-muted bg-light-1 border-b border-light-3">
                                <th className="text-left py-3 px-4 font-medium sticky left-0 bg-light-1 z-10">Resident</th>
                                {reqs.map(req => (
                                    <th key={req.type} className="text-center py-3 px-2 font-medium min-w-[100px]">
                                        <div className="truncate max-w-[120px]" title={req.label}>{req.label}</div>
                                    </th>
                                ))}
                                <th className="text-center py-3 px-4 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {groupResidents.map(r => {
                                let metAll = true;

                                return (
                                    <tr key={r.id} className="hover:bg-light-1 transition-colors">
                                        <td className="py-3 px-4 font-medium text-black sticky left-0 bg-white z-10 border-r border-light-3">
                                            {r.name}
                                        </td>
                                        {reqs.map(req => {
                                            const count = getResidentCount(r.id, req.type);
                                            const isMet = count >= req.target;
                                            if (!isMet) metAll = false;

                                            return (
                                                <td key={req.type} className="py-2 px-2 text-center border-r border-gray-50/50">
                                                    <div className="flex flex-col items-center justify-center">
                                                        <span className={`font-mono font-bold text-xs ${isMet ? 'text-green-dark' : 'text-red'}`}>
                                                            {count} / {req.target}
                                                        </span>
                                                        <div className="w-12 h-1 bg-light-4 rounded-full mt-1 overflow-hidden">
                                                            <div 
                                                                className={`h-full transition-all duration-500 ${isMet ? 'bg-green' : 'bg-red'}`} 
                                                                style={{ width: `${Math.min(100, (count / req.target) * 100)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                            );
                                        })}

                                        <td className="py-2 px-4 text-center">
                                            {metAll ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-lime-green/20 text-green-dark border border-lime-green/40 uppercase">
                                                    <CheckCircle2 size={10} /> Compliant
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-red/10 text-red-2-dark border border-red/20 uppercase">
                                                    <AlertCircle size={10} /> Deficit
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
        );
    };

    return (
        <div className="h-full overflow-y-auto bg-light-1 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-light-5 mb-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-3 rounded-xl ${mode === 'acgme' ? 'bg-blue/10 text-blue' : 'bg-purple/10 text-purple-2'}`}>
                                <ClipboardList size={28} />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black text-primary tracking-tight uppercase">
                                    {mode === 'acgme' ? 'ACGME Requirements' : 'MHS Specific Requirements'}
                                </h2>
                                <p className="text-muted text-sm font-medium">
                                    {mode === 'acgme' 
                                        ? 'Core specialty and multidisciplinary mandates for national accreditation.' 
                                        : 'Program-specific curricular goals, staffing targets, and institutional policies.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {renderGroup(1)}
                {renderGroup(2)}
                {renderGroup(3)}

                {mode === 'mhs' && auditData.length > 0 && (
                    <div className="space-y-8 mt-12">
                        {/* Policy Audit Section */}
                        <div className="bg-white rounded-xl shadow-sm border border-light-5 overflow-hidden">
                            <div className="px-6 py-4 border-b bg-light-1 flex items-center gap-3">
                                <ShieldCheck className="text-blue" size={20} />
                                <h2 className="text-lg font-bold text-primary uppercase tracking-tight">
                                    Curriculum 2026 Policy Audit
                                </h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-light-2 text-[10px] uppercase font-bold text-secondary">
                                        <tr>
                                            <th className="px-6 py-3 sticky left-0 bg-light-2 z-10 w-48">Resident</th>
                                            <th className="px-6 py-3">Clinic Assignment</th>
                                            <th className="px-6 py-3">Blackout Period Status</th>
                                            <th className="px-6 py-3">Deficit Recovery Flag</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {auditData.map(d => (
                                            <tr key={d.id} className="hover:bg-light-1">
                                                <td className="px-6 py-4 font-medium sticky left-0 bg-white z-10 border-r">
                                                    <div className="flex flex-col">
                                                        <span className="text-black font-bold">{d.name}</span>
                                                        <span className="text-[10px] text-muted font-black uppercase">PGY-{d.pgy}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        {d.clinicValid ? (
                                                            <span className="text-green font-bold flex items-center gap-1">
                                                                <ShieldCheck size={16} /> Valid {d.pgy === 2 ? 'NIMA' : 'CCIM'}
                                                            </span>
                                                        ) : (
                                                            <span className="text-red font-bold flex items-center gap-1 text-xs uppercase tracking-tighter">
                                                                <AlertTriangle size={16} /> Incorrect Location
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        {!d.hasBlackoutVacation ? (
                                                            <span className="text-green font-bold flex items-center gap-1">
                                                                <ShieldCheck size={16} /> No PTO Conflicts
                                                            </span>
                                                        ) : (
                                                            <span className="text-red font-bold flex items-center gap-1 text-xs uppercase tracking-tighter">
                                                                <AlertTriangle size={16} /> Blackout Conflict
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        {!d.hasSplitBlockDeficit ? (
                                                            <span className="text-green font-bold flex items-center gap-1">
                                                                <ShieldCheck size={16} /> Fully Met / On-Track
                                                            </span>
                                                        ) : d.hasElectiveToOverwrite ? (
                                                            <span className="text-orange-600 font-bold flex items-center gap-1 text-xs uppercase tracking-tighter leading-tight max-w-[200px]">
                                                                <AlertTriangle size={16} className="shrink-0" /> Elective Overwritten for Deficit
                                                            </span>
                                                        ) : (
                                                            <span className="text-red font-bold flex items-center gap-1 text-xs uppercase tracking-tighter">
                                                                <AlertTriangle size={16} /> Deficit (Override Needed)
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Jeopardy Pool Section */}
                        <div className="bg-white rounded-xl shadow-sm border border-light-5 overflow-hidden">
                            <div className="px-6 py-4 border-b bg-light-1 flex items-center gap-3">
                                <Users className="text-purple" size={20} />
                                <h2 className="text-lg font-bold text-primary uppercase tracking-tight">
                                    Jeopardy & Backup Coverage Status
                                </h2>
                            </div>
                            <div className="p-6 text-sm text-secondary space-y-4">
                                <p className="text-navy-dark leading-relaxed font-medium">
                                    Mandate: At least **one PGY-3 and one PGY-2** on a flexible block (Elective or Consult) per week to serve as a reliable Jeopardy pool.
                                </p>

                                <div className={`p-4 rounded-xl border ${jeopardyGapWeeks.length === 0 ? 'bg-green/10 border-green/30' : 'bg-red/10 border-red/30'}`}>
                                    {jeopardyGapWeeks.length === 0 ? (
                                        <div className="text-green-dark font-black flex items-center gap-3">
                                            <ShieldCheck className="text-green" size={16} />
                                            <span>All weeks have first and second line Jeopardy coverage fully staffed!</span>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="text-red-700 font-black flex items-center gap-3">
                                                <AlertTriangle className="text-red" size={16} />
                                                <span>Jeopardy Gaps detected in {jeopardyGapWeeks.length} weeks.</span>
                                            </div>
                                            <div className="flex gap-1.5 flex-wrap ml-9">
                                                {jeopardyGapWeeks.map(w => (
                                                    <span key={w} className="px-2.5 py-1 bg-white border border-red-200 text-red-700 text-xs font-black rounded-lg shadow-sm">
                                                        Week {w}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});
