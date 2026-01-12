
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Resident, ScheduleGrid, AssignmentType, ScheduleCell } from '../types';
import { TOTAL_WEEKS, ASSIGNMENT_COLORS, ASSIGNMENT_LABELS, ASSIGNMENT_ABBREVIATIONS } from '../constants';
import { User, Lock, Calendar } from 'lucide-react';

interface Props {
  residents: Resident[];
  schedule: ScheduleGrid;
  onCellClick: (residentId: string, week: number) => void;
  onLockWeek: (weekIdx: number) => void;
  onLockResident: (residentId: string) => void;
  onToggleLock: (residentId: string, weekIdx: number) => void;
}

const WEEKS = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1);

const getDateForWeek = (weekNum: number) => {
  const start = new Date(new Date().getFullYear(), 6, 1);
  start.setDate(start.getDate() + (weekNum - 1) * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.getMonth() + 1}/${start.getDate()} - ${end.getMonth() + 1}/${end.getDate()}`;
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
      <div className="overflow-auto spreadsheet-container relative flex-1 pb-64">
        <table className="border-separate border-spacing-0 w-max">
          <thead className="sticky top-0 z-30 bg-gray-50 text-xs uppercase text-gray-500 font-semibold shadow-sm h-12">
            <tr>
              <th
                className="sticky left-0 z-40 p-0 border-b border-r border-gray-200 text-left align-middle bg-white/80 backdrop-blur-md transition-all"
                style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
              >
                <div className="flex items-center justify-between h-full px-2 relative">
                  <span>Trainee</span>
                  {/* Resize Handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-50"
                    onMouseDown={startResize}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </th>
              {WEEKS.map((w, idx) => (
                <th
                  key={w}
                  className="border-b border-gray-200 p-1 min-w-[80px] text-center bg-gray-50 cursor-context-menu hover:bg-blue-50 transition-colors"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onLockWeek(idx);
                  }}
                  title="Right-click to toggle lock for this week"
                >
                  <div className="flex flex-col items-center">
                    <span>W{w}</span>
                    <span className="text-[9px] font-normal text-gray-400 normal-case">
                      {getDateForWeek(w)}
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
                <tr key={resident.id} className="hover:bg-gray-50 transition-colors">
                  <td
                    className="sticky left-0 z-20 border-b border-r border-gray-200 p-2 font-medium text-gray-900 group bg-white/80 backdrop-blur-md cursor-context-menu hover:bg-blue-50 transition-colors"
                    style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onLockResident(resident.id);
                    }}
                    title={`Right-click to toggle lock for ${resident.name}`}
                  >
                    <div className="flex flex-col truncate">
                      <span className="flex items-center gap-2 truncate" title={resident.name}>
                        {resident.name}
                      </span>
                      <span className="text-xs text-gray-400 truncate">
                        PGY-{resident.level} • Cohort {String.fromCharCode(65 + resident.cohort)}
                      </span>
                    </div>
                  </td>
                  {WEEKS.map((w, idx) => {
                    const cell = residentSchedule[idx];
                    const assign = cell?.assignment;
                    const colorClass = assign
                      ? ASSIGNMENT_COLORS[assign]
                      : 'bg-white';

                    return (
                      <td
                        key={`${resident.id}-${w}`}
                        className={`border-b border-gray-100 border-r p-1 text-center cursor-pointer select-none relative ${assign ? '' : 'hover:bg-gray-100'}`}
                        onClick={() => onCellClick(resident.id, idx)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          onToggleLock(resident.id, idx);
                        }}
                        onMouseEnter={(e) => assign && handleMouseEnter(e, resident, idx, assign)}
                        onMouseLeave={handleMouseLeave}
                        title="Left click to edit, Right click to toggle lock"
                      >
                        <div className={`
                            w-full h-10 flex items-center justify-center rounded text-xs font-medium px-1 transition-all
                            ${colorClass}
                            ${cell?.locked ? 'ring-2 ring-gray-600' : ''}
                         `}>
                          {assign ? (
                            <>
                              <span className="truncate w-full block">
                                {ASSIGNMENT_ABBREVIATIONS[assign] || assign}
                              </span>
                              {cell?.locked && <Lock size={10} className="absolute top-1 right-1 opacity-70 text-gray-700" />}
                            </>
                          ) : (
                            <>
                              <span className="text-gray-300">-</span>
                              {cell?.locked && <Lock size={10} className="absolute top-1 right-1 opacity-40 text-gray-400" />}
                            </>
                          )}
                        </div>
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
          className="fixed z-[150] bg-gray-900 text-white text-xs rounded-lg py-2 px-3 shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full mt-[-8px] w-64"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-bold text-sm mb-1">{tooltip.assignmentName}</div>
          <div className="text-gray-300 mb-2">{tooltip.progress}</div>

          {tooltip.peers.length > 0 && (
            <div className="border-t border-gray-700 pt-2 mt-1">
              <div className="text-gray-400 mb-1 text-[10px] uppercase font-semibold">With:</div>
              <div className="space-y-1">
                {[1, 2, 3].map(pgy => {
                  const pgyGroup = tooltip.peers.filter(r => r.level === pgy);
                  if (pgyGroup.length === 0) return null;
                  return (
                    <div key={pgy} className="flex gap-1 items-start">
                      <span className="text-[10px] text-gray-500 font-bold w-10 shrink-0">PGY-{pgy}:</span>
                      <div className="flex flex-wrap gap-1">
                        {pgyGroup.map(r => (
                          <span key={r.id} className="bg-gray-700 px-1.5 py-0.5 rounded text-[10px]">
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
          <div className="absolute left-1/2 -bottom-1 w-2 h-2 bg-gray-900 transform -translate-x-1/2 rotate-45"></div>
        </div>
      )}
    </div>
  );
});
