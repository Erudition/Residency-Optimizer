import React, { useState, useRef, useMemo } from 'react';
import { Resident, ScheduleGrid, AssignmentType, CODENAMES } from '../types';
import { TOTAL_WEEKS, ASSIGNMENT_LABELS, ROTATION_METADATA, ASSIGNMENT_HEX_COLORS } from '../constants';
import { Table, Users, Info } from 'lucide-react';

interface Props {
  residents: Resident[];
  schedule: ScheduleGrid;
}

const getBaseColorStyle = (assignment: AssignmentType, count: number, max: number): React.CSSProperties => {
  if (count === 0) return { backgroundColor: '#ffffff' };

  const baseHex = ASSIGNMENT_HEX_COLORS[assignment] || '#ccc';
  // Maximum typical rotation weeks in a year is around 12, so normalize against that or the actual max
  const intensity = Math.min(1, 0.2 + (count / Math.max(1, max)) * 0.8);

  return {
    backgroundColor: baseHex,
    opacity: intensity,
    color: '#1f2937'
  };
};

export const ResidentAssignmentsStats: React.FC<Props> = React.memo(({ residents, schedule }) => {
  // Sort residents by level and cohort so the columns are beautifully grouped
  const sortedResidents = useMemo(() => {
    return [...residents].sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      const cohortA = a.cohort ?? 0;
      const cohortB = b.cohort ?? 0;
      if (cohortA !== cohortB) return cohortA - cohortB;
      return a.name.localeCompare(b.name);
    });
  }, [residents]);

  // Resizable Left Column State
  const [colWidth, setColWidth] = useState(160);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const [cellTooltip, setCellTooltip] = useState<{ x: number, y: number, residentName: string, type: string, count: number, weeks: number[] } | null>(null);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    startXRef.current = e.pageX;
    startWidthRef.current = colWidth;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const diff = e.pageX - startXRef.current;
    const newWidth = Math.max(100, Math.min(600, startWidthRef.current + diff));
    setColWidth(newWidth);
  };

  const handleMouseUp = () => {
    resizingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
  };

  // Define Row Order matching Coverage Tab
  const sortedAssignmentTypes = useMemo(() => {
    const priorityOrder = [
      'RED',
      'BLUE',
      'METRO',
      'MICU',
      'METRO_ICU',
      'Pulm',
      'NF',
      'EM',
      'CCIM',
      'NIMA (Clinic)',
      'ELECTIVE',
      'VAC',
    ];

    const allTypes = Object.values(CODENAMES);
    const remainingTypes = allTypes
      .filter(type => !priorityOrder.includes(type))
      .sort((a, b) => {
        const labelA = ASSIGNMENT_LABELS[a] || '';
        const labelB = ASSIGNMENT_LABELS[b] || '';
        return labelA.localeCompare(labelB);
      });

    return [...priorityOrder, ...remainingTypes];
  }, []);

  // Compute assign-weeks for each resident and rotation
  const assignmentCounts = useMemo(() => {
    const counts: Record<string, Record<AssignmentType, { count: number, weeks: number[] }>> = {};
    
    sortedResidents.forEach(r => {
      counts[r.id] = {} as any;
      sortedAssignmentTypes.forEach(type => {
        counts[r.id][type] = { count: 0, weeks: [] };
      });

      const resSchedule = schedule[r.id] || [];
      resSchedule.forEach((weekObj, weekIdx) => {
        const type = weekObj?.assignment;
        if (type && counts[r.id][type]) {
          counts[r.id][type].count++;
          counts[r.id][type].weeks.push(weekIdx + 1);
        }
      });
    });

    return counts;
  }, [sortedResidents, sortedAssignmentTypes, schedule]);

  // Compute maximum weeks of any rotation assigned to any single resident for normalization
  const maxWeeksAcrossResidents = useMemo(() => {
    const maxs: Record<AssignmentType, number> = {} as any;
    sortedAssignmentTypes.forEach(type => {
      let max = 0;
      sortedResidents.forEach(r => {
        const c = assignmentCounts[r.id]?.[type]?.count || 0;
        if (c > max) max = c;
      });
      maxs[type] = Math.max(1, max);
    });
    return maxs;
  }, [sortedResidents, sortedAssignmentTypes, assignmentCounts]);

  const handleCellEnter = (e: React.MouseEvent, r: Resident, type: AssignmentType) => {
    const cellData = assignmentCounts[r.id]?.[type] || { count: 0, weeks: [] };
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    
    setCellTooltip({
      x: rect.left + window.scrollX + rect.width / 2,
      y: rect.top + window.scrollY,
      residentName: r.name,
      type: ASSIGNMENT_LABELS[type],
      count: cellData.count,
      weeks: cellData.weeks
    });
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden relative">
      <div className="p-4 bg-light-1 border-b">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          Resident Rotation Totals
        </h2>
        <p className="text-sm text-muted">View annual rotation totals for each resident. Hover over cells to see exact assigned weeks.</p>
      </div>

      <div className="flex-1 overflow-auto spreadsheet-container">
        <table className="border-separate border-spacing-0 w-max">
          <thead className="sticky top-0 z-30 bg-light-1 text-xs text-muted font-semibold h-28 shadow-sm">
            <tr>
              <th
                className="sticky left-0 z-40 bg-light-1/90 backdrop-blur-md border-b border-r p-0 text-left transition-all"
                style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
              >
                <div className="flex items-center justify-between h-full px-3 py-2 relative">
                  <span className="truncate pr-2">Assignment</span>
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-2 active:bg-blue transition-colors z-50"
                    onMouseDown={startResize}
                  />
                </div>
              </th>
              {sortedResidents.map(r => (
                <th key={r.id} className="border-b border-light-5 w-8 min-w-[32px] h-28 p-0 bg-light-1 relative text-center">
                  <div className="h-full flex items-end justify-center pb-3">
                    <span
                      className="text-[11px] font-bold text-primary select-none whitespace-nowrap"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    >
                      {r.name}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-xs">
            {sortedAssignmentTypes.map(type => {
              return (
                <tr key={type} className="hover:bg-light-1">
                  <td
                    className="sticky left-0 z-20 bg-light-1/90 backdrop-blur-md border-b border-r px-3 py-1.5 font-medium text-primary whitespace-nowrap transition-all"
                    style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                  >
                    <span className="truncate">{ASSIGNMENT_LABELS[type]}</span>
                  </td>
                  {sortedResidents.map(r => {
                    const cellData = assignmentCounts[r.id]?.[type] || { count: 0, weeks: [] };
                    const count = cellData.count;
                    const style = getBaseColorStyle(type, count, maxWeeksAcrossResidents[type]);

                    return (
                      <td
                        key={r.id}
                        className="border-b text-center cursor-default relative p-0 border-light-3 w-8 min-w-[32px]"
                        onMouseEnter={(e) => handleCellEnter(e, r, type)}
                        onMouseLeave={() => setCellTooltip(null)}
                      >
                        {count > 0 ? (
                          <div className="w-full h-8 flex items-center justify-center font-black text-xs" style={style}>
                            {count}
                          </div>
                        ) : (
                          <div className="w-full h-8 bg-white" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cell Tooltip */}
      {cellTooltip && (
        <div
          className="fixed z-[200] bg-black text-white text-xs rounded-lg py-3 px-4 shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full mt-[-8px] min-w-[180px]"
          style={{ left: cellTooltip.x, top: cellTooltip.y }}
        >
          <div className="font-bold text-sm border-b border-light-9 pb-1 mb-2">
            {cellTooltip.residentName}
          </div>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-muted">Rotation:</span>
              <span className="font-semibold text-white">{cellTooltip.type}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted">Total Weeks:</span>
              <span className="font-black text-purple-2">{cellTooltip.count} weeks</span>
            </div>
            {cellTooltip.weeks.length > 0 && (
              <div className="mt-2 pt-1.5 border-t border-light-9/40">
                <div className="text-[9px] uppercase text-muted font-bold mb-1">Assigned Weeks</div>
                <div className="flex flex-wrap gap-1 max-w-[200px]">
                  {cellTooltip.weeks.map(w => (
                    <span key={w} className="bg-light-9 px-1.5 py-0.5 rounded text-[9px] font-mono">
                      Wk {w}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="absolute left-1/2 -bottom-1 w-2 h-2 bg-black transform -translate-x-1/2 rotate-45"></div>
        </div>
      )}
    </div>
  );
});
