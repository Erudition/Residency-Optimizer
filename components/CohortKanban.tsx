import React, { useMemo } from 'react';
import { Users, GripHorizontal, ArrowRightLeft } from 'lucide-react';
import { Resident, PgyLevel } from '../types';
import { COHORT_COUNT } from '../constants';
import { Badge } from './ui/Badge';

interface Props {
  residents: Resident[];
  activeYear: number;
  cohortAssignments: Record<string, number>;
  onAssignCohort: (residentId: string, cohortIndex: number) => void;
}

export const CohortKanban: React.FC<Props> = ({ 
  residents, 
  activeYear, 
  cohortAssignments, 
  onAssignCohort 
}) => {
  const [dragOverCohort, setDragOverCohort] = React.useState<number | null>(null);
  const [draggedResidentId, setDraggedResidentId] = React.useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, residentId: string) => {
    setDraggedResidentId(residentId);
    e.dataTransfer.setData('text/plain', residentId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, cohortIndex: number) => {
    e.preventDefault();
    setDragOverCohort(cohortIndex);
  };

  const handleDragLeave = () => {
    setDragOverCohort(null);
  };

  const handleDragEnd = () => {
    setDragOverCohort(null);
    setDraggedResidentId(null);
  };

  const handleDrop = (e: React.DragEvent, cohortIndex: number) => {
    e.preventDefault();
    setDragOverCohort(null);
    const residentId = draggedResidentId || e.dataTransfer.getData('text/plain');
    if (residentId) {
      onAssignCohort(residentId, cohortIndex);
    }
    setDraggedResidentId(null);
  };

  const cohorts = useMemo(() => {
    const cohortsList = Array.from({ length: COHORT_COUNT }, (_, i) => ({
      index: i,
      name: `Cohort ${String.fromCharCode(65 + i)}`,
      residents: [] as Resident[],
      color: [
        'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',
        'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100',
        'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
        'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100',
        'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
      ][i % 5]
    }));

    residents.forEach(r => {
      const cohortIdx = (cohortAssignments?.[r.id]) ?? 0;
      if (cohortsList[cohortIdx]) {
        cohortsList[cohortIdx].residents.push(r);
      }
    });

    // PGY Level sorting within cohorts (Interns first as per UI standards)
    cohortsList.forEach(c => {
      c.residents.sort((a, b) => {
        const levelA = activeYear - a.startYear + 1;
        const levelB = activeYear - b.startYear + 1;
        if (levelA !== levelB) return levelA - levelB;
        return a.name.localeCompare(b.name);
      });
    });

    return cohortsList;
  }, [residents, cohortAssignments, activeYear]);

  return (
    <div className="flex flex-col h-full bg-light-1 overflow-hidden">
      {/* Kanban Header */}
      <div className="bg-white border-b border-light-5 px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue rounded-lg text-white">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">Cohort Management</h2>
            <p className="text-xs text-muted font-medium">Assign residents to 4+1 blocks for AY {activeYear}-{activeYear+1}</p>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6 flex gap-6">
        {cohorts.map(cohort => (
          <div key={cohort.index} className="w-72 flex flex-col gap-4 shrink-0">
            <div className={`p-4 rounded-2xl border border-light-4 bg-white flex items-center justify-between shadow-sm`}>
              <span className="font-black text-sm uppercase tracking-wider text-primary">{cohort.name}</span>
              <Badge variant="info" className="bg-light-1 border-light-4 text-muted px-2 py-0.5 text-xs">
                {cohort.residents.length}
              </Badge>
            </div>

            <div 
              className={`flex-1 flex flex-col gap-3 p-3 bg-light-3/20 rounded-2xl border transition-all duration-200 overflow-y-auto ${dragOverCohort === cohort.index ? 'bg-blue/5 border-blue-500/50 shadow-inner' : 'border-light-4/50'}`}
              onDragOver={(e) => handleDragOver(e, cohort.index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, cohort.index)}
            >
              {cohort.residents.map(resident => {
                const level = activeYear - resident.startYear + 1;
                const levelColors = level === 1 
                  ? 'border-l-green' 
                  : level === 2 
                    ? 'border-l-blue' 
                    : 'border-l-purple';

                return (
                  <div 
                    key={resident.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, resident.id)}
                    onDragEnd={handleDragEnd}
                    className={`group bg-white border border-light-5 border-l-4 ${levelColors} rounded-xl p-3 shadow-sm hover:shadow-md active:scale-95 active:shadow-inner transition-all cursor-grab relative`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-primary truncate w-48">{resident.name}</span>
                        <span className="text-[10px] font-bold text-muted uppercase tracking-tighter">
                          PGY-{level} • Grad {resident.startYear + 3}
                        </span>
                      </div>
                      
                      <div className="p-1.5 text-light-5 group-hover:text-muted transition-colors">
                        <GripHorizontal size={14} />
                      </div>
                    </div>
                  </div>
                );
              })}

              {cohort.residents.length === 0 && (
                <div className="flex-1 flex items-center justify-center border-2 border-dashed border-light-4/50 rounded-xl p-8 opacity-40">
                  <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Empty Lane</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
