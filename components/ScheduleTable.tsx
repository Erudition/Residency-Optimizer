import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Resident, ScheduleGrid, AssignmentType, ScheduleCell, SelectionRange } from '../types';
import { TOTAL_WEEKS } from '../constants';
import { useProgramData } from '../contexts/ProgramDataContext';
import { getAssignmentColor } from '../utils/colorUtils';
import { User, Lock, Calendar, Sparkles, AlertTriangle } from 'lucide-react';
import { RequirementsEngine } from '../services/requirementsEngine';

interface Props {
  residents: Resident[];
  schedule: ScheduleGrid;
  startYear: number;
  cycleAssignments?: Record<string, number>;
  isReadOnly?: boolean;

  selection: SelectionRange | null;
  onSelectionChange: (sel: SelectionRange | null) => void;
  swapSourceSelection?: SelectionRange | null;

  onCellClick: (residentId: string, week: number, rect?: DOMRect) => void;
  onLockWeek: (weekIdx: number) => void;
  onLockResident: (residentId: string) => void;
  onToggleLock: (residentId: string, weekIdx: number) => void;
  
  cellPadding?: 'comfortable' | 'minimal' | 'none';
  rowHeight?: '1' | '2' | '3';
}

// WEEKS will be derived from the schedule length

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
  weekIdx: number;
  progress: string;
  peers: Resident[];
  anchorRect?: DOMRect;
}

