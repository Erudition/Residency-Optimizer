
import React from 'react';
import { Resident, ScheduleGrid, AssignmentType } from '../types';
import { ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement } from '../constants';
import { CheckCircle2, XCircle, AlertCircle, ClipboardList, Info } from 'lucide-react';

interface Props {
    residents: Resident[];
    schedule: ScheduleGrid;
    precalculatedViolations?: any[];
}

export const RequirementsStats: React.FC<Props> = React.memo(({ residents, schedule, precalculatedViolations }) => {

    const getResidentCount = (resId: string, type: AssignmentType) => {
        const weeks = schedule[resId] || [];
        return weeks.filter(c => c && fulfillsRequirement(c.assignment, type)).length;
    };

    const renderGroup = (level: number) => {
        const groupResidents = residents.filter(r => r.level === level);
        const reqs = REQUIREMENTS[level];

        if (!reqs || groupResidents.length === 0) return null;

        return (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wide
              ${level === 1 ? 'bg-green-100 text-green-800' : level === 2 ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}
           `}>
                        PGY-{level}
                    </span>
                    <h3 className="text-lg font-bold text-gray-800">Requirements Status</h3>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                                <th className="text-left py-3 px-4 font-medium sticky left-0 bg-gray-50 z-10">Resident</th>
                                {reqs.map(req => (
                                    <th key={req.type} className="text-center py-3 px-2 font-medium min-w-[100px]">
                                        <div>{req.label}</div>
                                        <div className="text-[10px] font-normal text-gray-400">Target: {req.target}</div>
                                    </th>
                                ))}
                                <th className="text-center py-3 px-4 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {groupResidents.map(r => {
                                let metAll = true;

                                return (
                                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="py-3 px-4 font-medium text-gray-900 sticky left-0 bg-white z-10 border-r border-gray-100">
                                            {r.name}
                                        </td>
                                        {reqs.map(req => {
                                            const count = getResidentCount(r.id, req.type);
                                            const isMet = count >= req.target;
                                            const isOver = count > req.target;
                                            if (!isMet) metAll = false;

                                            return (
                                                <td key={req.type} className="py-2 px-2 text-center border-r border-gray-50/50">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <span className={`font-mono font-medium ${isMet ? 'text-gray-700' : 'text-red-600'}`}>
                                                            {count}
                                                        </span>
                                                        {isMet ? (
                                                            isOver ? (
                                                                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 rounded-full" title={`Exceeds target of ${req.target}`}>+{count - req.target}</span>
                                                            ) : (
                                                                <CheckCircle2 size={14} className="text-green-500 opacity-80" />
                                                            )
                                                        ) : (
                                                            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 rounded-full" title={`Needs ${req.target - count} more`}>-{req.target - count}</span>
                                                        )}
                                                    </div>
                                                </td>
                                            );
                                        })}

                                        <td className="py-2 px-4 text-center">
                                            {metAll ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                                                    <CheckCircle2 size={12} /> Met
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-100">
                                                    <AlertCircle size={12} /> Incomplete
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
        <div className="h-full overflow-y-auto bg-gray-50 p-6 pb-64">
            <div className="max-w-6xl mx-auto">
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <ClipboardList className="w-6 h-6 text-blue-600" />
                        Program Requirements Verification
                    </h2>
                    <div className="mt-2 text-gray-600 space-y-2">
                        <p>Verify that every resident meets their specific PGY-level graduation requirements.</p>
                    </div>
                </div>

                {renderGroup(1)}
                {renderGroup(2)}
                {renderGroup(3)}
            </div>
        </div>
    );
});
