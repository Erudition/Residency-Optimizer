import React, { useMemo, useState, useRef } from 'react';
import { Resident, ScheduleGrid } from '../types';
import { Network, LayoutGrid, Users } from 'lucide-react';
import { calculateDiversityStats } from '../services/scheduler';
import { useProgramData } from '../contexts/ProgramDataContext';

interface Props {
  residents: Resident[];
  schedule: ScheduleGrid;
  activeYear?: number;
  startYear?: number;
  customCycleConfig?: {
    cohortCount: number;
    Y: number;
    Z: number;
    clinicAssignments?: Record<string, string>;
  };
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

export const RelationshipStats: React.FC<Props> = React.memo(({ residents, schedule, activeYear, startYear, customCycleConfig }) => {
  const [colWidth, setColWidth] = useState(240);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const startResize = (e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = colWidth;
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);
    e.preventDefault();
  };

  const handleResize = (e: MouseEvent) => {
    if (!isResizing.current) return;
    const delta = e.clientX - startX.current;
    const newWidth = Math.max(160, Math.min(400, startWidth.current + delta));
    setColWidth(newWidth);
  };

  const stopResize = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  };

  // Tooltip state for column or row headers
  const [hoveredResidentInfo, setHoveredResidentInfo] = useState<{
    x: number;
    y: number;
    resident: Resident;
    uniqueCount: number;
    totalPossible: number;
    percent: number;
    maxOverlapWeeks: number;
    maxOverlapName: string;
  } | null>(null);

  // Tooltip state for grid cells
  const [hoveredCellInfo, setHoveredCellInfo] = useState<{
    x: number;
    y: number;
    rowResident: Resident;
    colResident: Resident;
    weeksShared: number;
    sharedDetails: { week: number; assignment: string }[];
  } | null>(null);

  const [groupBy, setGroupBy] = useState<'pgy' | 'cycle'>('cycle');

  const isUnified = useMemo(() => {
    return Object.values(schedule).some(row => (row as any)?.length > 52);
  }, [schedule]);

  const programData = useProgramData();

  const getCohortSortValue = (cohort: number, year: number) => {
    const config = customCycleConfig || programData.cycleConfig;
    const { Y, Z } = config;
    const startYr = startYear ?? 2025;
    const startWeek = (year - startYr) * 52;
    const startingCohort = Math.floor((startWeek % Z) / Y);
    return (cohort - startingCohort + Z) % Z;
  };

  const sortedResidents = useMemo(() => {
    if (isUnified) {
      return [...residents].sort((a, b) => {
        if (a.startYear !== b.startYear) return a.startYear - b.startYear;
        const cycleA = a.cohort ?? 0;
        const cycleB = b.cohort ?? 0;
        if (cycleA !== cycleB) return cycleA - cycleB;
        return a.name.localeCompare(b.name);
      });
    }
    const currentYr = activeYear ?? 2025;
    return [...residents].sort((a, b) => {
      if (groupBy === 'cycle') {
        const cohortSortA = getCohortSortValue(a.cohort ?? 0, currentYr);
        const cohortSortB = getCohortSortValue(b.cohort ?? 0, currentYr);
        if (cohortSortA !== cohortSortB) return cohortSortA - cohortSortB;
        if (a.level !== b.level) return a.level - b.level;
        return a.name.localeCompare(b.name);
      } else {
        if (a.level !== b.level) return a.level - b.level;
        return a.name.localeCompare(b.name);
      }
    });
  }, [residents, groupBy, isUnified, activeYear, startYear, programData]);

