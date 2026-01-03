
import React, { useMemo, useState } from 'react';
import { Resident, ScheduleGrid } from '../types';
import { ArrowUpDown, Info, Network, Users, Handshake } from 'lucide-react';
import { calculateDiversityStats } from '../services/scheduler';

interface Props {
  residents: Resident[];
  schedule: ScheduleGrid;
}

type StatRow = {
  id: string;
  name: string;
  level: number;
  uniqueCount: number;
  totalPossible: number;
  percent: number;
  maxOverlapWeeks: number;
  maxOverlapName: string;
};

export const RelationshipStats: React.FC<Props> = ({ residents, schedule }) => {
  const stats = useMemo(() => {
    const diversityScores = calculateDiversityStats(residents, schedule);
    const matrix: Record<string, Record<string, number>> = {};
    residents.forEach(r => matrix[r.id] = {});
    
    const relevantTypes = [
        'Wards-R', 'Wards-B', 'ICU', 'NF', 'EM', 'CCIM', 'Met Wards', 'Metro'
    ];

    for (let w = 0; w < 52; w++) {
      const byAssignment: Record<string, string[]> = {};
      residents.forEach(r => {
        const type = schedule[r.id]?.[w]?.assignment;
        if (type && relevantTypes.includes(type)) {
          if (!byAssignment[type]) byAssignment[type] = [];
          byAssignment[type].push(r.id);
        }
      });

      Object.values(byAssignment).forEach(group => {
        if (group.length < 2) return;
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const r1 = group[i];
            const r2 = group[j];
            matrix[r1][r2] = (matrix[r1][r2] || 0) + 1;
            matrix[r2][r1] = (matrix[r2][r1] || 0) + 1;
          }
        }
      });
    }

    const rows: StatRow[] = residents.map(r => {
      const partners = matrix[r.id];
      const partnerIds = Object.keys(partners);
      const uniqueCount = partnerIds.length;
      const totalPossible = residents.length - 1; 
      
      let maxWeeks = 0;
      let maxPartnerId = '';
      
      partnerIds.forEach(pid => {
        if (partners[pid] > maxWeeks) {
          maxWeeks = partners[pid];
          maxPartnerId = pid;
        }
      });
      
      const maxPartner = residents.find(res => res.id === maxPartnerId);

      return {
        id: r.id,
        name: r.name,
        level: r.level,
        uniqueCount,
        totalPossible,
        percent: diversityScores[r.id] || 0,
        maxOverlapWeeks: maxWeeks,
        maxOverlapName: maxPartner ? maxPartner.name : '-'
      };
    });
    
    return rows;
  }, [residents, schedule]);

  const [sortField, setSortField] = useState<keyof StatRow>('percent');
  const [sortAsc, setSortAsc] = useState(false);

  const sortedStats = useMemo(() => {
    return [...stats].sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      
      if (valA === valB && sortField === 'percent') {
          return b.maxOverlapWeeks - a.maxOverlapWeeks;
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [stats, sortField, sortAsc]);

  const handleHeaderClick = (field: keyof StatRow) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'name' ? true : false);
    }
  };

  const getDiversityColor = (pct: number) => {
    if (pct < 30) return 'text-red-900 bg-red-100 border-red-200';
    if (pct < 50) return 'text-orange-900 bg-orange-100 border-orange-200';
    return 'text-green-900 bg-green-100 border-green-200';
  };

  return (
    <div className="p-6 h-full overflow-y-auto bg-gray-50 pb-64">
       <div className="max-w-6xl mx-auto space-y-6">
         
         {/* Explanation Cards */}
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex gap-4">
                <div className="p-3 bg-blue-50 rounded-full h-fit text-blue-600">
                    <Network size={24} />
                </div>
                <div>
                    <h3 className="font-bold text-gray-800">What is Diversity %?</h3>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        It measures the percentage of unique residents this person has shared a team with. 
                        <strong> Goal: 50% or higher.</strong> High diversity ensures cross-cohort collaboration and prevents team isolation.
                    </p>
                </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex gap-4">
                <div className="p-3 bg-orange-50 rounded-full h-fit text-orange-600">
                    <Handshake size={24} />
                </div>
                <div>
                    <h3 className="font-bold text-gray-800">What is Max Overlap?</h3>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                        Tracks the partner someone works with most frequently. 
                        <strong> Goal: Under 10 weeks.</strong> Excessive overlap with one person can limit exposure to different clinical styles and feedback.
                    </p>
                </div>
            </div>
         </div>

         <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h2 className="text-lg font-bold text-gray-800">Co-Working Diversity Report</h2>
            </div>
            <table className="w-full text-sm text-left border-collapse">
            <thead className="text-xs text-gray-500 uppercase bg-gray-100 border-b sticky top-0 z-10">
                <tr>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-200" onClick={() => handleHeaderClick('name')}>
                    <div className="flex items-center gap-1">Resident <ArrowUpDown size={12}/></div>
                </th>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-200 text-center" onClick={() => handleHeaderClick('uniqueCount')}>
                    <div className="flex items-center gap-1 justify-center">Unique Co-workers <ArrowUpDown size={12}/></div>
                </th>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-200" onClick={() => handleHeaderClick('percent')}>
                    <div className="flex items-center gap-1">Diversity % <ArrowUpDown size={12}/></div>
                </th>
                <th className="px-6 py-3 cursor-pointer hover:bg-gray-200" onClick={() => handleHeaderClick('maxOverlapWeeks')}>
                    <div className="flex items-center gap-1">Most Frequent Partner <ArrowUpDown size={12}/></div>
                </th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {sortedStats.map(row => (
                <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900 border-r border-gray-50">
                        <div>{row.name}</div>
                        <div className="text-xs text-gray-400">PGY-{row.level}</div>
                    </td>
                    <td className="px-6 py-4 text-center border-r border-gray-50">
                        <span className="font-bold text-base text-gray-900">{row.uniqueCount}</span>
                        <span className="text-gray-500 text-xs ml-1">/ {row.totalPossible}</span>
                    </td>
                    <td className="px-6 py-4 border-r border-gray-50">
                        <span className={`px-2 py-1 rounded text-xs font-bold border ${getDiversityColor(row.percent)}`}>
                        {row.percent.toFixed(1)}%
                        </span>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{row.maxOverlapName}</span>
                        <span className={`text-xs ${row.maxOverlapWeeks > 8 ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                            {row.maxOverlapWeeks} weeks together
                        </span>
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
};
