
import React from 'react';
import { Resident, ScheduleGrid, AssignmentType, ScheduleHistory } from '../types';
import { ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement, ACGME_TYPES, MHS_TYPES } from '../constants';
import { CheckCircle2, XCircle, AlertCircle, ClipboardList, Info } from 'lucide-react';

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

    const renderGroup = (level: number) => {
        const groupResidents = residents.filter(r => r.level === level);
        const allReqs = REQUIREMENTS[level] || [];
        const reqs = allReqs.filter(r => mode === 'acgme' ? ACGME_TYPES.includes(r.type) : MHS_TYPES.includes(r.type));

        if (reqs.length === 0 || groupResidents.length === 0) return null;

        return (
            <div className="bg-white rounded-lg shadow-sm border border-light-5 overflow-hidden mb-8">
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
            <div className="max-w-6xl mx-auto">
                <div className="bg-white p-6 rounded-lg shadow-sm border border-light-5 mb-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-xl ${mode === 'acgme' ? 'bg-blue/10 text-blue' : 'bg-purple/10 text-purple-2'}`}>
                                <ClipboardList size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-primary tracking-tight uppercase">
                                    {mode === 'acgme' ? 'ACGME Requirements' : 'MHS Specific Requirements'}
                                </h2>
                                <p className="text-muted text-sm font-medium">
                                    {mode === 'acgme' 
                                        ? 'Core specialty and multidisciplinary mandates' 
                                        : 'Program-specific curricular goals and staffing targets'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {renderGroup(1)}
                {renderGroup(2)}
                {renderGroup(3)}
            </div>
        </div>
    );
});
