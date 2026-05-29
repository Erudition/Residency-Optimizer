import React, { useMemo } from 'react';
import { Users, GripHorizontal, Trash2 } from 'lucide-react';
import { Resident } from '../types';
import { useProgramData } from '../contexts/ProgramDataContext';
import { Badge } from './ui/Badge';

interface Props {
  residents: Resident[];
  activeYear: number;
  cycleAssignments: Record<string, number>;
  onAssignCycle: (residentId: string, cycleIndex: number) => void;
  onPlaceClinicWeeks?: () => void;
  hasPlacedClinicWeeks?: boolean;
  customCycleConfig?: { cohortCount: number; Y: number; Z: number };
  onChangeY?: (newY: number) => void;
  onAddCycle?: () => void;
  onRemoveCycle?: (cycleIndex: number) => void;
}

export const CycleKanban: React.FC<Props> = ({ 
  residents, 
  activeYear, 
  cycleAssignments, 
  onAssignCycle,
  onPlaceClinicWeeks,
  hasPlacedClinicWeeks,
  customCycleConfig,
  onChangeY,
  onAddCycle,
  onRemoveCycle
}) => {
  const programData = useProgramData();
  const cycleConfigToUse = customCycleConfig || programData.cycleConfig;
  const cycleCount = cycleConfigToUse.cohortCount;
  const Y = cycleConfigToUse.Y;
  const [dragOverCycle, setDragOverCycle] = React.useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, residentId: string) => {
    e.dataTransfer.setData('residentId', residentId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, cycleIndex: number) => {
    e.preventDefault();
    setDragOverCycle(cycleIndex);
  };

  const handleDragLeave = () => {
    setDragOverCycle(null);
  };

  const handleDrop = (e: React.DragEvent, cycleIndex: number) => {
    e.preventDefault();
    setDragOverCycle(null);
    if (hasPlacedClinicWeeks) return; // In swap mode, dropping on the column does nothing

    const residentId = e.dataTransfer.getData('residentId');
    if (residentId) {
      onAssignCycle(residentId, cycleIndex);
    }
  };

  const cycles = useMemo(() => {
    const cyclesList = Array.from({ length: cycleCount }, (_, i) => ({
      index: i,
      name: `Cycle ${i + 1}`,
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
      const cycleIdx = (cycleAssignments?.[r.id]) ?? 0;
      if (cyclesList[cycleIdx]) {
        cyclesList[cycleIdx].residents.push(r);
      }
    });

    // PGY Level sorting within cycles (Interns first as per UI standards)
    cyclesList.forEach(c => {
      c.residents.sort((a, b) => {
        const levelA = activeYear - a.startYear + 1;
        const levelB = activeYear - b.startYear + 1;
        if (levelA !== levelB) return levelA - levelB;
        return a.name.localeCompare(b.name);
      });
    });

    return cyclesList;
  }, [residents, cycleAssignments, activeYear, cycleCount]);

  return (
    <div className="flex flex-col h-full bg-light-1 overflow-hidden">
      {/* Kanban Header */}
      <div className="bg-white border-b border-light-5 px-8 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue rounded-lg text-white">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">Clinic Cycle Management</h2>
            <p className="text-xs text-muted font-medium">Assign residents to clinic cycles for AY {activeYear}-{activeYear+1}</p>
          </div>
        </div>
        
        {!hasPlacedClinicWeeks && onChangeY && onAddCycle && (
          <div className="flex items-center gap-4 bg-light-2 px-4 py-2 rounded-xl border border-light-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted uppercase">Weeks per cycle (Y) =</span>
              <select 
                value={Y}
                onChange={(e) => onChangeY(parseInt(e.target.value))}
                className="text-xs p-1 rounded border border-light-4 bg-white outline-none font-bold text-primary"
              >
                <option value={1}>1 Week</option>
                <option value={2}>2 Weeks</option>
                <option value={3}>3 Weeks</option>
                <option value={4}>4 Weeks</option>
              </select>
            </div>
            <button 
              onClick={onAddCycle}
              className="px-3 py-1 bg-white border border-light-4 rounded-lg text-xs font-bold shadow-sm hover:bg-light-1 text-primary transition-colors"
            >
              + Add Cycle
            </button>
          </div>
        )}

        {onPlaceClinicWeeks && !hasPlacedClinicWeeks && (
          <button 
            onClick={onPlaceClinicWeeks}
            className="flex items-center gap-2 px-4 py-2 bg-blue text-white rounded-lg text-sm font-bold shadow hover:bg-blue-dark transition-all"
          >
            Place Clinic Weeks
          </button>
        )}
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6 flex gap-6">
        {cycles.map(cycle => (
          <div key={cycle.index} className="w-72 flex flex-col gap-4 shrink-0">
            <div className={`p-4 rounded-2xl border border-light-4 bg-white flex items-center justify-between shadow-sm`}>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm uppercase tracking-wider text-primary">{cycle.name}</span>
                <Badge variant="info" className="bg-light-1 border-light-4 text-muted px-2 py-0.5 text-xs">
                  {cycle.residents.length}
                </Badge>
              </div>
              {!hasPlacedClinicWeeks && onRemoveCycle && cycleCount > Y * 2 && (
                <button 
                  onClick={() => onRemoveCycle(cycle.index)}
                  className="p-1 text-light-5 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                  title="Remove Cycle"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <div 
              className={`flex-1 flex flex-col gap-3 p-3 bg-light-3/20 rounded-2xl border transition-all duration-200 overflow-y-auto ${dragOverCycle === cycle.index ? 'bg-blue/5 border-blue-500/50 shadow-inner' : 'border-light-4/50'}`}
              onDragOver={(e) => handleDragOver(e, cycle.index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, cycle.index)}
            >
              {cycle.residents.map(resident => {
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
                    onDragOver={(e) => {
                      if (hasPlacedClinicWeeks) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    onDrop={(e) => {
                      if (hasPlacedClinicWeeks) {
                        e.preventDefault();
                        e.stopPropagation();
                        const sourceId = e.dataTransfer.getData('residentId');
                        const sourceResident = residents.find(r => r.id === sourceId);
                        const targetLevel = level;
                        const sourceLevel = sourceResident ? activeYear - sourceResident.startYear + 1 : -1;
                        
                        if (sourceId && sourceId !== resident.id && sourceLevel === targetLevel) {
                          const sourceCycle = cycleAssignments?.[sourceId] ?? 0;
                          const targetCycle = cycle.index;
                          onAssignCycle(sourceId, targetCycle);
                          onAssignCycle(resident.id, sourceCycle);
                        }
                      }
                    }}
                    className={`group bg-white border border-light-5 border-l-4 ${levelColors} rounded-xl p-3 shadow-sm hover:shadow-md active:scale-95 active:shadow-inner transition-all cursor-grab relative`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-primary truncate w-48">{resident.name}</span>
                        <span className="text-[10px] font-bold text-muted uppercase tracking-tighter">
                          PGY-{level} • Cycle {cycle.index + 1}
                        </span>
                      </div>
                      
                      <div className="p-1.5 text-light-5 group-hover:text-muted transition-colors">
                        <GripHorizontal size={14} />
                      </div>
                    </div>
                  </div>
                );
              })}

              {cycle.residents.length === 0 && (
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
