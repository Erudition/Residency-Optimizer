import React, { useState, useRef, useMemo } from 'react';
import { Resident, ScheduleGrid } from '../types';
import { AlertTriangle } from 'lucide-react';
import { useProgramData } from '../contexts/ProgramDataContext';
import { getDisplayOrderedCodenames, deriveLatestHistoricalYear } from '../services/programDataUtils';
import { RequirementsEngine } from '../services/requirementsEngine';
import { oklchToHex } from '../utils/colorUtils';

interface Props {
  residents: Resident[];
  schedule: ScheduleGrid;
}

const getBaseColorStyle = (count: number, max: number, hue: number, intensity: number): React.CSSProperties => {
  if (count === 0) return { backgroundColor: '#ffffff' };

  const chroma = intensity === 0 ? 0.015 : 0.01 + intensity * 0.038;
  const baseHex = oklchToHex(0.84, chroma, hue);

  const opacityIntensity = Math.min(1, 0.3 + (count / Math.max(1, max)) * 0.7);

  return {
    backgroundColor: baseHex,
    opacity: opacityIntensity,
    color: '#1f2937'
  };
};

export const AssignmentStats: React.FC<Props> = React.memo(({ residents, schedule }) => {
  const programData = useProgramData();
  const { rotations } = programData;

  const totalWeeks = useMemo(() => (Object.values(schedule)[0] as any)?.length || 52, [schedule]);
  const WEEKS = useMemo(() => Array.from({ length: totalWeeks }, (_, i) => i + 1), [totalWeeks]);
  // Resizable Column State - Reduced default width
  const [colWidth, setColWidth] = useState(150);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const [cellTooltip, setCellTooltip] = useState<{ x: number, y: number, assignees: Resident[], type: string, weekIdx: number, error?: string } | null>(null);
  const [rowTooltip, setRowTooltip] = useState<{ x: number, y: number, type: string } | null>(null);

  // Handle Resizing
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
    // Min Width 100
    const newWidth = Math.max(100, Math.min(600, startWidthRef.current + diff));
    setColWidth(newWidth);
  };

  const handleMouseUp = () => {
    resizingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
  };

  // Define Row Order
  const sortedAssignmentTypes = useMemo(() => {
    return getDisplayOrderedCodenames(programData);
  }, [programData]);

  // Group data
  const data: Record<string, Resident[][]> = useMemo(() => {
    const d: Record<string, Resident[][]> = {} as any;
    Array.from(rotations.keys()).forEach(type => {
      d[type] = Array(totalWeeks).fill([]);
    });

    for (let w = 0; w < totalWeeks; w++) {
      residents.forEach(r => {
        // Skip weeks where this resident is not active (multi-year unified grids)
        const start = r.activeWeekStart ?? 0;
        const end = r.activeWeekEnd ?? totalWeeks;
        if (w < start || w >= end) return;

        const type = schedule[r.id]?.[w]?.assignment;
        if (type && d[type]) {
          d[type][w] = [...(d[type][w] || []), r];
        }
      });
    }
    return d;
  }, [residents, schedule, rotations, totalWeeks]);

  const maxCounts: Record<string, number> = useMemo(() => {
    const m: Record<string, number> = {} as any;
    Array.from(rotations.keys()).forEach(type => {
      let max = 0;
      for (let w = 0; w < totalWeeks; w++) {
        if (data[type][w].length > max) max = data[type][w].length;
      }
      m[type] = max;
    });
    return m;
  }, [data, rotations, totalWeeks]);

  const checkConstraints = (type: string, assignees: Resident[], weekIdx: number) => {
    const firstRes = residents?.find(res => res.startYear && res.startYear > 0);
    const baseYear = firstRes ? (firstRes.startYear + Number(firstRes.level) - 1) : deriveLatestHistoricalYear();
    return RequirementsEngine.getStaffingViolation(type, assignees, weekIdx, baseYear, programData);
  };

  const handleCellEnter = (e: React.MouseEvent, type: string, weekIdx: number) => {
    const assignees = data[type][weekIdx];
    const error = checkConstraints(type, assignees, weekIdx);
    const label = rotations.get(type)?.label || type;

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setCellTooltip({
      x: rect.left + window.scrollX + rect.width / 2,
      y: rect.top + window.scrollY,
      assignees,
      type: label,
      weekIdx,
      error: error || undefined
    });
  };

  const handleRowHeaderEnter = (e: React.MouseEvent, type: string) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setRowTooltip({
      x: rect.right + window.scrollX + 10,
      y: rect.top + window.scrollY,
      type
    });
  };

  const formatMinMax = (min: number, max: number) => {
    if (max > 15) return ''; // Hide range if effectively infinite
    if (min === max) return `${min}`;
    return `${min}-${max}`;
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden relative">
      <div className="p-4 bg-light-1 border-b">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          Assignment Heatmap
        </h2>
        <p className="text-sm text-muted">View staffing levels vs. constraints. Hover over row headers for rule details.</p>
      </div>

      <div className="flex-1 overflow-auto spreadsheet-container">
        <table className="border-separate border-spacing-0 w-max">
          <thead className="sticky top-0 z-30 bg-light-1 text-xs text-muted font-semibold h-10 shadow-sm">
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
              {WEEKS.map(w => (
                <th key={w} className="border-b border-light-5 min-w-[30px] text-center w-8 text-[10px]">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-xs">
            {sortedAssignmentTypes.map(type => {
              const meta = rotations.get(type);
              if (!meta) return null;
              
              const totalMin = meta.minInterns + meta.minSeniors;
              const totalMax = meta.maxInterns + meta.maxSeniors;
              const rangeLabel = formatMinMax(totalMin, totalMax);

              // Check if any week has a violation for this row
              let hasViolation = false;
              for (let i = 0; i < totalWeeks; i++) {
                if (checkConstraints(type, data[type][i], i)) hasViolation = true;
              }

              return (
                <tr key={type} className="hover:bg-light-1">
                  <td
                    className="sticky left-0 z-20 bg-light-1/90 backdrop-blur-md border-b border-r px-3 py-1 font-medium text-primary whitespace-nowrap cursor-help group transition-all"
                    style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                    onMouseEnter={(e) => handleRowHeaderEnter(e, type)}
                    onMouseLeave={() => setRowTooltip(null)}
                  >
                    <div className="flex items-center justify-between overflow-hidden">
                      <span className={`truncate ${hasViolation ? 'text-red font-bold' : ''}`}>
                        {meta.label}
                      </span>
                      {rangeLabel && (
                        <span className={`text-[10px] ml-1 font-mono shrink-0 ${hasViolation ? 'text-red' : 'text-muted'}`}>
                          {rangeLabel}
                        </span>
                      )}
                    </div>
                  </td>
                  {WEEKS.map((w, i) => {
                    const assignees = data[type][i];
                    const count = assignees.length;
                    const rotation = rotations.get(type);
                    const style = getBaseColorStyle(count, maxCounts[type], rotation?.color || 0, meta.intensity);

                    const error = checkConstraints(type, assignees, i);

                    return (
                      <td
                        key={i}
                        className={`border-b text-center cursor-default relative p-0 ${error ? 'border-red border-2 z-10' : 'border-light-3'}`}
                        onMouseEnter={(e) => handleCellEnter(e, type, i)}
                        onMouseLeave={() => setCellTooltip(null)}
                      >
                        {count > 0 ? (
                          <div className="w-full h-8 flex items-center justify-center font-bold" style={style}>
                            {count}
                          </div>
                        ) : (
                          error ? (
                            <div className="w-full h-8 bg-red/10"></div>
                          ) : null
                        )}
                      </td>
                    );
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {cellTooltip && (
        <div
          className="fixed z-[200] bg-black text-white text-xs rounded-lg py-3 px-4 shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full mt-[-8px] min-w-[200px]"
          style={{ left: cellTooltip.x, top: cellTooltip.y }}
        >
          <div className="flex items-center gap-2 mb-2 border-b border-light-9 pb-1">
            {cellTooltip.error && <AlertTriangle size={14} className="text-red-2" />}
            <span className="font-bold text-sm">{cellTooltip.type}</span>
          </div>

          {cellTooltip.error && (
            <div className="bg-red-900/50 text-red-100 p-1.5 rounded mb-2 font-semibold">
              {cellTooltip.error}
            </div>
          )}

          <div className="space-y-2">
            {[1, 2, 3].map(pgy => {
              const firstRes = residents.find(res => res.startYear && res.startYear > 0);
              const gridStartYear = firstRes ? (firstRes.startYear + Number(firstRes.level) - 1) : 2026;
              const getPgy = (res: Resident) => {
                const startYear = res.startYear > 0 ? res.startYear : gridStartYear - Number(res.level) + 1;
                return gridStartYear - startYear + 1 + Math.floor(cellTooltip.weekIdx / 52);
              };
              const pgyGroup = cellTooltip.assignees.filter(r => getPgy(r) === pgy);
              if (pgyGroup.length === 0) return null;
              return (
                <div key={pgy}>
                  <div className="text-[10px] uppercase text-muted font-bold mb-0.5">PGY-{pgy} ({pgyGroup.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {pgyGroup.map(r => (
                      <span key={r.id} className="bg-light-9 px-1.5 py-0.5 rounded text-[10px] text-black">
                        {r.name}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="absolute left-1/2 -bottom-1 w-2 h-2 bg-black transform -translate-x-1/2 rotate-45"></div>
        </div>
      )}

      {rowTooltip && (
        <div
          className="fixed z-[200] bg-white text-primary text-xs rounded-lg shadow-xl border border-light-5 p-4 pointer-events-none transform -translate-y-1/2 ml-2 min-w-[240px]"
          style={{ left: rowTooltip.x, top: rowTooltip.y }}
        >
          <h4 className="font-bold text-sm text-blue-2-dark mb-2 border-b pb-1">
            {rotations.get(rowTooltip.type)?.label || rowTooltip.type}
          </h4>

          {(() => {
            const meta = rotations.get(rowTooltip.type);
            if (!meta) return null;
            return (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-muted">Intensity:</span>
                  <span className="font-bold">{meta.intensity}/5</span>

                  <span className="text-muted">Setting:</span>
                  <span className="font-medium">{meta.setting}</span>

                  <span className="text-muted">Duration:</span>
                  <span className="font-medium">{meta.duration} Weeks</span>
                </div>

                <div className="bg-light-1 p-2 rounded border border-light-3 mt-2">
                  <div className="text-xs font-bold text-muted uppercase mb-1">Weekly Staffing</div>
                  <div className="flex justify-between">
                    <span>PGY-1:</span>
                    <span className="font-mono">{meta.minInterns} - {meta.maxInterns > 15 ? '∞' : meta.maxInterns}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>PGY-2/3:</span>
                    <span className="font-mono">{meta.minSeniors} - {meta.maxSeniors > 15 ? '∞' : meta.maxSeniors}</span>
                  </div>
                </div>

                {(meta.minWeeksIntern !== undefined || meta.minWeeksSenior !== undefined || meta.minWeeksPGY2 !== undefined || meta.minWeeksPGY3 !== undefined) && (
                  <div className="bg-light-blue/20 p-2 rounded border border-light-blue/40">
                    <div className="text-xs font-bold text-blue uppercase mb-1">Annual Minimums</div>
                    {meta.minWeeksIntern !== undefined && <div>PGY-1: {meta.minWeeksIntern} weeks</div>}
                    {meta.minWeeksPGY2 !== undefined ? (
                      <div>PGY-2: {meta.minWeeksPGY2} weeks</div>
                    ) : (
                      meta.minWeeksSenior !== undefined && <div>Seniors: {meta.minWeeksSenior} weeks</div>
                    )}
                    {meta.minWeeksPGY3 !== undefined && <div>PGY-3: {meta.minWeeksPGY3} weeks</div>}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
});