  const getDiversityBadgeStyle = (pct: number) => {
    const minDiv = 50;
    const maxDiv = 100;
    const midDiv = 75;
    const clamped = Math.max(minDiv, Math.min(maxDiv, pct));

    if (clamped >= midDiv) {
      // White to Green transition (75% to 100%)
      const ratio = (clamped - midDiv) / (maxDiv - midDiv);
      const bg = `hsl(142, ${Math.round(ratio * 100)}%, ${Math.round(100 - ratio * 10)}%)`;
      const text = `hsl(142, ${Math.round(ratio * 40 + 30)}%, ${Math.round(20 + (1 - ratio) * 20)}%)`;
      const border = `hsl(142, ${Math.round(ratio * 50 + 20)}%, ${Math.round(90 - ratio * 10)}%)`;
      return { backgroundColor: bg, color: text, borderColor: border };
    } else {
      // Red to White transition (50% to 75%)
      const ratio = (midDiv - clamped) / (midDiv - minDiv);
      const bg = `hsl(350, ${Math.round(ratio * 100)}%, ${Math.round(100 - ratio * 10)}%)`;
      const text = `hsl(350, ${Math.round(ratio * 40 + 30)}%, ${Math.round(20 + (1 - ratio) * 20)}%)`;
      const border = `hsl(350, ${Math.round(ratio * 50 + 20)}%, ${Math.round(90 - ratio * 10)}%)`;
      return { backgroundColor: bg, color: text, borderColor: border };
    }
  };

  const getCellStyles = (weeks: number, isSelf: boolean) => {
    if (isSelf) {
      return {
        className: 'bg-slate-100 text-slate-400 font-normal',
        style: {}
      };
    }

    if (weeks === 0) {
      return {
        className: 'bg-white text-slate-400 font-normal border-b border-light-3',
        style: {}
      };
    }

    // Continuous spectrum: 1 week (emerald green) -> 8+ weeks (deep soft red)
    // Naturally traversing green -> yellow -> orange -> red!
    const t = Math.min(1, Math.max(0, (weeks - 1) / 7));
    const hue = 142 - t * 142;
    const sat = Math.round(55 + t * 25);
    const light = Math.round(94 - t * 4);
    
    const bg = `hsl(${Math.round(hue)}, ${sat}%, ${light}%)`;
    const text = `hsl(${Math.round(hue)}, 75%, 25%)`;

    return {
      className: 'font-extrabold border-b border-light-3',
      style: { backgroundColor: bg, color: text }
    };
  };

