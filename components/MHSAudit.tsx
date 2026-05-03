import React, { useMemo } from 'react';
import { Resident, ScheduleGrid, AssignmentType, ClinicalSetting, ScheduleHistory } from '../types';
import { ROTATION_METADATA } from '../constants';
import { ShieldCheck, ShieldAlert, Clock, AlertTriangle, Users, Calendar } from 'lucide-react';

interface Props {
    residents: Resident[];
    history: ScheduleHistory;
    activeYear: number;
}

export const MHSAudit: React.FC<Props> = React.memo(({ residents, history, activeYear }) => {

    const auditData = useMemo(() => {
        return residents.map(r => {
            // Policy compliance logic for active year
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
                return total === 1; // Exactly 1 week or less indicates deficit on 2w splits
            });

            const hasElectiveToOverwrite = activeWeeks.some(c => c && c.assignment === AssignmentType.ELECTIVE);

            return {
                ...r,
                clinicValid,
                hasBlackoutVacation,
                hasSplitBlockDeficit,
                hasElectiveToOverwrite
            };
        });
    }, [residents, history, activeYear]);

    const jeopardyGapWeeks = useMemo(() => {
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

            if (pgy2Flexible === 0 || pgy3Flexible === 0) {
                gaps.push(w + 1);
            }
        }
        return gaps;
    }, [residents, history, activeYear]);

    return (
        <div className="p-6 h-full overflow-y-auto bg-light-1">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Additional 2026 Curriculum Specific Policy Audit Table */}
                <div className="bg-white rounded-xl shadow-md border border-light-5 overflow-hidden">
                    <div className="p-4 border-b bg-light-1 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue/10 text-blue rounded-xl">
                                <ShieldCheck size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-primary tracking-tight uppercase">
                                    MHS Policy & Deficit Recovery Audit
                                </h2>
                                <p className="text-muted text-sm font-medium">Curriculum 2026: Clinic alignment, PTO blackout, and core recovery</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-light-1 flex gap-4 text-xs">
                        <div className="flex items-center gap-2">
                            <span className="inline-block w-3 h-3 bg-green rounded-full"></span>
                            <span>Compliant</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="inline-block w-3 h-3 bg-red rounded-full"></span>
                            <span>Needs Attention / Override Needed</span>
                        </div>
                    </div>
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
                                            <span className="text-[10px] text-muted font-black uppercase">PGY-{activeYear - d.startYear + 1}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            {d.clinicValid ? (
                                                <span className="text-green font-bold flex items-center gap-1">
                                                    <ShieldCheck size={16} /> Valid {activeYear - d.startYear + 1 === 2 ? 'NIMA' : 'CCIM'}
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
                                                    <ShieldCheck size={16} /> Fully Met / Split Core On-Track
                                                </span>
                                            ) : d.hasElectiveToOverwrite ? (
                                                <span className="text-orange-600 font-bold flex items-center gap-1 text-xs uppercase tracking-tighter leading-tight max-w-[200px]">
                                                    <AlertTriangle size={16} className="shrink-0" /> Pure Elective Overwritten to Fulfill Deficit
                                                </span>
                                            ) : (
                                                <span className="text-red font-bold flex items-center gap-1 text-xs uppercase tracking-tighter">
                                                    <AlertTriangle size={16} /> Deficit Flag (Override Needed)
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Jeopardy Coverage / Backup Gaps Section */}
                <div className="bg-white rounded-xl shadow-md border border-light-5 overflow-hidden">
                    <div className="p-4 border-b bg-light-1">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple/10 text-purple rounded-xl">
                                <Users size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-primary tracking-tight uppercase">
                                    Jeopardy & Backup Coverage Status
                                </h2>
                                <p className="text-muted text-sm font-medium">Monitoring availability of flexible seniors for emergency coverage</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-6 text-sm text-secondary space-y-4">
                        <div className="bg-light-blue/10 border border-light-blue p-4 rounded-xl flex gap-4 items-start">
                            <div className="text-blue mt-1"><Calendar size={20} /></div>
                            <p className="text-navy-dark leading-relaxed font-medium">
                                The Methodist Curriculum Proposal explicitly mandates at least **one PGY-3 and one PGY-2** 
                                on a flexible block (Elective or Consult) per week to serve as a reliable Jeopardy pool. 
                                This ensures hospital coverage during unexpected absences.
                            </p>
                        </div>

                        <div className={`p-4 rounded-xl border ${jeopardyGapWeeks.length === 0 ? 'bg-green/10 border-green/30' : 'bg-red/10 border-red/30'}`}>
                            {jeopardyGapWeeks.length === 0 ? (
                                <div className="text-green-dark font-black flex items-center gap-3">
                                    <div className="bg-green text-white p-1 rounded-full"><ShieldCheck size={16} /></div>
                                    <span>All weeks have first and second line Jeopardy coverage fully staffed!</span>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="text-red-700 font-black flex items-center gap-3">
                                        <div className="bg-red text-white p-1 rounded-full"><AlertTriangle size={16} /></div>
                                        <span>Jeopardy Gaps detected in {jeopardyGapWeeks.length} weeks.</span>
                                    </div>
                                    <p className="text-red-600/80 text-xs font-bold uppercase tracking-tight ml-9">
                                        The following weeks have zero available flexible senior coverage:
                                    </p>
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
        </div>
    );
});
