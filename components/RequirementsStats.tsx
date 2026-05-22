import React, { useState, useRef, useMemo } from 'react';
import { Resident, ScheduleGrid, ScheduleHistory } from '../types';
import { useProgramData } from '../contexts/ProgramDataContext';
import { RequirementsEngine } from '../services/requirementsEngine';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, ClipboardList, ShieldAlert, ArrowUpDown, LayoutGrid, Users, Settings, ListFilter, HelpCircle } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  residents: Resident[];
  schedule: ScheduleGrid;
  history?: ScheduleHistory;
  activeYear?: number;
}

export const RequirementsStats: React.FC<Props> = React.memo(({ residents, schedule, history, activeYear }) => {
  const programData = useProgramData();
  const hist = history || {};

  // Check if we are in 3-Year Unified view (more than 52 weeks in schedule)
  const isUnified = useMemo(() => {
    const vals = Object.values(schedule);
    return vals.length > 0 ? (vals[0] as any).length > 52 : false;
  }, [schedule]);

  // Filtering requirements by source
  const [sourceFilter, setSourceFilter] = useState<'all' | 'acgme' | 'mhs'>('all');

  // Sorting / Grouping residents (in 1-year view only)
  const [residentSortOrder, setResidentSortOrder] = useState<'pgy' | 'cohort'>('pgy');

  // Draggable Left Column Width State
  const [colWidth, setColWidth] = useState(160);
  const resizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

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
    const newWidth = Math.max(100, Math.min(400, startWidthRef.current + diff));
    setColWidth(newWidth);
  };

  const handleMouseUp = () => {
    resizingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
  };

  // Tooltip state for hovering over grid cells
  const [cellTooltip, setCellTooltip] = useState<{
    x: number;
    y: number;
    residentName: string;
    reqTitle: string;
    source: string;
    actual: number;
    minWeeks: number;
    weeksList: number[];
  } | null>(null);

  // Aux state for collapsing Jeopardy & Deficit Recovery
  const [showAuxAudits, setShowAuxAudits] = useState(true);

  // Filter and sort the column requirements
  const columns = useMemo(() => {
    const reqs = programData.gradRequirements || [];
    let filtered = reqs;
    if (sourceFilter !== 'all') {
      filtered = reqs.filter(r => r.source === sourceFilter);
    }
    // Group by source (acgme first, then mhs/curriculum), then alphabetically by tag title
    return [...filtered].sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return a.tag.title.localeCompare(b.tag.title);
    });
  }, [programData.gradRequirements, sourceFilter]);

  // Sort and group residents dynamically
  const sortedResidents = useMemo(() => {
    if (isUnified) {
      // 3-Year unified view: sorted by matriculation startYear, then cohort, then alphabetically
      return [...residents].sort((a, b) => {
        if (a.startYear !== b.startYear) return a.startYear - b.startYear;
        const cohortA = a.cohort ?? 0;
        const cohortB = b.cohort ?? 0;
        if (cohortA !== cohortB) return cohortA - cohortB;
        return a.name.localeCompare(b.name);
      });
    }

    // 1-Year view: sorted dynamically based on user toggle
    return [...residents].sort((a, b) => {
      if (residentSortOrder === 'pgy') {
        const pgyA = activeYear! - a.startYear + 1;
        const pgyB = activeYear! - b.startYear + 1;
        if (pgyA !== pgyB) return pgyA - pgyB;
        const cohortA = a.cohort ?? 0;
        const cohortB = b.cohort ?? 0;
        if (cohortA !== cohortB) return cohortA - cohortB;
        return a.name.localeCompare(b.name);
      } else {
        const cohortA = a.cohort ?? 0;
        const cohortB = b.cohort ?? 0;
        if (cohortA !== cohortB) return cohortA - cohortB;
        const pgyA = activeYear! - a.startYear + 1;
        const pgyB = activeYear! - b.startYear + 1;
        if (pgyA !== pgyB) return pgyA - pgyB;
        return a.name.localeCompare(b.name);
      }
    });
  }, [residents, isUnified, residentSortOrder, activeYear]);

  // Pre-calculate cells and values for each resident/requirement
  const cellCalculations = useMemo(() => {
    const calcs: Record<string, Record<number, { actual: number; minWeeks: number; weeksList: number[] }>> = {};

    sortedResidents.forEach(res => {
      calcs[res.id] = {};
      const level = activeYear! - res.startYear + 1;

      columns.forEach(req => {
        const isACGME = req.source === 'acgme';
        let minWeeks = 0;
        let actual = 0;

        if (isUnified) {
          minWeeks = req.minimum || 0;
          actual = RequirementsEngine.getActualWeeks(
            res,
            req.tag.title,
            schedule,
            hist,
            activeYear!,
            res.startYear + 2,
            true,
            programData
          );
        } else {
          if (isACGME) {
            minWeeks = (req.pgy1Ideal || 0) + (level >= 2 ? (req.pgy2Ideal || 0) : 0) + (level >= 3 ? (req.pgy3Ideal || 0) : 0);
            actual = RequirementsEngine.getActualWeeks(
              res,
              req.tag.title,
              schedule,
              hist,
              activeYear!,
              activeYear!,
              true,
              programData
            );
          } else {
            minWeeks = (level === 1 ? req.pgy1Ideal : (level === 2 ? req.pgy2Ideal : req.pgy3Ideal)) || 0;
            actual = RequirementsEngine.getActualWeeks(
              res,
              req.tag.title,
              schedule,
              hist,
              activeYear!,
              activeYear!,
              false,
              programData
            );
          }
        }

        // Collect exact week indexes (1-based relative to start of unified grid) for tooltips
        const weeksList: number[] = [];
        const resGrid = schedule[res.id] || [];
        const numYears = Math.ceil(resGrid.length / 52);

        for (let yearIdx = 0; yearIdx < numYears; yearIdx++) {
          const year = activeYear! + yearIdx;
          if ((isUnified && year <= res.startYear + 2) || (!isUnified && year === activeYear)) {
            const yearStart = yearIdx * 52;
            const yearCells = resGrid.slice(yearStart, yearStart + 52);
            yearCells.forEach((c, idx) => {
              if (c?.assignment && RequirementsEngine.fulfills(c.assignment, req.tag.title, programData)) {
                weeksList.push(yearStart + idx + 1);
              }
            });
          }
        }

        calcs[res.id][req.id] = { actual, minWeeks, weeksList };
      });
    });

    return calcs;
  }, [sortedResidents, columns, schedule, hist, activeYear, isUnified, programData]);

  // Handle cell enter for tooltips
  const handleCellEnter = (e: React.MouseEvent, res: Resident, req: any) => {
    const calc = cellCalculations[res.id]?.[req.id] || { actual: 0, minWeeks: 0, weeksList: [] };
    const rect = (e.target as HTMLElement).getBoundingClientRect();

    setCellTooltip({
      x: rect.left + window.scrollX + rect.width / 2,
      y: rect.top + window.scrollY,
      residentName: res.name,
      reqTitle: req.tag.title,
      source: req.source,
      actual: calc.actual,
      minWeeks: calc.minWeeks,
      weeksList: calc.weeksList
    });
  };

  // Jeopardy monitoring gaps calculation
  const jeopardyGapWeeks = useMemo(() => {
    if (activeYear === undefined) return [];
    const gaps: number[] = [];
    const totalWeeks = (Object.values(schedule)[0] as any[])?.length || 52;

    for (let w = 0; w < totalWeeks; w++) {
      let pgy2Flexible = 0;
      let pgy3Flexible = 0;

      residents.forEach(res => {
        const currentYear = activeYear + Math.floor(w / 52);
        const pgy = currentYear - res.startYear + 1;
        const cell = schedule[res.id]?.[w];
        if (!cell || !cell.assignment) return;

        if (RequirementsEngine.isJeopardyBlock(cell.assignment, programData)) {
          if (pgy === 2) pgy2Flexible++;
          if (pgy === 3) pgy3Flexible++;
        }
      });

      if (pgy2Flexible === 0 || pgy3Flexible === 0) gaps.push(w + 1);
    }
    return gaps;
  }, [residents, schedule, activeYear, programData]);

  // Deficit recovery audits calculation
  const auditData = useMemo(() => {
    if (activeYear === undefined) return [];
    return residents.map(r => {
      const currentPgy = activeYear - r.startYear + 1;
      const unifiedGrid = schedule[r.id] || [];
      const activeYearWeeks = unifiedGrid.slice(0, 52);

      const hasSplitBlockDeficit = RequirementsEngine.getViolations([r], schedule, hist, activeYear!, programData)
        .some(v => v.year === activeYear && ['Neuro', 'GI', 'Pulm'].includes(v.type));

      const hasElectiveToOverwrite = activeYearWeeks.some(c => c && c.assignment === 'ELEC');

      return {
        ...r,
        hasSplitBlockDeficit,
        hasElectiveToOverwrite,
        pgy: currentPgy
      };
    });
  }, [residents, hist, schedule, activeYear, programData]);

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden relative">
      {/* Top Header Toolbar */}
      <div className="p-4 bg-light-1 border-b flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-primary flex items-center gap-2">
            <ClipboardList size={20} className="text-blue" />
            {isUnified ? '3-Year Graduation Requirements Grid' : 'Annual Educational Requirements Grid'}
          </h2>
          <p className="text-xs text-muted mt-0.5">
            {isUnified
              ? 'Tracking cumulative 3-year minimum ACGME & program graduation rules overall.'
              : 'Tracking single-year educational requirement targets and annual curriculum ideals.'}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Filter by Source */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-muted uppercase tracking-wider flex items-center gap-1">
              <ListFilter size={12} />
              Filter Source
            </span>
            <div className="flex bg-light-2 p-0.5 rounded-lg border border-light-5">
              <Button
                variant="ghost"
                onClick={() => setSourceFilter('all')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${sourceFilter === 'all' ? 'bg-white text-blue shadow-sm border border-light-5' : 'text-muted hover:text-primary'}`}
              >
                All
              </Button>
              <Button
                variant="ghost"
                onClick={() => setSourceFilter('acgme')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${sourceFilter === 'acgme' ? 'bg-white text-blue shadow-sm border border-light-5' : 'text-muted hover:text-primary'}`}
              >
                ACGME
              </Button>
              <Button
                variant="ghost"
                onClick={() => setSourceFilter('mhs')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${sourceFilter === 'mhs' ? 'bg-white text-blue shadow-sm border border-light-5' : 'text-muted hover:text-primary'}`}
              >
                Curriculum
              </Button>
            </div>
          </div>

          {/* Group / Sort By Toggle (Only visible in 1-year view) */}
          {!isUnified && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-muted uppercase tracking-wider flex items-center gap-1">
                <ArrowUpDown size={12} />
                Group Rows
              </span>
              <div className="flex bg-light-2 p-0.5 rounded-lg border border-light-5">
                <Button
                  variant="ghost"
                  onClick={() => setResidentSortOrder('pgy')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${residentSortOrder === 'pgy' ? 'bg-white text-blue shadow-sm border border-light-5' : 'text-muted hover:text-primary'}`}
                >
                  PGY Level
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setResidentSortOrder('cohort')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${residentSortOrder === 'cohort' ? 'bg-white text-blue shadow-sm border border-light-5' : 'text-muted hover:text-primary'}`}
                >
                  Cohort
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Spreadsheet grid */}
      <div className="flex-1 overflow-auto spreadsheet-container">
        <table className="border-separate border-spacing-0 w-max">
          <thead className="sticky top-0 z-30 bg-light-1 text-xs text-muted font-semibold h-24 shadow-sm select-none">
            <tr>
              <th
                className="sticky left-0 z-40 bg-light-1/90 backdrop-blur-md border-b border-r p-0 text-left transition-all"
                style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
              >
                <div className="flex items-center justify-between h-full px-3 py-2 relative">
                  <span className="truncate pr-2 font-bold text-primary">Resident</span>
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue active:bg-blue transition-colors z-50"
                    onMouseDown={startResize}
                  />
                </div>
              </th>
              {columns.map(req => (
                <th key={req.id} className="border-b border-light-5 w-24 min-w-[96px] h-24 p-2 bg-light-1 relative text-center">
                  <div className="h-full flex flex-col justify-end items-center gap-1.5 pb-2">
                    <span
                      className={`px-1.5 py-0.5 rounded-[4px] text-[8px] font-black uppercase tracking-wider ${req.source === 'acgme' ? 'bg-blue/15 text-blue' : 'bg-emerald-500/15 text-emerald-700'}`}
                    >
                      {req.source === 'acgme' ? 'ACGME' : 'Curriculum'}
                    </span>
                    <span className="text-[11px] font-bold text-slate-800 tracking-tight leading-tight line-clamp-2 max-w-[80px]">
                      {req.tag.title}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-xs">
            {sortedResidents.map(res => {
              return (
                <tr key={res.id} className="hover:bg-light-1 group transition-colors">
                  {/* Left row header: matches schedule screen name cell structure */}
                  <td
                    className="sticky left-0 z-20 bg-white/80 backdrop-blur-md border-b border-r p-2 font-medium text-black group bg-white/80 backdrop-blur-md transition-colors"
                    style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                  >
                    <div className="flex flex-col truncate justify-center">
                      <span className="flex items-center gap-2 truncate font-bold text-slate-800" title={res.name}>
                        {res.name}
                      </span>
                    </div>
                  </td>
                  {columns.map(req => {
                    const calc = cellCalculations[res.id]?.[req.id] || { actual: 0, minWeeks: 0, weeksList: [] };
                    const { actual, minWeeks } = calc;

                    // Style dynamically
                    let cellStyle: React.CSSProperties = {};
                    let cellText = `${actual} / ${minWeeks}`;
                    let textClass = 'text-slate-700';
                    let cellBgClass = 'bg-white';

                    if (minWeeks === 0) {
                      cellText = '-';
                      textClass = 'text-slate-400 font-normal';
                    } else if (actual >= minWeeks) {
                      // Compliant / Met (Green)
                      cellBgClass = 'bg-emerald-50 text-emerald-800 border-b border-emerald-100 font-bold';
                    } else {
                      // Deficit / Unmet
                      if (isUnified) {
                        // 3-Year view: failed hard minimum (Rose/Red)
                        cellBgClass = 'bg-rose-50 text-rose-800 border-b border-rose-100 font-bold';
                      } else {
                        // 1-Year view: unsatisfied soft ideal (Orange)
                        cellBgClass = 'bg-orange-50 text-orange-800 border-b border-orange-100 font-bold';
                      }
                    }

                    return (
                      <td
                        key={req.id}
                        className={`border-b text-center cursor-default relative p-0 border-light-3 w-24 min-w-[96px] h-10 ${cellBgClass}`}
                        onMouseEnter={(e) => handleCellEnter(e, res, req)}
                        onMouseLeave={() => setCellTooltip(null)}
                      >
                        <div className="w-full h-full flex flex-col items-center justify-center relative">
                          <span className={`text-[11px] font-black ${textClass}`}>{cellText}</span>
                          {/* Mini visual indicator under text for active requirements */}
                          {minWeeks > 0 && (
                            <div className="absolute bottom-1 left-2 right-2 h-[2px] bg-slate-200/50 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${actual >= minWeeks ? 'bg-emerald-500' : isUnified ? 'bg-rose-500' : 'bg-orange-500'}`}
                                style={{ width: `${Math.min(100, (actual / minWeeks) * 100)}%` }}
                              />
                            </div>
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

      {/* Auxiliary Safety & Deficit Audits Toolbar / Panels */}
      <div className="bg-light-2 border-t px-6 py-3 flex items-center justify-between shrink-0 select-none">
        <button
          onClick={() => setShowAuxAudits(!showAuxAudits)}
          className="flex items-center gap-2 text-xs font-bold text-primary hover:text-blue transition-colors focus:outline-none"
        >
          <Info size={14} className="text-blue" />
          <span>Auxiliary Safety & Deficit Audits</span>
          <span className="text-[10px] text-muted font-normal bg-light-4 px-1.5 py-0.5 rounded-full ml-1">
            {jeopardyGapWeeks.length > 0 ? `${jeopardyGapWeeks.length} Jeopardy Gaps` : 'All Jeopardy Gaps Covered'}
          </span>
        </button>
        <span className="text-[9px] font-mono text-muted uppercase tracking-wider">
          Double check all constraints before finalizing
        </span>
      </div>

      {/* Auxiliary Audits Cards */}
      {showAuxAudits && (
        <div className="border-t bg-light-1/40 p-4 max-h-[300px] overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Jeopardy coverage monitoring card */}
            <div className="bg-white rounded-xl shadow-sm border border-light-5 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-orange" />
                  Jeopardy Coverage Monitor
                </h4>
                {jeopardyGapWeeks.length === 0 ? (
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-700 text-[10px] font-bold rounded-md">
                    Secure
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-rose-500/10 text-rose-700 text-[10px] font-bold rounded-md">
                    Deficit ({jeopardyGapWeeks.length} weeks)
                  </span>
                )}
              </div>

              {jeopardyGapWeeks.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted">
                    The following weeks lack minimum senior backup (at least 1 PGY-2 AND 1 PGY-3 on flexible/jeopardy):
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1 max-h-[120px] overflow-y-auto">
                    {jeopardyGapWeeks.map(w => (
                      <span key={w} className="px-1.5 py-0.5 bg-orange text-white text-[9px] font-mono font-bold rounded">
                        Wk {w}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted leading-relaxed">
                  All scheduled weeks satisfy the senior jeopardy coverage criteria (1 PGY-2 senior backup AND 1 PGY-3 senior backup).
                </p>
              )}
            </div>

            {/* Split Block Deficit recovery monitor card */}
            <div className="bg-white rounded-xl shadow-sm border border-light-5 p-4 flex flex-col gap-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-blue" />
                Subspecialty Deficit Recovery
              </h4>
              <div className="max-h-[150px] overflow-y-auto divide-y divide-light-3">
                {auditData.map(d => (
                  <div key={d.id} className="py-2 flex items-center justify-between text-xs first:pt-0 last:pb-0">
                    <span className="font-semibold text-slate-700">{d.name} <span className="text-[10px] text-muted">(PGY-{d.pgy})</span></span>
                    <div>
                      {d.hasSplitBlockDeficit ? (
                        d.hasElectiveToOverwrite ? (
                          <span className="px-2 py-0.5 bg-blue/10 text-blue font-bold rounded text-[9px] uppercase tracking-wide">
                            Auto-recovery active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-rose-500/10 text-rose-700 font-bold rounded text-[9px] uppercase tracking-wide">
                            Needs intervention
                          </span>
                        )
                      ) : (
                        <span className="text-emerald-700 text-[10px]">No deficits</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hover Floating Tooltip */}
      {cellTooltip && (
        <div
          className="fixed z-[200] bg-slate-900 text-white text-xs rounded-xl py-3 px-4 shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full mt-[-10px] min-w-[200px] border border-slate-750"
          style={{ left: cellTooltip.x, top: cellTooltip.y }}
        >
          <div className="font-black text-sm border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between gap-4">
            <span className="text-white truncate">{cellTooltip.residentName}</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${cellTooltip.source === 'acgme' ? 'bg-blue text-white' : 'bg-emerald-600 text-white'}`}
            >
              {cellTooltip.source === 'acgme' ? 'ACGME' : 'Curriculum'}
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between gap-4 text-[11px]">
              <span className="text-slate-400">Requirement:</span>
              <span className="font-bold text-slate-200">{cellTooltip.reqTitle}</span>
            </div>
            <div className="flex justify-between gap-4 text-[11px]">
              <span className="text-slate-400">Progress:</span>
              <span className="font-bold text-slate-100">
                {cellTooltip.actual} / {cellTooltip.minWeeks} weeks
              </span>
            </div>
            <div className="flex justify-between gap-4 text-[11px] pt-1">
              <span className="text-slate-400">Compliance Status:</span>
              {cellTooltip.minWeeks === 0 ? (
                <span className="text-slate-500 font-semibold">Not Applicable</span>
              ) : cellTooltip.actual >= cellTooltip.minWeeks ? (
                <span className="text-emerald-400 font-black flex items-center gap-1">Met ✅</span>
              ) : isUnified ? (
                <span className="text-rose-400 font-black flex items-center gap-1">Violated ❌</span>
              ) : (
                <span className="text-orange-400 font-black flex items-center gap-1">Unmet Target ⚠️</span>
              )}
            </div>

            {/* List of assigned weeks */}
            {cellTooltip.weeksList.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-slate-800">
                <div className="text-[8px] uppercase text-slate-400 font-black tracking-wider mb-1">
                  Scheduled Weeks ({cellTooltip.weeksList.length}w)
                </div>
                <div className="flex flex-wrap gap-1 max-w-[210px] max-h-[80px] overflow-y-auto">
                  {cellTooltip.weeksList.map(w => (
                    <span key={w} className="bg-slate-800 text-slate-350 px-1.5 py-0.5 rounded text-[9px] font-mono">
                      Wk {w}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tooltip caret */}
          <div className="absolute left-1/2 -bottom-1 w-2.5 h-2.5 bg-slate-900 border-r border-b border-slate-800/20 transform -translate-x-1/2 rotate-45" />
        </div>
      )}
    </div>
  );
});
