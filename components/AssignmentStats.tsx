
import React, { useState, useRef, useMemo } from 'react';
import { Resident, ScheduleGrid, AssignmentType } from '../types';
import { TOTAL_WEEKS, ASSIGNMENT_LABELS, ROTATION_METADATA, ASSIGNMENT_HEX_COLORS } from '../constants';
import { AlertTriangle } from 'lucide-react';

interface Props {
  residents: Resident[];
  schedule: ScheduleGrid;
}

const WEEKS = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1);

const getBaseColorStyle = (assignment: AssignmentType, count: number, max: number): React.CSSProperties => {
  if (count === 0) return { backgroundColor: '#ffffff' };

  const baseHex = ASSIGNMENT_HEX_COLORS[assignment] || '#ccc';
  const intensity = Math.min(1, 0.3 + (count / Math.max(1, max)) * 0.7);

  return {
    backgroundColor: baseHex,
    opacity: intensity,
    color: '#1f2937'
  };
};

export const AssignmentStats: React.FC<Props> = React.memo(({ residents, schedule }) => {
  // Resizable Column State - Reduced default width
  const [colWidth, setColWidth] = useState(150);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const [cellTooltip, setCellTooltip] = useState<{ x: number, y: number, assignees: Resident[], type: string, error?: string } | null>(null);
  const [rowTooltip, setRowTooltip] = useState<{ x: number, y: number, type: AssignmentType } | null>(null);

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
    const priorityOrder = [
      AssignmentType.WARDS_RED,
      AssignmentType.WARDS_BLUE,
      AssignmentType.ICU,
      AssignmentType.NIGHT_FLOAT,
      AssignmentType.EM,
      AssignmentType.CLINIC,
      AssignmentType.ELECTIVE,
      AssignmentType.VACATION,
    ];

    const allTypes = Object.values(AssignmentType);
    const remainingTypes = allTypes
      .filter(type => !priorityOrder.includes(type))
      .sort((a, b) => {
        const labelA = ASSIGNMENT_LABELS[a] || '';
        const labelB = ASSIGNMENT_LABELS[b] || '';
        return labelA.localeCompare(labelB);
      });

    return [...priorityOrder, ...remainingTypes];
  }, []);

  // Group data
  const data: Record<AssignmentType, Resident[][]> = useMemo(() => {
    const d: Record<AssignmentType, Resident[][]> = {} as any;
    Object.values(AssignmentType).forEach(type => {
      d[type] = Array(TOTAL_WEEKS).fill([]);
    });

    for (let w = 0; w < TOTAL_WEEKS; w++) {
      residents.forEach(r => {
        const type = schedule[r.id]?.[w]?.assignment;
        if (type) {
          d[type][w] = [...(d[type][w] || []), r];
        }
      });
    }
    return d;
  }, [residents, schedule]);

  const maxCounts: Record<AssignmentType, number> = useMemo(() => {
    const m: Record<AssignmentType, number> = {} as any;
    Object.values(AssignmentType).forEach(type => {
      let max = 0;
      for (let w = 0; w < TOTAL_WEEKS; w++) {
        if (data[type][w].length > max) max = data[type][w].length;
      }
      m[type] = max;
    });
    return m;
  }, [data]);

  const checkConstraints = (type: AssignmentType, assignees: Resident[]) => {
    const meta = ROTATION_METADATA[type];
    if (!meta) return null;

    const interns = assignees.filter(r => r.level === 1).length;
    const seniors = assignees.filter(r => r.level > 1).length;

    if (interns < meta.minInterns) return `Min Interns (${meta.minInterns}) unmet: ${interns}`;
    if (interns > meta.maxInterns) return `Max Interns (${meta.maxInterns}) exceeded: ${interns}`;
    if (seniors < meta.minSeniors) return `Min Seniors (${meta.minSeniors}) unmet: ${seniors}`;
    if (seniors > meta.maxSeniors) return `Max Seniors (${meta.maxSeniors}) exceeded: ${seniors}`;
    return null;
  };

  const handleCellEnter = (e: React.MouseEvent, type: AssignmentType, weekIdx: number) => {
    const assignees = data[type][weekIdx];
    const error = checkConstraints(type, assignees);

    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setCellTooltip({
      x: rect.left + window.scrollX + rect.width / 2,
      y: rect.top + window.scrollY,
      assignees,
      type: ASSIGNMENT_LABELS[type],
      error: error || undefined
    });
  };

  const handleRowHeaderEnter = (e: React.MouseEvent, type: AssignmentType) => {
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
      <div className="p-4 bg-gray-50 border-b">
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          Assignment Heatmap
        </h2>
        <p className="text-sm text-gray-500">View staffing levels vs. constraints. Hover over row headers for rule details.</p>
      </div>

      <div className="flex-1 overflow-auto spreadsheet-container pb-64">
        <table className="border-separate border-spacing-0 w-max">
          <thead className="sticky top-0 z-30 bg-gray-50 text-xs text-gray-500 font-semibold h-10 shadow-sm">
            <tr>
              <th
                className="sticky left-0 z-40 bg-white/80 backdrop-blur-md border-b border-r p-0 text-left transition-all"
                style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
              >
                <div className="flex items-center justify-between h-full px-3 py-2 relative">
                  <span className="truncate pr-2">Assignment</span>
                  {/* Resize Handle */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 active:bg-blue-600 transition-colors z-50"
                    onMouseDown={startResize}
                  />
                </div>
              </th>
              {WEEKS.map(w => (
                <th key={w} className="border-b border-gray-200 min-w-[30px] text-center w-8 text-[10px]">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-xs">
            {sortedAssignmentTypes.map(type => {
              const meta = ROTATION_METADATA[type];
              const totalMin = meta.minInterns + meta.minSeniors;
              const totalMax = meta.maxInterns + meta.maxSeniors;
              const rangeLabel = formatMinMax(totalMin, totalMax);

              // Check if any week has a violation for this row
              let hasViolation = false;
              for (let i = 0; i < TOTAL_WEEKS; i++) {
                if (checkConstraints(type, data[type][i])) hasViolation = true;
              }

              return (
                <tr key={type} className="hover:bg-gray-50">
                  <td
                    className="sticky left-0 z-20 bg-white/80 backdrop-blur-md border-b border-r px-3 py-1 font-medium text-gray-700 whitespace-nowrap cursor-help group transition-all"
                    style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                    onMouseEnter={(e) => handleRowHeaderEnter(e, type)}
                    onMouseLeave={() => setRowTooltip(null)}
                  >
                    <div className="flex items-center justify-between overflow-hidden">
                      <span className={`truncate ${hasViolation ? 'text-red-600 font-bold' : ''}`}>
                        {ASSIGNMENT_LABELS[type]}
                      </span>
                      {rangeLabel && (
                        <span className={`text-[10px] ml-1 font-mono shrink-0 ${hasViolation ? 'text-red-500' : 'text-gray-400'}`}>
                          {rangeLabel}
                        </span>
                      )}
                    </div>
                  </td>
                  {WEEKS.map((w, i) => {
                    const assignees = data[type][i];
                    const count = assignees.length;
                    const style = getBaseColorStyle(type, count, maxCounts[type]);

                    const error = checkConstraints(type, assignees);

                    return (
                      <td
                        key={i}
                        className={`border-b text-center cursor-default relative p-0 ${error ? 'border-red-500 border-2 z-10' : 'border-gray-100'}`}
                        onMouseEnter={(e) => handleCellEnter(e, type, i)}
                        onMouseLeave={() => setCellTooltip(null)}
                      >
                        {count > 0 ? (
                          <div className="w-full h-8 flex items-center justify-center font-bold" style={style}>
                            {count}
                          </div>
                        ) : (
                          error ? (
                            // Only show error background if 0 counts is actually an error (min > 0)
                            <div className="w-full h-8 bg-red-50"></div>
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

      {/* Cell Tooltip (Assignees) */}
      {cellTooltip && (
        <div
          className="fixed z-[200] bg-gray-900 text-white text-xs rounded-lg py-3 px-4 shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full mt-[-8px] min-w-[200px]"
          style={{ left: cellTooltip.x, top: cellTooltip.y }}
        >
          <div className="flex items-center gap-2 mb-2 border-b border-gray-700 pb-1">
            {cellTooltip.error && <AlertTriangle size={14} className="text-red-400" />}
            <span className="font-bold text-sm">{cellTooltip.type}</span>
          </div>

          {cellTooltip.error && (
            <div className="bg-red-900/50 text-red-100 p-1.5 rounded mb-2 font-semibold">
              {cellTooltip.error}
            </div>
          )}

          <div className="space-y-2">
            {[1, 2, 3].map(pgy => {
              const pgyGroup = cellTooltip.assignees.filter(r => r.level === pgy);
              if (pgyGroup.length === 0) return null;
              return (
                <div key={pgy}>
                  <div className="text-[10px] uppercase text-gray-400 font-bold mb-0.5">PGY-{pgy} ({pgyGroup.length})</div>
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
          <div className="absolute left-1/2 -bottom-1 w-2 h-2 bg-gray-900 transform -translate-x-1/2 rotate-45"></div>
        </div>
      )}

      {/* Row Tooltip (Metadata Constraints) */}
      {rowTooltip && (
        <div
          className="fixed z-[200] bg-white text-gray-800 text-xs rounded-lg shadow-xl border border-gray-200 p-4 pointer-events-none transform -translate-y-1/2 ml-2 min-w-[240px]"
          style={{ left: rowTooltip.x, top: rowTooltip.y }}
        >
          <h4 className="font-bold text-sm text-blue-700 mb-2 border-b pb-1">
            {ASSIGNMENT_LABELS[rowTooltip.type]}
          </h4>

          {(() => {
            const meta = ROTATION_METADATA[rowTooltip.type];
            return (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <span className="text-gray-500">Intensity:</span>
                  <span className="font-bold">{meta.intensity}/5</span>

                  <span className="text-gray-500">Setting:</span>
                  <span className="font-medium">{meta.setting}</span>

                  <span className="text-gray-500">Duration:</span>
                  <span className="font-medium">{meta.duration} Weeks</span>
                </div>

                <div className="bg-gray-50 p-2 rounded border border-gray-100 mt-2">
                  <div className="text-xs font-bold text-gray-500 uppercase mb-1">Weekly Staffing</div>
                  <div className="flex justify-between">
                    <span>PGY-1:</span>
                    <span className="font-mono">{meta.minInterns} - {meta.maxInterns > 15 ? '∞' : meta.maxInterns}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>PGY-2/3:</span>
                    <span className="font-mono">{meta.minSeniors} - {meta.maxSeniors > 15 ? '∞' : meta.maxSeniors}</span>
                  </div>
                </div>

                {(meta.targetIntern !== undefined || meta.targetSenior !== undefined || meta.targetPGY2 !== undefined || meta.targetPGY3 !== undefined) && (
                  <div className="bg-blue-50 p-2 rounded border border-blue-100">
                    <div className="text-xs font-bold text-blue-500 uppercase mb-1">Annual Targets</div>
                    {meta.targetIntern !== undefined && <div>PGY-1: {meta.targetIntern} weeks</div>}
                    {meta.targetPGY2 !== undefined ? (
                      <div>PGY-2: {meta.targetPGY2} weeks</div>
                    ) : (
                      meta.targetSenior !== undefined && <div>Seniors: {meta.targetSenior} weeks</div>
                    )}
                    {meta.targetPGY3 !== undefined && <div>PGY-3: {meta.targetPGY3} weeks</div>}
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