  const { rows, matrix, averageSharedWeeks, maxRowWeeksMap, maxColWeeksMap, sharedDetails } = useMemo(() => {
    const diversityScores = calculateDiversityStats(residents, schedule);
    const matrix: Record<string, Record<string, number>> = {};
    const sharedDetails: Record<string, Record<string, { week: number; assignment: string }[]>> = {};
    
    residents.forEach(r => {
      matrix[r.id] = {};
      sharedDetails[r.id] = {};
    });

    const nonCoWorkingTypes = ['VAC', 'ELEC', 'RSCH'];

    const totalWeeksInSchedule = Math.max(...Object.values(schedule).map(r => (r as any) ? (r as any).length : 0), 52);

    for (let w = 0; w < totalWeeksInSchedule; w++) {
      const byAssignment: Record<string, string[]> = {};
      residents.forEach(r => {
        const type = schedule[r.id]?.[w]?.assignment;
        if (type && !nonCoWorkingTypes.includes(type)) {
          if (!byAssignment[type]) byAssignment[type] = [];
          byAssignment[type].push(r.id);
        }
      });

      Object.entries(byAssignment).forEach(([type, group]) => {
        if (group.length < 2) return;
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const r1 = group[i];
            const r2 = group[j];
            matrix[r1][r2] = (matrix[r1][r2] || 0) + 1;
            matrix[r2][r1] = (matrix[r2][r1] || 0) + 1;
            
            if (!sharedDetails[r1][r2]) sharedDetails[r1][r2] = [];
            sharedDetails[r1][r2].push({ week: w, assignment: type });
            
            if (!sharedDetails[r2][r1]) sharedDetails[r2][r1] = [];
            sharedDetails[r2][r1].push({ week: w, assignment: type });
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

    let totalWeeks = 0;
    let count = 0;
    residents.forEach((r1, i) => {
      residents.forEach((r2, j) => {
        if (i >= j) return; // Only count unique pairs
        const w = matrix[r1.id]?.[r2.id] || 0;
        if (w > 0) {
          totalWeeks += w;
          count++;
        }
      });
    });
    const averageSharedWeeks = count > 0 ? totalWeeks / count : 0;

    // Compute max weeks shared for each resident (row and col maps)
    const maxRowWeeksMap: Record<string, number> = {};
    const maxColWeeksMap: Record<string, number> = {};
    
    residents.forEach(r => {
      let maxW = 0;
      residents.forEach(other => {
        if (other.id !== r.id) {
          const w = matrix[r.id]?.[other.id] || 0;
          if (w > maxW) maxW = w;
        }
      });
      maxRowWeeksMap[r.id] = maxW;
      maxColWeeksMap[r.id] = maxW;
    });

    return { rows, matrix, averageSharedWeeks, maxRowWeeksMap, maxColWeeksMap, sharedDetails };
  }, [residents, schedule]);

  // Tooltip event handlers
  const handleRowHeaderEnter = (e: React.MouseEvent, res: Resident) => {
    const resStats = rows.find(r => r.id === res.id);
    if (!resStats) return;
    setHoveredResidentInfo({
      x: e.clientX,
      y: e.clientY,
      resident: res,
      uniqueCount: resStats.uniqueCount,
      totalPossible: resStats.totalPossible,
      percent: resStats.percent,
      maxOverlapWeeks: resStats.maxOverlapWeeks,
      maxOverlapName: resStats.maxOverlapName
    });
  };

  const handleColHeaderEnter = (e: React.MouseEvent, res: Resident) => {
    const resStats = rows.find(r => r.id === res.id);
    if (!resStats) return;
    setHoveredResidentInfo({
      x: e.clientX,
      y: e.clientY,
      resident: res,
      uniqueCount: resStats.uniqueCount,
      totalPossible: resStats.totalPossible,
      percent: resStats.percent,
      maxOverlapWeeks: resStats.maxOverlapWeeks,
      maxOverlapName: resStats.maxOverlapName
    });
  };

  const handleHeaderMove = (e: React.MouseEvent) => {
    if (hoveredResidentInfo) {
      setHoveredResidentInfo(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
    }
  };

  const handleHeaderLeave = () => {
    setHoveredResidentInfo(null);
  };

  const handleCellEnter = (e: React.MouseEvent, rowRes: Resident, colRes: Resident, weeks: number) => {
    setHoveredCellInfo({
      x: e.clientX,
      y: e.clientY,
      rowResident: rowRes,
      colResident: colRes,
      weeksShared: weeks,
      sharedDetails: sharedDetails[rowRes.id]?.[colRes.id] || []
    });
  };

  const handleCellMove = (e: React.MouseEvent) => {
    if (hoveredCellInfo) {
      setHoveredCellInfo(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
    }
  };

  const handleCellLeave = () => {
    setHoveredCellInfo(null);
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden relative select-none">
      {/* Top Header Toolbar */}
      <div className="p-4 bg-light-1 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0 select-none">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <Network size={20} className="text-purple" />
            Co-Working Overlap Matrix
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Shows the number of weeks shared between resident pairs. Color shades range from white (0 weeks) through green, yellow, orange, and red (8+ weeks).
          </p>
        </div>

        {/* Controls and Legend Group */}
        <div className="flex items-center gap-6 flex-wrap">
          {/* Group By Toggle */}
          {!isUnified && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-muted uppercase tracking-wider">Group By</span>
              <div className="flex bg-light-2 p-1 rounded-xl border border-light-5">
                <button
                  onClick={() => setGroupBy('cycle')}
                  className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-bold transition-all ${groupBy === 'cycle' ? 'bg-white text-blue shadow-sm border border-light-5' : 'text-muted hover:text-primary'}`}
                >
                  <Users size={14} />
                  Cycle
                </button>
                <button
                  onClick={() => setGroupBy('pgy')}
                  className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-bold transition-all ${groupBy === 'pgy' ? 'bg-white text-blue shadow-sm border border-light-5' : 'text-muted hover:text-primary'}`}
                >
                  <LayoutGrid size={14} />
                  PGY
                </button>
              </div>
            </div>
          )}

          {/* Color Legend (Continuous Gradient) */}
          <div className="flex items-center gap-3 sm:border-l sm:pl-6 sm:border-light-5">
            <span className="text-[10px] font-black text-muted uppercase tracking-wider">Legend</span>
            <div className="flex items-center gap-2 select-none">
              <span className="text-[10px] font-extrabold text-slate-500">0 Weeks (White)</span>
              <div 
                className="w-36 h-3.5 rounded-lg border border-light-4 shadow-sm" 
                style={{ 
                  background: 'linear-gradient(to right, #ffffff, hsl(142, 55%, 94%), hsl(81, 65%, 92%), hsl(40, 72%, 91%), hsl(0, 80%, 90%))' 
                }} 
              />
              <span className="text-[10px] font-extrabold text-rose-700">8+ Weeks (Red)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Spreadsheet Grid Container */}
      <div className="flex-1 overflow-auto spreadsheet-container">
        <table className="border-separate border-spacing-0 w-max">
          <thead className="sticky top-0 z-30 bg-light-1 text-xs text-muted font-semibold h-28 shadow-sm select-none">
            <tr>
              <th
                className="sticky left-0 bg-light-1/90 backdrop-blur-md border-b border-r p-0 text-left transition-all"
                style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth, zIndex: 150 }}
              >
                <div className="flex items-center justify-between h-full px-3 py-2 relative">
                  <span className="truncate pr-2 font-bold text-primary">Resident (Row / Col)</span>
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue active:bg-blue transition-colors z-50"
                    onMouseDown={startResize}
                  />
                </div>
              </th>
              {sortedResidents.map((res, idx) => (
                <th
                  key={res.id}
                  className="border-b border-light-5 w-11 min-w-[44px] h-28 p-0 bg-light-1 relative"
                  style={{ zIndex: 100 - idx }}
                  onMouseEnter={(e) => handleColHeaderEnter(e, res)}
                  onMouseLeave={handleHeaderLeave}
                  onMouseMove={handleHeaderMove}
                >
                  <div className="h-full flex items-end justify-start pb-4 relative overflow-visible">
                    <span
                      className="text-[11px] font-bold text-primary select-none whitespace-nowrap absolute bottom-3 left-4"
                      style={{
                        transform: 'rotate(-45deg)',
                        transformOrigin: 'left bottom',
                      }}
                    >
                      {res.name}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-xs">
            {sortedResidents.map(rowRes => {
              const rowStats = rows.find(r => r.id === rowRes.id);
              const diversityScore = rowStats ? rowStats.percent : 0;

               const diversityStyle = getDiversityBadgeStyle(diversityScore);

               return (
                 <tr key={rowRes.id} className="hover:bg-light-1 group transition-colors">
                      {/* Left sticky row header */}
                      <td
                        className="sticky left-0 z-20 border-b border-r p-1 px-2.5 font-medium transition-colors"
                        style={{ 
                          width: colWidth, 
                          minWidth: colWidth, 
                          maxWidth: colWidth,
                          backgroundColor: diversityStyle.backgroundColor,
                          borderBottomColor: diversityStyle.borderColor
                        }}
                        onMouseEnter={(e) => handleRowHeaderEnter(e, rowRes)}
                        onMouseLeave={handleHeaderLeave}
                        onMouseMove={handleHeaderMove}
                      >
                        <div className="flex items-center justify-between w-full gap-2 truncate">
                          <div className="flex flex-col truncate">
                            <span className="text-[11px] font-extrabold text-slate-900 truncate" title={rowRes.name}>
                              {rowRes.name}
                            </span>
                            <span className="text-[9px] text-slate-500 font-bold">
                              PGY-{rowRes.level} {rowRes.cohort !== undefined ? `• Cycle ${rowRes.cohort + 1}` : ''}
                            </span>
                          </div>

                          {/* Diversity Score (Just text, no badge!) */}
                          <span className="text-[10px] font-black text-slate-700 shrink-0">
                            {diversityScore.toFixed(0)}%
                          </span>
                        </div>
                      </td>

                  {/* Grid cells */}
                  {sortedResidents.map(colRes => {
                    const isSelf = rowRes.id === colRes.id;
                    const weeks = matrix[rowRes.id]?.[colRes.id] || 0;
                    const cellText = isSelf ? '-' : String(weeks);
                    const cellStyles = getCellStyles(weeks, isSelf);

                    const isMaxInRow = !isSelf && weeks > 0 && weeks === maxRowWeeksMap[rowRes.id];
                    const isMaxInCol = !isSelf && weeks > 0 && weeks === maxColWeeksMap[colRes.id];

                    const borderStyles: React.CSSProperties = {};
                    if (isMaxInRow) {
                      borderStyles.borderLeft = '2.5px solid #475569';
                      borderStyles.borderRight = '2.5px solid #475569';
                    }
                    if (isMaxInCol) {
                      borderStyles.borderTop = '2.5px solid #475569';
                      borderStyles.borderBottom = '2.5px solid #475569';
                    }

                    return (
                      <td
                        key={colRes.id}
                        className={`border-b text-center cursor-default relative p-0 border-light-3 w-11 min-w-[44px] h-7 ${cellStyles.className}`}
                        style={{ ...cellStyles.style, ...borderStyles }}
                        onMouseEnter={(e) => handleCellEnter(e, rowRes, colRes, weeks)}
                        onMouseLeave={handleCellLeave}
                        onMouseMove={handleCellMove}
                      >
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-[12px] font-extrabold tracking-tight">{cellText}</span>
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

      {/* Floating Resident Diversity Tooltip */}
      {hoveredResidentInfo && (
        <div
          className="fixed z-[999] pointer-events-none bg-slate-900/95 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-2xl text-xs text-white flex flex-col gap-2 max-w-[280px]"
          style={{ left: hoveredResidentInfo.x + 12, top: hoveredResidentInfo.y + 12 }}
        >
          <div className="flex items-center justify-between gap-4 border-b border-slate-700 pb-1.5">
            <div className="font-extrabold text-sm">{hoveredResidentInfo.resident.name}</div>
            <span className="px-1.5 py-0.5 bg-slate-800 text-slate-300 font-extrabold rounded text-[9px]">
              PGY-{hoveredResidentInfo.resident.level}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>Unique Co-workers:</span>
              <span className="font-bold text-white">{hoveredResidentInfo.uniqueCount} / {hoveredResidentInfo.totalPossible}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Diversity:</span>
              <span 
                className="px-1.5 py-0.5 rounded text-[10px] font-black border"
                style={getDiversityBadgeStyle(hoveredResidentInfo.percent)}
              >
                {hoveredResidentInfo.percent.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Top Partner:</span>
              <span className="font-bold text-white truncate max-w-[140px]" title={hoveredResidentInfo.maxOverlapName}>
                {hoveredResidentInfo.maxOverlapName}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 italic mt-1">
              ({hoveredResidentInfo.maxOverlapWeeks} weeks together)
            </div>
          </div>
        </div>
      )}

      {/* Floating Cell Overlap Tooltip */}
      {hoveredCellInfo && (
        <div
          className="fixed z-[999] pointer-events-none bg-slate-900/95 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-2xl text-xs text-white flex flex-col gap-3 min-w-[320px]"
          style={{ left: hoveredCellInfo.x + 12, top: hoveredCellInfo.y + 12 }}
        >
          <div className="flex flex-col gap-1 border-b border-slate-700 pb-2">
            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Shared Overlap</div>
            <div className="font-extrabold text-sm flex items-center justify-between text-emerald-400">
              <span>{hoveredCellInfo.weeksShared} Weeks Shared</span>
              {hoveredCellInfo.rowResident.id === hoveredCellInfo.colResident.id ? null : (
                <span className="text-[10px] text-slate-300 bg-slate-800 px-2 py-0.5 rounded font-bold">
                  Diff: {(hoveredCellInfo.weeksShared - averageSharedWeeks).toFixed(1)}w
                </span>
              )}
            </div>
          </div>
          
          {hoveredCellInfo.rowResident.id === hoveredCellInfo.colResident.id ? (
            <div className="text-slate-400 italic">Self-overlap (same resident)</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {/* Row Resident Stats */}
              <div className="space-y-1">
                <div className="font-bold text-slate-200 truncate">{hoveredCellInfo.rowResident.name.split(' ')[0]} (Row)</div>
                <div className="text-[10px] text-slate-400">
                  Diversity: <span className="font-bold text-white">{(rows.find(r => r.id === hoveredCellInfo.rowResident.id)?.percent || 0).toFixed(0)}%</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Co-workers: <span className="font-bold text-white">{(rows.find(r => r.id === hoveredCellInfo.rowResident.id)?.uniqueCount || 0)}</span>
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  Top: <span className="font-bold text-white">{(rows.find(r => r.id === hoveredCellInfo.rowResident.id)?.maxOverlapName || '-').split(',')[0]}</span>
                </div>
              </div>
              
              {/* Col Resident Stats */}
              <div className="space-y-1">
                <div className="font-bold text-slate-200 truncate">{hoveredCellInfo.colResident.name.split(' ')[0]} (Col)</div>
                <div className="text-[10px] text-slate-400">
                  Diversity: <span className="font-bold text-white">{(rows.find(r => r.id === hoveredCellInfo.colResident.id)?.percent || 0).toFixed(0)}%</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Co-workers: <span className="font-bold text-white">{(rows.find(r => r.id === hoveredCellInfo.colResident.id)?.uniqueCount || 0)}</span>
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  Top: <span className="font-bold text-white">{(rows.find(r => r.id === hoveredCellInfo.colResident.id)?.maxOverlapName || '-').split(',')[0]}</span>
                </div>
              </div>
            </div>
          )}
          
          {hoveredCellInfo.rowResident.id !== hoveredCellInfo.colResident.id && hoveredCellInfo.sharedDetails?.length > 0 && (
            <div className="mt-1 pt-3 border-t border-slate-800">
              <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Shared Assignments</div>
              <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                {Object.entries(
                  hoveredCellInfo.sharedDetails.reduce((acc, curr) => {
                    if (!acc[curr.assignment]) acc[curr.assignment] = [];
                    acc[curr.assignment].push(curr.week + 1); // 1-indexed for display
                    return acc;
                  }, {} as Record<string, number[]>)
                ).map(([assignment, weeks]) => (
                  <div key={assignment} className="flex justify-between items-start gap-3">
                    <span className="font-bold text-slate-200">{assignment}</span>
                    <span className="text-[10px] text-slate-400 text-right leading-tight mt-0.5">
                      Wk {(weeks as number[]).join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-[10px] text-slate-500 border-t border-slate-800 pt-2 mt-1 flex justify-between">
            <span>Average Overlap: {averageSharedWeeks.toFixed(1)} weeks</span>
            {hoveredCellInfo.rowResident.id !== hoveredCellInfo.colResident.id && (
              <span className="font-semibold">
                {hoveredCellInfo.weeksShared > averageSharedWeeks ? 'Above Average' : hoveredCellInfo.weeksShared < averageSharedWeeks ? 'Below Average' : 'On Average'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
RelationshipStats.displayName = 'RelationshipStats';
