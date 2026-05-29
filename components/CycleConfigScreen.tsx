import React, { useMemo } from 'react';
import { Users, GripHorizontal, Trash2, Play } from 'lucide-react';
import { Resident } from '../types';
import { useProgramData } from '../contexts/ProgramDataContext';
import { Button } from './ui/Button';

interface Props {
  residents: Resident[];
  activeYear: number;
  cycleAssignments: Record<string, number>;
  onAssignCycle: (residentId: string, cycleIndex: number) => void;
  onPlaceClinicWeeks: () => void;
  customCycleConfig: { cohortCount: number; Y: number; Z: number };
  onChangeY: (newY: number) => void;
  onAddCycle: () => void;
  onRemoveCycle: (cycleIndex: number) => void;
  onCancel: () => void;
}

export const CycleConfigScreen: React.FC<Props> = ({ 
  residents, 
  activeYear, 
  cycleAssignments, 
  onAssignCycle,
  onPlaceClinicWeeks,
  customCycleConfig,
  onChangeY,
  onAddCycle,
  onRemoveCycle,
  onCancel,
}) => {
  const programData = useProgramData();
  const cycleCount = customCycleConfig.cohortCount;
  const Y = customCycleConfig.Y;
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
    <div className="flex flex-col h-full bg-light-1 overflow-hidden z-50 absolute inset-0">
      {/* Kanban Header */}
      <div className="bg-white border-b border-light-5 px-8 py-4 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue rounded-lg text-white">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary">New Candidate Configuration</h2>
            <p className="text-xs text-muted font-medium">Configure cycle structure before generating candidate for AY {activeYear}-{activeYear+1}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 bg-light-2 px-4 py-2 rounded-xl border border-light-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted uppercase">Clinic Weeks per Cycle (Y) =</span>
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

        <div className="flex items-center gap-3">
          <Button variant="secondary" size="md" 
            onClick={onCancel}
            className="uppercase tracking-widest text-xs font-bold"
          >
            Cancel
          </Button>
          <Button variant="primary" size="md" 
            onClick={onPlaceClinicWeeks}
            className="flex items-center gap-2.5 uppercase tracking-widest group"
          >
            <Play size={16} fill="currentColor" className="group-hover:translate-x-0.5 transition-transform" />
            <span>Place Clinic Weeks</span>
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-8">
        <div className="flex gap-6 h-full items-start min-w-max">
          {cycles.map((cycle) => (
            <div 
              key={cycle.index}
              className={`w-72 flex flex-col h-full max-h-full border-2 rounded-2xl overflow-hidden transition-all duration-200 ${cycle.color} ${dragOverCycle === cycle.index ? 'scale-105 shadow-xl ring-4 ring-blue/20 ring-offset-2' : 'shadow-sm'}`}
              onDragOver={(e) => handleDragOver(e, cycle.index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, cycle.index)}
            >
              <div className="px-4 py-3 border-b border-black/5 flex items-center justify-between shrink-0 bg-white/50 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm tracking-tight">{cycle.name}</h3>
                  <span className="text-[10px] font-black bg-black/5 px-2 py-0.5 rounded-full">
                    {cycle.residents.length}
                  </span>
                </div>
                {cycles.length > 2 && (
                  <button
                    onClick={() => onRemoveCycle(cycle.index)}
                    className="p-1.5 hover:bg-black/5 rounded-md transition-colors opacity-50 hover:opacity-100"
                    title="Remove Cycle"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 relative bg-white/30">
                {cycle.residents.map(resident => {
                  const level = activeYear - resident.startYear + 1;
                  const levelColors = level === 1 ? 'border-l-blue' :
                                      level === 2 ? 'border-l-emerald' :
                                      level === 3 ? 'border-l-purple' : 'border-l-amber';
                  
                  return (
                    <div 
                      key={resident.id} 
                      draggable
                      onDragStart={(e) => handleDragStart(e, resident.id)}
                      className={`group bg-white border border-light-5 border-l-4 ${levelColors} rounded-xl p-3 shadow-sm hover:shadow-md active:scale-95 active:shadow-inner transition-all cursor-grab relative`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-xs font-black text-primary truncate w-48">{resident.name}</span>
                          <span className="text-[10px] font-bold text-muted uppercase tracking-tighter">
                            PGY-{level}
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
                  <div className="flex-1 flex items-center justify-center border-2 border-dashed border-black/10 rounded-xl p-8 opacity-40">
                    <span className="text-[10px] font-bold text-black/50 uppercase tracking-widest">Empty Lane</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
