import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Resident, ScheduleGrid, AssignmentType, ScheduleCell } from '../types';
import { TOTAL_WEEKS, ASSIGNMENT_COLORS, ASSIGNMENT_LABELS, ASSIGNMENT_ABBREVIATIONS, ASSIGNMENT_HEX_COLORS } from '../constants';
import { User, Lock, Calendar } from 'lucide-react';

interface Props {
  residents: Resident[];
  schedule: ScheduleGrid;
  startYear: number;
  cohortAssignments?: Record<string, number>;
  onCellClick: (residentId: string, week: number) => void;
  onLockWeek: (weekIdx: number) => void;
  onLockResident: (residentId: string) => void;
  onToggleLock: (residentId: string, weekIdx: number) => void;
}

const WEEKS = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1);

const getDateForWeek = (weekNum: number, startYear: number) => {
  const start = new Date(startYear, 6, 1); // July 1st of the start year
  start.setDate(start.getDate() + (weekNum - 1) * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
};

const isPastWeek = (weekNum: number, startYear: number) => {
  const weekStart = new Date(startYear, 6, 1);
  weekStart.setDate(weekStart.getDate() + weekNum * 7); // End of the week (roughly)
  return weekStart < new Date();
};

interface TooltipData {
  x: number;
  y: number;
  assignmentName: string;
  progress: string;
  peers: Resident[];
}

export const ScheduleTable: React.FC<Props> = React.memo(({
  residents,
  schedule,
  startYear,
  cohortAssignments,
  onCellClick,
  onLockWeek,
  onLockResident,
  onToggleLock
}) => {
  // Resizable Column State
  const [colWidth, setColWidth] = useState(160);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Tooltip State
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Handle Resizing
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent triggering row lock
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
    const newWidth = Math.max(80, Math.min(600, startWidthRef.current + diff));
    setColWidth(newWidth);
  };

  const handleMouseUp = () => {
    resizingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
  };

  // Tooltip Logic
  const handleMouseEnter = (e: React.MouseEvent, resident: Resident, weekIdx: number, assignment: AssignmentType) => {
    if (!assignment) return;

    // 1. Calculate Progress (Week X of Y)
    const residentSchedule = schedule[resident.id] || [];
    const totalWeeks = residentSchedule.filter(c => c && c.assignment === assignment).length;
    const currentWeekNum = residentSchedule.slice(0, weekIdx + 1).filter(c => c && c.assignment === assignment).length;

    // 2. Find Peers
    const peers = residents
      .filter(r => r.id !== resident.id && schedule[r.id]?.[weekIdx]?.assignment === assignment);

    const rect = (e.target as HTMLElement).getBoundingClientRect();

    setTooltip({
      x: rect.left + window.scrollX + rect.width / 2,
      y: rect.top + window.scrollY,
      assignmentName: ASSIGNMENT_LABELS[assignment],
      progress: `Week ${currentWeekNum} of ${totalWeeks}`,
      peers
    });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  return (
    <div className="flex flex-col h-full bg-white border rounded-lg shadow-sm overflow-hidden relative">
      <div className="overflow-auto spreadsheet-container relative flex-1">
        <table className="border-separate border-spacing-0 w-max">
          <thead className="sticky top-0 z-30 bg-light-1 text-xs uppercase text-muted font-semibold shadow-sm h-12">
            <tr>
              <th
                className="sticky left-0 z-40 p-0 border-b border-r border-light-5 text-left align-middle bg-white/80 backdrop-blur-md transition-all"
                style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
              >
                <div className="flex items-center justify-between h-full px-2 relative">
                  <span>Resident ({residents.length})</span>
                  {/* Resize Handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-2 active:bg-blue transition-colors z-50"
                    onMouseDown={startResize}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </th>
              {WEEKS.map((w, idx) => (
                <th
                  key={w}
                  onDoubleClick={() => onLockWeek(idx)}
                  className="border-b border-r border-light-5 p-1 min-w-[80px] text-center bg-light-1 cursor-pointer hover:bg-light-blue/20 transition-colors"
                  title="Double-click to toggle lock for this entire week"
                >
                  <div className="flex flex-col items-center">
                    <span>W{w}</span>
                    <span className="text-[9px] font-normal text-muted normal-case">
                      {getDateForWeek(w, startYear)}
                    </span>
                  </div>
                </th>
              ))}

            </tr>
          </thead>
          <tbody className="text-sm">
            {residents.map((resident) => {
              const residentSchedule = schedule[resident.id] || [];

              return (
                <tr key={resident.id} className="hover:bg-light-1 transition-colors">
                  <td
                    className="sticky left-0 z-20 border-b border-r border-light-5 p-2 font-medium text-black group bg-white/80 backdrop-blur-md cursor-pointer hover:bg-light-blue/20 transition-colors"
                    style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                    onDoubleClick={() => onLockResident(resident.id)}
                    title={`Double-click to toggle lock for ${resident.name}`}
                  >
                    <div className="flex flex-col truncate">
                      <span className="flex items-center gap-2 truncate" title={resident.name}>
                        {resident.name}
                      </span>
                      <span className="text-xs text-muted truncate">
                        PGY-{resident.level} • Cohort {cohortAssignments ? String.fromCharCode(65 + (cohortAssignments[resident.id] ?? 0)) : 'N/A'}
                      </span>
                    </div>
                  </td>
                  {WEEKS.map((w, idx) => {
                    const cell = residentSchedule[idx];
                    const assign = cell?.assignment;
                    const bgHex = assign ? ASSIGNMENT_HEX_COLORS[assign] : '#ffffff';
                    const isPast = isPastWeek(w, startYear);

                    return (
                      <td
                        key={`${resident.id}-${w}`}
                        className="border-b border-light-3 border-r p-1 text-center select-none relative"
                      >
                        <button
                          className={cell?.locked ? 'lemon-slot-locked' : 'lemon-slot'}
                          style={{ '--slot-bg': bgHex } as React.CSSProperties}
                          onClick={() => onCellClick(resident.id, idx)}
                          onDoubleClick={() => onToggleLock(resident.id, idx)}
                          onMouseEnter={(e) => assign && handleMouseEnter(e, resident, idx, assign)}
                          onMouseLeave={handleMouseLeave}
                          title="Click to edit, Double-click to toggle lock"
                        >
                          {assign ? (
                            <span className="truncate w-full block">
                              {ASSIGNMENT_ABBREVIATIONS[assign] || assign}
                            </span>
                          ) : (
                            <span className="text-light-5">-</span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Portal-like Tooltip */}
      {tooltip && (
        <div
          className="fixed z-[150] bg-black text-white text-xs rounded-lg py-2 px-3 shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full mt-[-8px] w-64"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-bold text-sm mb-1">{tooltip.assignmentName}</div>
          <div className="text-light-5 mb-2">{tooltip.progress}</div>

          {tooltip.peers.length > 0 && (
            <div className="border-t border-light-9 pt-2 mt-1">
              <div className="text-muted mb-1 text-[10px] uppercase font-semibold">With:</div>
              <div className="space-y-1">
                {[1, 2, 3].map(pgy => {
                  const pgyGroup = tooltip.peers.filter(r => r.level === pgy);
                  if (pgyGroup.length === 0) return null;
                  return (
                    <div key={pgy} className="flex gap-1 items-start">
                      <span className="text-[10px] text-muted font-bold w-10 shrink-0">PGY-{pgy}:</span>
                      <div className="flex flex-wrap gap-1">
                        {pgyGroup.map(r => (
                          <span key={r.id} className="bg-light-9 px-1.5 py-0.5 rounded text-[10px]">
                            {r.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Arrow */}
          <div className="absolute left-1/2 -bottom-1 w-2 h-2 bg-black transform -translate-x-1/2 rotate-45"></div>
        </div>
      )}
    </div>
  );
});
