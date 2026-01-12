
import React, { useMemo } from 'react';
import { Resident, ScheduleGrid, AssignmentType, ClinicalSetting } from '../types';
import { ROTATION_METADATA } from '../constants';
import { ShieldCheck, ShieldAlert, Clock, Building2, Hospital, Stethoscope } from 'lucide-react';

interface Props {
    residents: Resident[];
    schedule: ScheduleGrid;
}

const ProgressBar = ({ value, target, colorClass, min, max }: { value: number, target: number, colorClass: string, min?: number, max?: number }) => {
    const percentage = Math.min(100, (value / target) * 100);
    const isOverMax = max !== undefined && value > max;
    const isUnderMin = min !== undefined && value < min;
    const isViolation = isOverMax || isUnderMin;

    return (
        <div className="w-full">
            <div className="flex justify-between text-[10px] font-bold mb-1 uppercase tracking-tight">
                <span className={isViolation ? 'text-red-600' : 'text-gray-500'}>
                    {value} weeks {isViolation && '(VIOLATION)'}
                </span>
                <span className="text-gray-400">Target: {target}w</span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                <div
                    className={`h-full transition-all duration-500 ${isViolation ? 'bg-red-500' : colorClass}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
            {(min !== undefined || max !== undefined) && (
                <div className="text-[9px] text-gray-400 mt-0.5">
                    Requirement: {min || 0}-{max || '∞'} weeks total
                </div>
            )}
        </div>
    );
};

export const ACGMEAudit: React.FC<Props> = React.memo(({ residents, schedule }) => {

    const auditData = useMemo(() => {
        return residents.map(r => {
            const weeks = schedule[r.id] || [];
            let outpatient = 0;
            let inpatient = 0;
            let criticalCare = 0;
            let nightFloat = 0;

            weeks.forEach(c => {
                if (!c || !c.assignment) return;
                const meta = ROTATION_METADATA[c.assignment];
                if (!meta) return;

                if (meta.setting === ClinicalSetting.OUTPATIENT) outpatient++;
                if (meta.setting === ClinicalSetting.INPATIENT) inpatient++;
                if (meta.setting === ClinicalSetting.CRITICAL_CARE) criticalCare++;
                if (c.assignment === AssignmentType.NIGHT_FLOAT) nightFloat++;
            });

            const yearTarget = 13.3;

            return {
                ...r,
                outpatient,
                inpatient,
                criticalCare,
                nightFloat,
                outpatientProgress: (outpatient / yearTarget) * 100,
                inpatientProgress: ((inpatient + criticalCare) / yearTarget) * 100,
                critCareViolation: criticalCare > 8,
                nfViolation: nightFloat > 8
            };
        });
    }, [residents, schedule]);

    const globalStats = useMemo(() => {
        const total = auditData.length;
        return {
            outpatientMet: auditData.filter(d => d.outpatient >= 13).length,
            inpatientMet: auditData.filter(d => (d.inpatient + d.criticalCare) >= 13).length,
            critCareSafe: auditData.filter(d => !d.critCareViolation).length,
            nfSafe: auditData.filter(d => !d.nfViolation).length,
            total
        };
    }, [auditData]);

    return (
        <div className="p-6 h-full overflow-y-auto bg-gray-50 pb-64">
            <div className="max-w-7xl mx-auto space-y-6">

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Hospital size={20} /></div>
                            <div className="text-xs font-bold text-gray-500 uppercase">Outpatient Compliance</div>
                        </div>
                        <div className="text-2xl font-bold text-gray-800">{globalStats.outpatientMet} / {globalStats.total}</div>
                        <div className="text-[10px] text-gray-400 mt-1">Goal: 10 Months (~13.3w / yr)</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-green-50 rounded-lg text-green-600"><Building2 size={20} /></div>
                            <div className="text-xs font-bold text-gray-500 uppercase">Inpatient Compliance</div>
                        </div>
                        <div className="text-2xl font-bold text-gray-800">{globalStats.inpatientMet} / {globalStats.total}</div>
                        <div className="text-[10px] text-gray-400 mt-1">Goal: 10 Months (~13.3w / yr)</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><Clock size={20} /></div>
                            <div className="text-xs font-bold text-gray-500 uppercase">Crit Care Ceiling</div>
                        </div>
                        <div className="text-2xl font-bold text-gray-800">{globalStats.critCareSafe} / {globalStats.total}</div>
                        <div className="text-[10px] text-gray-400 mt-1">Goal: Max 6 Months (~8w / yr)</div>
                    </div>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-orange-50 rounded-lg text-orange-600"><ShieldCheck size={20} /></div>
                            <div className="text-xs font-bold text-gray-500 uppercase">Night Float Safe</div>
                        </div>
                        <div className="text-2xl font-bold text-gray-800">{globalStats.nfSafe} / {globalStats.total}</div>
                        <div className="text-[10px] text-gray-400 mt-1">Goal: Max 2 Months / yr</div>
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                    <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <ShieldCheck className="text-green-600" /> ACGME Graduation Requirement Audit
                        </h2>
                        <span className="text-xs text-gray-500 italic">Snapshot of single-year progress towards multi-year totals.</span>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-100 text-[10px] uppercase font-bold text-gray-600">
                            <tr>
                                <th className="px-6 py-3 sticky left-0 bg-gray-100 z-10 w-48">Resident</th>
                                <th className="px-6 py-3">Outpatient (10m)</th>
                                <th className="px-6 py-3">Inpatient (10m)</th>
                                <th className="px-6 py-3">Crit Care (2-6m)</th>
                                <th className="px-6 py-3">Night Float (Max 2m)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {auditData.map(d => (
                                <tr key={d.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium sticky left-0 bg-white z-10 border-r">
                                        <div className="flex flex-col">
                                            <span className="text-gray-900">{d.name}</span>
                                            <span className="text-[10px] text-gray-400">PGY-{d.level} • Cohort {String.fromCharCode(65 + d.cohort)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 w-1/4">
                                        <ProgressBar value={d.outpatient} target={13} colorClass="bg-blue-500" />
                                    </td>
                                    <td className="px-6 py-4 w-1/4">
                                        <ProgressBar value={d.inpatient + d.criticalCare} target={13} colorClass="bg-green-500" />
                                    </td>
                                    <td className="px-6 py-4 w-1/4">
                                        <ProgressBar value={d.criticalCare} target={2.6} colorClass="bg-purple-500" max={8} />
                                    </td>
                                    <td className="px-6 py-4 w-40 text-center">
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border ${d.nfViolation ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                                            {d.nfViolation ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
                                            {d.nightFloat} weeks
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
});