export const ScheduleTable: React.FC<Props> = React.memo(({
  residents,
  schedule,
  startYear,
  cycleAssignments,
  isReadOnly = false,

  selection,
  onSelectionChange,
  swapSourceSelection = null,

  onCellClick,
  onLockWeek,
  onLockResident,
  onToggleLock,
  cellPadding = 'comfortable',
  rowHeight = '3'
}) => {
  const programData = useProgramData();
  const totalWeeks = useMemo(() => {
    const vals = Object.values(schedule);
    return vals.length > 0 ? (vals[0] as any).length : TOTAL_WEEKS;
  }, [schedule]);
  
  const WEEKS = useMemo(() => Array.from({ length: totalWeeks }, (_, i) => i + 1), [totalWeeks]);

  const jeopardyGaps = useMemo(() => {
    const gaps = new Map<number, {
      pgy2FlexibleCount: number;
      pgy3FlexibleCount: number;
      pgy2FlexibleNames: string[];
      pgy3FlexibleNames: string[];
    }>();
    if (!startYear || residents.length === 0) return gaps;

    for (let w = 0; w < totalWeeks; w++) {
      let pgy2FlexibleCount = 0;
      let pgy3FlexibleCount = 0;
      const pgy2FlexibleNames: string[] = [];
      const pgy3FlexibleNames: string[] = [];

      residents.forEach(res => {
        const currentYear = startYear + Math.floor(w / 52);
        const pgy = currentYear - res.startYear + 1;
        const cell = schedule[res.id]?.[w];
        if (!cell || !cell.assignment) return;

        if (RequirementsEngine.isJeopardyBlock(cell.assignment, programData)) {
          if (pgy === 2) {
            pgy2FlexibleCount++;
            pgy2FlexibleNames.push(res.name);
          }
          if (pgy === 3) {
            pgy3FlexibleCount++;
            pgy3FlexibleNames.push(res.name);
          }
        }
      });

      if (pgy2FlexibleCount === 0 || pgy3FlexibleCount === 0) {
        gaps.set(w, {
          pgy2FlexibleCount,
          pgy3FlexibleCount,
          pgy2FlexibleNames,
          pgy3FlexibleNames
        });
      }
    }
    return gaps;
  }, [residents, schedule, startYear, totalWeeks, programData]);

  // Resizable Column State
  const [colWidth, setColWidth] = useState(160);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const clickTimeoutRef = useRef<Record<string, number>>({});
  const hoverTimeoutRef = useRef<number | null>(null);
  const tooltipLeaveTimeoutRef = useRef<number | null>(null);
  const isTooltipVisibleRef = useRef(false);

  useEffect(() => {
    return () => {
      Object.values(clickTimeoutRef.current).forEach(clearTimeout);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (tooltipLeaveTimeoutRef.current) clearTimeout(tooltipLeaveTimeoutRef.current);
    };
  }, []);

  // Multi-selection drag states
  const [localSelection, setLocalSelection] = useState<SelectionRange | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const dragStartRef = useRef<{ residentId: string; weekIdx: number } | null>(null);
  const isDraggingRef = useRef(false);

  const dragModeRef = useRef<'cell' | 'col' | 'row'>('cell');

  // Multi-selection handlers
  const handleCellMouseDown = (e: React.MouseEvent, residentId: string, weekIdx: number) => {
    if (isReadOnly || e.button !== 0) return; // Left click only
    setIsSelecting(true);
    isDraggingRef.current = false;
    dragModeRef.current = 'cell';
    dragStartRef.current = { residentId, weekIdx };
    
    const initialSel: SelectionRange = {
      startResidentId: residentId,
      startWeekIdx: weekIdx,
      endResidentId: residentId,
      endWeekIdx: weekIdx
    };
    setLocalSelection(initialSel);
  };

  const handleColHeaderMouseDown = (e: React.MouseEvent, weekIdx: number) => {
    if (isReadOnly || e.button !== 0 || !residents.length) return;
    setIsSelecting(true);
    isDraggingRef.current = false;
    dragModeRef.current = 'col';
    dragStartRef.current = { residentId: '', weekIdx };
    
    setLocalSelection({
      startResidentId: residents[0].id,
      startWeekIdx: weekIdx,
      endResidentId: residents[residents.length - 1].id,
      endWeekIdx: weekIdx
    });
  };

  const handleRowHeaderMouseDown = (e: React.MouseEvent, residentId: string) => {
    if (isReadOnly || e.button !== 0 || !residents.length) return;
    setIsSelecting(true);
    isDraggingRef.current = false;
    dragModeRef.current = 'row';
    dragStartRef.current = { residentId, weekIdx: -1 };
    
    setLocalSelection({
      startResidentId: residentId,
      startWeekIdx: 0,
      endResidentId: residentId,
      endWeekIdx: WEEKS.length - 1
    });
  };

  const handleMouseEnterDrag = (residentId?: string, weekIdx?: number) => {
    if (!isSelecting || !dragStartRef.current) return;
    
    if (dragModeRef.current === 'cell') {
      if (!residentId || weekIdx === undefined) return;
      if (residentId !== dragStartRef.current.residentId || weekIdx !== dragStartRef.current.weekIdx) {
        isDraggingRef.current = true;
      }
      setLocalSelection({
        startResidentId: dragStartRef.current.residentId,
        startWeekIdx: dragStartRef.current.weekIdx,
        endResidentId: residentId,
        endWeekIdx: weekIdx
      });
    } else if (dragModeRef.current === 'col') {
      if (weekIdx === undefined) return;
      if (weekIdx !== dragStartRef.current.weekIdx) isDraggingRef.current = true;
      setLocalSelection({
        startResidentId: residents[0].id,
        startWeekIdx: dragStartRef.current.weekIdx,
        endResidentId: residents[residents.length - 1].id,
        endWeekIdx: weekIdx
      });
    } else if (dragModeRef.current === 'row') {
      if (!residentId) return;
      if (residentId !== dragStartRef.current.residentId) isDraggingRef.current = true;
      setLocalSelection({
        startResidentId: dragStartRef.current.residentId,
        startWeekIdx: 0,
        endResidentId: residentId,
        endWeekIdx: WEEKS.length - 1
      });
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (!isSelecting) return;
      setIsSelecting(false);

      if (localSelection) {
        const startRowIdx = residents.findIndex(r => r.id === localSelection.startResidentId);
        const endRowIdx = residents.findIndex(r => r.id === localSelection.endResidentId);
        const minRow = Math.min(startRowIdx, endRowIdx);
        const maxRow = Math.max(startRowIdx, endRowIdx);
        const minCol = Math.min(localSelection.startWeekIdx, localSelection.endWeekIdx);
        const maxCol = Math.max(localSelection.startWeekIdx, localSelection.endWeekIdx);

        if (minRow === maxRow && minCol === maxCol && !isDraggingRef.current) {
          onSelectionChange(null);
          const cell = schedule[localSelection.startResidentId]?.[localSelection.startWeekIdx];
          
          const weekNum = localSelection.startWeekIdx + 1;
          const weekIsPast = isReadOnly || isPastWeek(weekNum, startYear);
          const assign = cell?.assignment;
          const isEditable = !assign || programData.placeholderCodenames.has(assign);
          const isPast = isEditable ? false : weekIsPast;

          const target = e.target as HTMLElement;
          const buttonElement = target.closest('button');
          const rect = buttonElement?.getBoundingClientRect() || target?.getBoundingClientRect?.();

          handleCellClick(
            localSelection.startResidentId,
            localSelection.startWeekIdx,
            !!cell?.locked,
            isPast,
            rect
          );
        } else {
          onSelectionChange(localSelection);
        }
      }
      dragStartRef.current = null;
    };

    if (isSelecting) {
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isSelecting, localSelection, residents, schedule, isReadOnly, startYear, programData]);

  // Only show the active drag selection outline on mouse up (when done selecting)
  // to avoid crawling border during the drag operation itself.
  const activeSelection = isSelecting ? null : selection;

  const selectionBounds = useMemo(() => {
    if (!activeSelection) return null;
    
    const startRowIdx = residents.findIndex(r => r.id === activeSelection.startResidentId);
    const endRowIdx = residents.findIndex(r => r.id === activeSelection.endResidentId);
    if (startRowIdx === -1 || endRowIdx === -1) return null;

    return {
      minRow: Math.min(startRowIdx, endRowIdx),
      maxRow: Math.max(startRowIdx, endRowIdx),
      minCol: Math.min(activeSelection.startWeekIdx, activeSelection.endWeekIdx),
      maxCol: Math.max(activeSelection.startWeekIdx, activeSelection.endWeekIdx),
    };
  }, [activeSelection, residents]);

  const dragSelectionBounds = useMemo(() => {
    if (!isSelecting || !localSelection || !isDraggingRef.current) return null;
    
    const startRowIdx = residents.findIndex(r => r.id === localSelection.startResidentId);
    const endRowIdx = residents.findIndex(r => r.id === localSelection.endResidentId);
    if (startRowIdx === -1 || endRowIdx === -1) return null;

    return {
      minRow: Math.min(startRowIdx, endRowIdx),
      maxRow: Math.max(startRowIdx, endRowIdx),
      minCol: Math.min(localSelection.startWeekIdx, localSelection.endWeekIdx),
      maxCol: Math.max(localSelection.startWeekIdx, localSelection.endWeekIdx),
    };
  }, [isSelecting, localSelection, residents]);

  const swapSourceSelectionBounds = useMemo(() => {
    if (!swapSourceSelection) return null;
    
    const startRowIdx = residents.findIndex(r => r.id === swapSourceSelection.startResidentId);
    const endRowIdx = residents.findIndex(r => r.id === swapSourceSelection.endResidentId);
    if (startRowIdx === -1 || endRowIdx === -1) return null;

    return {
      minRow: Math.min(startRowIdx, endRowIdx),
      maxRow: Math.max(startRowIdx, endRowIdx),
      minCol: Math.min(swapSourceSelection.startWeekIdx, swapSourceSelection.endWeekIdx),
      maxCol: Math.max(swapSourceSelection.startWeekIdx, swapSourceSelection.endWeekIdx),
    };
  }, [swapSourceSelection, residents]);

  const handleCellClick = (residentId: string, weekIdx: number, isLocked: boolean, isPast: boolean, rect?: DOMRect) => {
    const key = `${residentId}-${weekIdx}`;
    if (clickTimeoutRef.current[key]) {
      clearTimeout(clickTimeoutRef.current[key]);
      delete clickTimeoutRef.current[key];
      
      // Allow toggle lock if it's not past
      if (!isPast) {
        onToggleLock(residentId, weekIdx);
      }
    } else {
      clickTimeoutRef.current[key] = window.setTimeout(() => {
        // Allow edit if not locked AND not past
        if (!isLocked && !isPast) {
          onCellClick(residentId, weekIdx, rect);
        }
        delete clickTimeoutRef.current[key];
      }, 280);
    }
  };

  // Tooltip State
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);

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
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    if (tooltipLeaveTimeoutRef.current) {
      clearTimeout(tooltipLeaveTimeoutRef.current);
      tooltipLeaveTimeoutRef.current = null;
    }

    if (!assignment) {
      setIsTooltipVisible(false);
      tooltipLeaveTimeoutRef.current = window.setTimeout(() => {
        setTooltip(null);
        isTooltipVisibleRef.current = false;
      }, 150);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    const updateTooltip = () => {
      const residentSchedule = schedule[resident.id] || [];
      const totalWeeks = residentSchedule.filter(c => c && c.assignment === assignment).length;
      const currentWeekNum = residentSchedule.slice(0, weekIdx + 1).filter(c => c && c.assignment === assignment).length;

      const peers = residents
        .filter(r => r.id !== resident.id && schedule[r.id]?.[weekIdx]?.assignment === assignment);

      setTooltip({
        x: rect.left + window.scrollX + rect.width / 2,
        y: rect.top + window.scrollY,
        assignmentName: (programData.rotations.get(assignment)?.label || assignment),

        weekIdx: weekIdx,
        peers,
        anchorRect: rect
      });
      setIsTooltipVisible(true);
      isTooltipVisibleRef.current = true;
    };

    if (isTooltipVisibleRef.current) {
      updateTooltip();
    } else {
      hoverTimeoutRef.current = window.setTimeout(updateTooltip, 150);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (tooltipLeaveTimeoutRef.current) {
      clearTimeout(tooltipLeaveTimeoutRef.current);
    }
    tooltipLeaveTimeoutRef.current = window.setTimeout(() => {
      setIsTooltipVisible(false);
      tooltipLeaveTimeoutRef.current = window.setTimeout(() => {
        setTooltip(null);
        isTooltipVisibleRef.current = false;
      }, 150);
    }, 50);
  };

  let left = 0;
  let top = 0;
  let arrowLeft = 0;
  const tooltipWidth = 420;

  if (tooltip && tooltip.anchorRect) {
    left = tooltip.anchorRect.left;
    top = tooltip.anchorRect.top - 8;

    if (left + tooltipWidth > window.innerWidth - 16) {
      left = window.innerWidth - tooltipWidth - 16;
    }
    if (left < 16) {
      left = 16;
    }

    const slotCenterX = tooltip.anchorRect.left + tooltip.anchorRect.width / 2;
    arrowLeft = slotCenterX - left;
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden relative">
      <div className="overflow-auto spreadsheet-container relative flex-1">
        <table className="border-separate border-spacing-0 w-max">
          <thead className="sticky top-0 z-30 bg-light-1 text-xs uppercase text-muted font-semibold shadow-sm h-12">
            <tr>
              <th
                className="sticky left-0 z-40 p-0 text-left align-middle bg-white/80 backdrop-blur-md transition-all"
                style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
              >
                <div className="flex items-center justify-between h-full px-2 relative">
                  <div className="flex items-center gap-2">
                    <span>Resident ({residents.length})</span>
                  </div>
                  {/* Resize Handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-2 active:bg-blue transition-colors z-50"
                    onMouseDown={startResize}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </th>
              {WEEKS.map((w, idx) => {
                const deficitInfo = jeopardyGaps.get(idx);
                const hasDeficit = !!deficitInfo;
                return (
                  <th
                    key={w}
                    onMouseDown={(e) => handleColHeaderMouseDown(e, idx)}
                    onMouseEnter={() => handleMouseEnterDrag(undefined, idx)}
                    onDoubleClick={() => !isReadOnly && onLockWeek(idx)}
                    className={`p-1 min-w-[80px] text-center bg-light-1 select-none transition-colors relative ${isReadOnly ? 'cursor-default' : 'cursor-pointer hover:bg-light-blue/20'}`}
                    style={(idx === 51 || idx === 103) ? { borderRight: '3px solid #1e293b' } : undefined}
                    title={
                      deficitInfo
                        ? `⚠️ Senior Jeopardy Deficit (Week ${w})\nLacks minimum senior backup coverage.\nRequired: At least 1 PGY-2 AND 1 PGY-3 senior backup on flexible/jeopardy service.\n\nActive Senior Coverage:\n- PGY-2 Seniors on Backup: ${deficitInfo.pgy2FlexibleCount} (${deficitInfo.pgy2FlexibleNames.join(', ') || 'None'})\n- PGY-3 Seniors on Backup: ${deficitInfo.pgy3FlexibleCount} (${deficitInfo.pgy3FlexibleNames.join(', ') || 'None'})`
                        : isReadOnly ? undefined : "Double-click to toggle lock for this entire week"
                    }
                  >
                    <div className="flex flex-col items-center justify-center relative">
                      <span className="flex items-center gap-1 font-bold">
                        W{w}
                        {hasDeficit && <AlertTriangle size={10} className="text-orange" />}
                      </span>
                      <span className="text-[9px] font-normal text-muted normal-case">
                        {getDateForWeek(w, startYear)}
                      </span>
                    </div>
                  </th>
                );
              })}

            </tr>
          </thead>
          <tbody className="text-sm">
            {residents.map((resident, rowIdx) => {
              const residentSchedule = schedule[resident.id] || [];

              return (
                <tr key={resident.id} className="hover:bg-light-1 transition-colors">
                  <td
                    className={`sticky left-0 z-20 font-medium text-black select-none group bg-white/80 backdrop-blur-md transition-colors ${isReadOnly ? 'cursor-default' : 'cursor-pointer hover:bg-light-blue/20'}`}
                    style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                    onMouseDown={(e) => handleRowHeaderMouseDown(e, resident.id)}
                    onMouseEnter={() => handleMouseEnterDrag(resident.id, undefined)}
                    onDoubleClick={() => !isReadOnly && onLockResident(resident.id)}
                    title={isReadOnly ? undefined : `Double-click to toggle lock for ${resident.name}`}
                  >
                    <div className="flex flex-col truncate justify-center">
                      <span className="flex items-center gap-2 truncate" title={resident.name}>
                        {resident.name}
                      </span>
                    </div>
                  </td>
                  {WEEKS.map((w, idx) => {
                    const cell = residentSchedule[idx];
                    const assign = cell?.assignment;
                    const weekIsPast = isReadOnly || isPastWeek(w, startYear);
                    const rotation = assign ? programData.rotations.get(assign) : undefined;
                    // Null (unassigned) and placeholder slots remain editable
                    // even in past weeks, so admins can resolve them retroactively.
                    const isEditable = !assign || programData.placeholderCodenames.has(assign);
                    const isPast = isEditable ? false : weekIsPast;
                    const intensity = rotation?.intensity ?? 1;
                    const bgHex = assign ? getAssignmentColor(rotation?.color || 0, intensity, !!cell?.locked) : '#ffffff';

                    // Compute active bounds from startYear (always available),
                    // not the transient activeWeekStart/activeWeekEnd properties
                    const isUnified = totalWeeks > 52;
                    let activeStart: number;
                    let activeEnd: number;
                    if (isUnified) {
                      activeStart = Math.max(0, (resident.startYear - startYear) * 52);
                      activeEnd = Math.min(totalWeeks, (resident.startYear + 3 - startYear) * 52);
                    } else {
                      // Single-year: resident is fully in-bounds only if this year
                      // falls within their 3-year residency
                      const resFirstYear = resident.startYear;
                      const resLastYear = resident.startYear + 2;
                      // startYear here is the academic year of this single-year grid
                      if (startYear < resFirstYear || startYear > resLastYear) {
                        activeStart = 0;
                        activeEnd = 0;
                      } else {
                        activeStart = 0;
                        activeEnd = 52;
                      }
                    }
                    const isOutOfBounds = idx < activeStart || idx >= activeEnd;

                    const isCellSelected = selectionBounds &&
                      rowIdx >= selectionBounds.minRow &&
                      rowIdx <= selectionBounds.maxRow &&
                      idx >= selectionBounds.minCol &&
                      idx <= selectionBounds.maxCol;

                    const isTopBorder = isCellSelected && rowIdx === selectionBounds!.minRow;
                    const isBottomBorder = isCellSelected && rowIdx === selectionBounds!.maxRow;
                    const isLeftBorder = isCellSelected && idx === selectionBounds!.minCol;
                    const isRightBorder = isCellSelected && idx === selectionBounds!.maxCol;

                    const isCellSwapSource = swapSourceSelectionBounds &&
                      rowIdx >= swapSourceSelectionBounds.minRow &&
                      rowIdx <= swapSourceSelectionBounds.maxRow &&
                      idx >= swapSourceSelectionBounds.minCol &&
                      idx <= swapSourceSelectionBounds.maxCol;

                    const isSwapTopBorder = isCellSwapSource && rowIdx === swapSourceSelectionBounds!.minRow;
                    const isSwapBottomBorder = isCellSwapSource && rowIdx === swapSourceSelectionBounds!.maxRow;
                    const isSwapLeftBorder = isCellSwapSource && idx === swapSourceSelectionBounds!.minCol;
                    const isSwapRightBorder = isCellSwapSource && idx === swapSourceSelectionBounds!.maxCol;

                    const isCellDragged = dragSelectionBounds &&
                      rowIdx >= dragSelectionBounds.minRow &&
                      rowIdx <= dragSelectionBounds.maxRow &&
                      idx >= dragSelectionBounds.minCol &&
                      idx <= dragSelectionBounds.maxCol;

                    const paddingClass = cellPadding === 'none' ? 'p-0' : cellPadding === 'minimal' ? 'p-[1px]' : 'p-1';
                    const heightClass = rowHeight === '3' ? 'h-12' : rowHeight === '2' ? 'h-8' : 'h-[1px]';

                    return (
                      <td
                        key={`${resident.id}-${w}`}
                        className={`${paddingClass} text-center select-none relative ${heightClass}`}
                        style={(idx === 51 || idx === 103) ? { borderRight: '3px solid #1e293b' } : undefined}
                      >
                        {isCellSelected && (
                          <div className="absolute inset-0 pointer-events-none z-20">
                            {isTopBorder && <div className="absolute top-0 left-0 right-0 h-[2px] marching-ants-x" />}
                            {isBottomBorder && <div className="absolute bottom-0 left-0 right-0 h-[2px] marching-ants-x" style={{ animationDirection: 'reverse' }} />}
                            {isLeftBorder && <div className="absolute top-0 bottom-0 left-0 w-[2px] marching-ants-y" />}
                            {isRightBorder && <div className="absolute top-0 bottom-0 right-0 w-[2px] marching-ants-y" style={{ animationDirection: 'reverse' }} />}
                          </div>
                        )}
                        {isCellSwapSource && (
                          <div className="absolute inset-0 pointer-events-none z-20">
                            {isSwapTopBorder && <div className="absolute top-0 left-0 right-0 h-[2px] marching-ants-green-x" />}
                            {isSwapBottomBorder && <div className="absolute bottom-0 left-0 right-0 h-[2px] marching-ants-green-x" style={{ animationDirection: 'reverse' }} />}
                            {isSwapLeftBorder && <div className="absolute top-0 bottom-0 left-0 w-[2px] marching-ants-green-y" />}
                            {isSwapRightBorder && <div className="absolute top-0 bottom-0 right-0 w-[2px] marching-ants-green-y" style={{ animationDirection: 'reverse' }} />}
                          </div>
                        )}
                        <button
                          className={`h-full ${isOutOfBounds ? 'lemon-slot-locked' : (cell?.locked ? 'lemon-slot-locked' : 'lemon-slot')} ${(isCellDragged || isCellSelected) ? 'is-pressed' : ''}`}
                          style={{ '--slot-bg': isOutOfBounds ? '#f1f5f9' : bgHex } as React.CSSProperties}
                          onMouseDown={(e) => {
                            if (isOutOfBounds) return;
                            handleCellMouseDown(e, resident.id, idx);
                          }}
                          onMouseEnter={(e) => {
                            if (isOutOfBounds) return;
                            if (isSelecting) {
                              handleMouseEnterDrag(resident.id, idx);
                            } else if (assign) {
                              handleMouseEnter(e, resident, idx, assign);
                            }
                          }}
                          onMouseLeave={handleMouseLeave}
                          title={isOutOfBounds ? "Outside residency period" : (isEditable ? "Click to resolve" : (isReadOnly ? "Historical block (Locked)" : (isPast ? "Past block (Locked)" : "Click and drag to select, Double-click to toggle lock")))}
                          disabled={isOutOfBounds}
                        >
                          {isCellSwapSource && <div className="absolute inset-0 bg-emerald-500/15 pointer-events-none rounded-[4px] z-10" />}
                          {assign && !isOutOfBounds ? (
                            <span className={`truncate w-full block ${((isCellSelected || isCellDragged) && (cell?.locked || isPast)) ? 'line-through' : ''}`}>
                              {programData.placeholderCodenames.has(assign) ? `${assign}?` : assign}
                            </span>
                          ) : (
                            <span className="text-light-5 select-none" style={{ filter: 'grayscale(100%)' }}>
                              {(() => {
                                if (idx < activeStart) {
                                  if (resident.transferInYear !== undefined) return '🏥⇢';
                                  return '⇢';
                                }
                                if (idx >= activeEnd) {
                                  if ((resident as any).expelled) return '⦸';
                                  if ((resident as any).dropout) return '⤵︎';
                                  if (resident.transferOutYear !== undefined) return '⇠🏥';
                                  return '🎓';
                                }
                                return '-';
                              })()}
                            </span>
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
      {tooltip && tooltip.anchorRect && (
        <div
          className="fixed z-[150] backdrop-blur-xl bg-white/45 text-black text-xs rounded-xl py-2.5 px-3.5 shadow-2xl pointer-events-none flex flex-col gap-1 w-[420px] select-none border border-white/50 transition-all duration-150 ease-out"
          style={{
            left: `${left}px`,
            top: `${top}px`,
            opacity: isTooltipVisible ? 1 : 0,
            transform: isTooltipVisible ? 'translateY(-100%) scale(1)' : 'translateY(-101%) scale(0.96)',
          }}
        >
          <div className="flex justify-between items-start gap-2">
            <span className="font-bold text-sm text-black truncate leading-tight select-none">
              {tooltip.assignmentName}
            </span>
            <span className="text-muted text-[11px] font-medium shrink-0 bg-white/40 border border-white/50 px-1.5 py-0.5 rounded select-none">
              {tooltip.progress}
            </span>
          </div>

          {tooltip.peers.length > 0 && (
            <div className="border-t border-black/10 pt-2 mt-1">
              <div className="text-muted mb-1 text-[10px] uppercase font-bold tracking-wider select-none">
                Coworkers on shift
              </div>
              <div className="flex flex-col gap-1.5">
                {[1, 2, 3].map(pgy => {
                  const pgyGroup = tooltip.peers.filter(r => ((r.startYear > 0 ? (startYear - r.startYear + 1) : r.level) + Math.floor(tooltip.weekIdx / 52)) === pgy);
                  if (pgyGroup.length === 0) return null;
                  return (
                    <div key={pgy} className="flex gap-2 items-start">
                      <span className="text-[10px] text-muted font-bold w-12 shrink-0 select-none pt-0.5">
                        PGY-{pgy}:
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {pgyGroup.map(r => (
                          <span key={r.id} className="bg-white/40 border border-white/50 text-black px-2 py-0.5 rounded text-[11px] font-medium select-none">
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
          <div
            className="absolute -bottom-1 w-2.5 h-2.5 bg-white/45 backdrop-blur-xl border-b border-r border-white/50 transform rotate-45"
            style={{
              left: `${arrowLeft}px`,
              marginLeft: '-5px',
            }}
          />
        </div>
      )}
    </div>
  );
});
