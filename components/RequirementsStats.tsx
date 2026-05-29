import React, { useState, useRef, useMemo } from 'react';
import { Resident, ScheduleGrid, ScheduleHistory } from '../types';
import { useProgramData } from '../contexts/ProgramDataContext';
import { RequirementsEngine } from '../services/requirementsEngine';
import { ClipboardList, ArrowUpDown, ListFilter } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  residents: Resident[];
  schedule: ScheduleGrid;
  history?: ScheduleHistory;
  activeYear?: number;
  startYear?: number;
}

export const RequirementsStats: React.FC<Props> = React.memo(({ residents, schedule, history, activeYear, startYear }) => {
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
  const [residentSortOrder, setResidentSortOrder] = useState<'pgy' | 'cycle'>('cycle');

  // Draggable Left Column Width State
  const [colWidth, setColWidth] = useState(180);
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
    const newWidth = Math.max(120, Math.min(400, startWidthRef.current + diff));
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
  } | null>(null);

  // Tooltip state for hovering over requirement row headers
  const [rowTooltip, setRowTooltip] = useState<{
    x: number;
    y: number;
    reqTitle: string;
    source: string;
    minimum: number | null;
    pgy1Ideal: number | null;
    pgy2Ideal: number | null;
    pgy3Ideal: number | null;
    totalBurden: number;
    internBurden: number;
    seniorBurden: number;
    isCumulative: boolean;
  } | null>(null);

  // Tooltip state for hovering over resident column headers
  const [colTooltip, setColTooltip] = useState<{
    x: number;
    y: number;
    residentName: string;
    deficits: { reqTitle: string; expected: number; actual: number; deficit: number }[];
  } | null>(null);

  // Filter and sort the rows of requirements
  const columns = useMemo(() => {
    const reqs = programData.requirements || [];
    let filtered = reqs;
    if (sourceFilter !== 'all') {
      filtered = reqs.filter(r => r.source === sourceFilter);
    }
    // Group by source (acgme first, then mhs/curriculum), then alphabetically by tag title
    return [...filtered].sort((a, b) => {
      if (a.source !== b.source) return a.source.localeCompare(b.source);
      return a.tag.title.localeCompare(b.tag.title);
    });
  }, [programData.requirements, sourceFilter]);

  const getCohortSortValue = (cohort: number, year: number) => {
    const { Y, Z } = programData.cycleConfig;
    const startYr = startYear ?? 2025;
    const startWeek = (year - startYr) * 52;
    const startingCohort = Math.floor((startWeek % Z) / Y);
    return (cohort - startingCohort + Z) % Z;
  };

  // Sort and group residents dynamically (they represent the columns now)
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
    const currentYr = activeYear ?? 2025;
    return [...residents].sort((a, b) => {
      if (residentSortOrder === 'pgy') {
        const pgyA = currentYr - a.startYear + 1;
        const pgyB = currentYr - b.startYear + 1;
        if (pgyA !== pgyB) return pgyB - pgyA; // Highest PGY first
        const cohortSortA = getCohortSortValue(a.cohort ?? 0, currentYr);
        const cohortSortB = getCohortSortValue(b.cohort ?? 0, currentYr);
        if (cohortSortA !== cohortSortB) return cohortSortA - cohortSortB;
        return a.name.localeCompare(b.name);
      } else {
        const cohortSortA = getCohortSortValue(a.cohort ?? 0, currentYr);
        const cohortSortB = getCohortSortValue(b.cohort ?? 0, currentYr);
        if (cohortSortA !== cohortSortB) return cohortSortA - cohortSortB;
        const pgyA = currentYr - a.startYear + 1;
        const pgyB = currentYr - b.startYear + 1;
        if (pgyA !== pgyB) return pgyB - pgyA; // Highest PGY first
        return a.name.localeCompare(b.name);
      }
    });
  }, [residents, isUnified, residentSortOrder, activeYear, startYear, programData]);

  // Pre-calculate cells and values for each resident/requirement
  const cellCalculations = useMemo(() => {
    const calcs: Record<string, Record<number, { actual: number; minWeeks: number; weeksList: number[] }>> = {};

    sortedResidents.forEach(res => {
      calcs[res.id] = {};
      const level = activeYear! - res.startYear + 1;

      columns.forEach(req => {
        const isCumulative = req.isCumulative;
        let minWeeks = 0;
        let actual = 0;

        if (isUnified) {
          const lastActiveYear = Math.min(res.startYear + 2, activeYear! + 2);
          const lastLevel = lastActiveYear - res.startYear + 1;
          minWeeks = lastLevel >= 3 
            ? (req.minimum || 0)
            : (req.pgy1Ideal || 0) + (lastLevel >= 2 ? (req.pgy2Ideal || 0) : 0);

          actual = RequirementsEngine.getActualWeeks(
            res,
            req.tag.title,
            schedule,
            hist,
            activeYear!,
            lastActiveYear,
            true,
            programData
          );
        } else {
          if (isCumulative) {
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
          const lastActiveYear = isUnified ? Math.min(res.startYear + 2, activeYear! + 2) : activeYear!;
          if ((isUnified && year <= lastActiveYear) || (!isUnified && year === activeYear)) {
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

  // Calculate Mutually Exclusive Flexibility Stats
  const flexibilityStats = useMemo(() => {
    // Helper to calculate MWIS for a given weight accessor
    const getMWIS = (getWeight: (r: any) => number) => {
      const reqs = (programData.requirements || []).filter(r => getWeight(r) > 0);
      if (reqs.length === 0) return 0;
      
      // Compute overlapping requirements
      const overlaps = new Map<number, Set<number>>();
      reqs.forEach(r => overlaps.set(r.id, new Set()));
      const rotations = Array.from(programData.rotationTags?.keys() || []);
      
      for (let i = 0; i < reqs.length; i++) {
        for (let j = i + 1; j < reqs.length; j++) {
          let overlap = false;
          for (const rot of rotations) {
            if (RequirementsEngine.fulfills(rot, reqs[i].tag.title, programData) && 
                RequirementsEngine.fulfills(rot, reqs[j].tag.title, programData)) {
              overlap = true;
              break;
            }
          }
          if (overlap) {
            overlaps.get(reqs[i].id)!.add(reqs[j].id);
            overlaps.get(reqs[j].id)!.add(reqs[i].id);
          }
        }
      }

      // Branch and bound MWIS
      let maxWeight = 0;
      const sortedReqs = [...reqs].sort((a, b) => getWeight(b) - getWeight(a));
      
      const search = (index: number, currentWeight: number, allowed: Set<number>) => {
        if (index === sortedReqs.length) {
          if (currentWeight > maxWeight) maxWeight = currentWeight;
          return;
        }

        const req = sortedReqs[index];
        let maxPossible = currentWeight;
        for (let i = index; i < sortedReqs.length; i++) {
          if (allowed.has(sortedReqs[i].id)) maxPossible += getWeight(sortedReqs[i]);
        }
        if (maxPossible <= maxWeight) return; // prune

        // Do not include
        search(index + 1, currentWeight, allowed);

        // Include if allowed
        if (allowed.has(req.id)) {
          const newAllowed = new Set(allowed);
          overlaps.get(req.id)!.forEach(c => newAllowed.delete(c));
          search(index + 1, currentWeight + getWeight(req), newAllowed);
        }
      };

      search(0, 0, new Set(sortedReqs.map(r => r.id)));
      return maxWeight;
    };

    let requiredInternWeeks = 0;
    let requiredSeniorWeeks = 0;

    sortedResidents.forEach(res => {
      if (isUnified) {
        requiredInternWeeks += getMWIS(req => req.pgy1Ideal || 0);
        requiredSeniorWeeks += getMWIS(req => (req.pgy2Ideal || 0) + (req.pgy3Ideal || 0));
      } else {
        const pgy = activeYear! - res.startYear + 1;
        if (pgy === 1) {
          requiredInternWeeks += getMWIS(req => req.pgy1Ideal || 0);
        } else if (pgy === 2) {
          requiredSeniorWeeks += getMWIS(req => req.pgy2Ideal || 0);
        } else if (pgy >= 3) {
          requiredSeniorWeeks += getMWIS(req => req.pgy3Ideal || 0);
        }
      }
    });

    const numInterns = sortedResidents.filter(r => isUnified || (activeYear! - r.startYear + 1) === 1).length;
    const numSeniors = sortedResidents.filter(r => isUnified || (activeYear! - r.startYear + 1) > 1).length;

    const internAvailable = numInterns * (isUnified ? 52 : 52);
    const seniorAvailable = numSeniors * (isUnified ? 104 : 52);

    const internFlexibility = internAvailable - requiredInternWeeks;
    const seniorFlexibility = seniorAvailable - requiredSeniorWeeks;
    
    return {
      requiredInternWeeks,
      requiredSeniorWeeks,
      totalRequired: requiredInternWeeks + requiredSeniorWeeks,
      internAvailable,
      seniorAvailable,
      totalAvailable: internAvailable + seniorAvailable,
      internFlexibility,
      seniorFlexibility,
      totalFlexibility: internFlexibility + seniorFlexibility,
    };
  }, [sortedResidents, isUnified, activeYear, programData]);

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

  const handleRowEnter = (e: React.MouseEvent, req: any) => {
    let internBurden = 0;
    let seniorBurden = 0;
    let totalBurden = 0;

    sortedResidents.forEach(res => {
      const minWk = cellCalculations[res.id]?.[req.id]?.minWeeks || 0;
      totalBurden += minWk;
      
      if (isUnified) {
        const lastActiveYear = Math.min(res.startYear + 2, activeYear! + 2);
        for (let y = activeYear!; y <= lastActiveYear; y++) {
          const lvl = y - res.startYear + 1;
          if (lvl === 1) internBurden += (req.pgy1Ideal || 0);
          else if (lvl === 2) seniorBurden += (req.pgy2Ideal || 0);
          else if (lvl === 3) seniorBurden += (req.pgy3Ideal || 0);
        }
      } else {
        const level = activeYear! - res.startYear + 1;
        if (level === 1) internBurden += minWk;
        else seniorBurden += minWk;
      }
    });

    // Calculate position based on the td element
    const tdElement = (e.currentTarget as HTMLElement);
    const rect = tdElement.getBoundingClientRect();

    setRowTooltip({
      x: rect.right + window.scrollX + 10,
      y: rect.top + window.scrollY + rect.height / 2,
      reqTitle: req.tag.title,
      source: req.source,
      minimum: req.minimum || null,
      pgy1Ideal: req.pgy1Ideal || null,
      pgy2Ideal: req.pgy2Ideal || null,
      pgy3Ideal: req.pgy3Ideal || null,
      isCumulative: req.isCumulative,
      totalBurden,
      internBurden,
      seniorBurden
    });
  };

  const handleColEnter = (e: React.MouseEvent, res: Resident) => {
    // Only check deficits for PGY-2+ (level > 1)
    const incomingLevel = activeYear! - res.startYear + 1;
    const deficits: { reqTitle: string; expected: number; actual: number; deficit: number }[] = [];
    
    if (incomingLevel > 1) {
      columns.forEach(req => {
        // Calculate expected past weeks based on ideals
        const expectedPast = (req.pgy1Ideal || 0) + (incomingLevel >= 3 ? (req.pgy2Ideal || 0) : 0);
        
        if (expectedPast > 0) {
          // Calculate actual past weeks from history
          let actualPast = 0;
          Object.keys(hist).forEach(yStr => {
            const y = parseInt(yStr);
            if (y < activeYear!) {
              const yearCells = hist[y]?.[res.id] || [];
              actualPast += yearCells.filter(c => c?.assignment && RequirementsEngine.fulfills(c.assignment, req.tag.title, programData)).length;
            }
          });
          
          if (actualPast < expectedPast) {
            deficits.push({
              reqTitle: req.tag.title,
              expected: expectedPast,
              actual: actualPast,
              deficit: expectedPast - actualPast
            });
          }
        }
      });
    }

    // Sort deficits by size descending
    deficits.sort((a, b) => b.deficit - a.deficit);

    const thElement = (e.currentTarget as HTMLElement);
    const rect = thElement.getBoundingClientRect();

    setColTooltip({
      x: rect.left + window.scrollX + rect.width / 2,
      y: rect.bottom + window.scrollY + 10,
      residentName: res.name,
      deficits
    });
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden relative">
      {/* Top Header Toolbar */}
      <div className="p-4 bg-light-1 border-b flex flex-wrap items-center justify-between gap-4 shrink-0">
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
                Group Columns
              </span>
              <div className="flex bg-light-2 p-0.5 rounded-lg border border-light-5">
                <Button
                  variant="ghost"
                  onClick={() => setResidentSortOrder('cycle')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${residentSortOrder === 'cycle' ? 'bg-white text-blue shadow-sm border border-light-5' : 'text-muted hover:text-primary'}`}
                >
                  Cycle
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setResidentSortOrder('pgy')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${residentSortOrder === 'pgy' ? 'bg-white text-blue shadow-sm border border-light-5' : 'text-muted hover:text-primary'}`}
                >
                  PGY
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Spreadsheet grid */}
      <div className="flex-1 overflow-auto spreadsheet-container">
        <table className="border-separate border-spacing-0 w-max">
          <thead className="sticky top-0 z-30 bg-light-1 text-xs text-muted font-semibold h-28 shadow-sm select-none">
            <tr>
              <th
                className="sticky left-0 z-40 bg-light-1/90 backdrop-blur-md border-b border-r p-0 text-left transition-all"
                style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth, zIndex: 150 }}
              >
                <div className="flex items-center justify-between h-full px-3 py-2 relative">
                  <span className="truncate pr-2 font-bold text-primary">Requirement</span>
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
                  onMouseEnter={(e) => handleColEnter(e, res)}
                  onMouseLeave={() => setColTooltip(null)}
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
            {columns.map(req => {
              return (
                <tr key={req.id} className="hover:bg-light-1 group transition-colors">
                  {/* Left row header: matches schedule screen name cell structure */}
                  <td
                    className="sticky left-0 z-20 bg-light-1/90 backdrop-blur-md border-b border-r p-1 px-2 font-medium text-black transition-colors"
                    style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                    onMouseEnter={(e) => handleRowEnter(e, req)}
                    onMouseLeave={() => setRowTooltip(null)}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={`px-1 py-0.2 rounded text-[7px] font-black uppercase tracking-wider shrink-0 ${req.source === 'acgme' ? 'bg-blue/15 text-blue' : 'bg-emerald-500/15 text-emerald-700'}`}
                      >
                        {req.source === 'acgme' ? 'ACGME' : 'CURR'}
                      </span>
                      <span className="text-[11px] font-bold text-slate-800 tracking-tight leading-tight truncate" title={req.tag.title}>
                        {req.tag.title}
                      </span>
                    </div>
                  </td>
                  {sortedResidents.map(res => {
                    const calc = cellCalculations[res.id]?.[req.id] || { actual: 0, minWeeks: 0, weeksList: [] };
                    const { actual, minWeeks } = calc;

                    // Style dynamically
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
                        key={res.id}
                        className={`border-b text-center cursor-default relative p-0 border-light-3 w-11 min-w-[44px] h-7 ${cellBgClass}`}
                        onMouseEnter={(e) => handleCellEnter(e, res, req)}
                        onMouseLeave={() => setCellTooltip(null)}
                      >
                        <div className="w-full h-full flex items-center justify-center">
                          <span className={`text-[12px] font-extrabold tracking-tight ${textClass}`}>{cellText}</span>
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

      {/* Bottom Flexibility Totals Section */}
      <div className="bg-slate-50 border-t border-light-5 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500">Curriculum Flexibility Analysis</span>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200 text-slate-600">Mutually Exclusive Blocks Only</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-light-5 rounded flex flex-col p-2 shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Intern Weeks</span>
            <div className="flex justify-between items-end mt-1">
              <span className="text-sm font-black text-slate-700">{flexibilityStats.requiredInternWeeks} <span className="text-[10px] font-medium text-slate-400">/ {flexibilityStats.internAvailable}</span></span>
              <span className={`text-xs font-bold ${flexibilityStats.internFlexibility >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {flexibilityStats.internFlexibility >= 0 ? '+' : ''}{flexibilityStats.internFlexibility} flex
              </span>
            </div>
          </div>
          <div className="bg-white border border-light-5 rounded flex flex-col p-2 shadow-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Senior Weeks</span>
            <div className="flex justify-between items-end mt-1">
              <span className="text-sm font-black text-slate-700">{flexibilityStats.requiredSeniorWeeks} <span className="text-[10px] font-medium text-slate-400">/ {flexibilityStats.seniorAvailable}</span></span>
              <span className={`text-xs font-bold ${flexibilityStats.seniorFlexibility >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {flexibilityStats.seniorFlexibility >= 0 ? '+' : ''}{flexibilityStats.seniorFlexibility} flex
              </span>
            </div>
          </div>
          <div className="bg-slate-100 border border-slate-200 rounded flex flex-col p-2 shadow-sm">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Total Program</span>
            <div className="flex justify-between items-end mt-1">
              <span className="text-sm font-black text-slate-800">{flexibilityStats.totalRequired} <span className="text-[10px] font-medium text-slate-400">/ {flexibilityStats.totalAvailable}</span></span>
              <span className={`text-xs font-bold ${flexibilityStats.totalFlexibility >= 0 ? 'text-blue' : 'text-rose-600'}`}>
                {flexibilityStats.totalFlexibility >= 0 ? '+' : ''}{flexibilityStats.totalFlexibility} flex
              </span>
            </div>
          </div>
        </div>
      </div>


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

      {/* Row Header Hover Floating Tooltip */}
      {rowTooltip && (
        <div
          className="fixed z-[200] bg-slate-900 text-white text-xs rounded-xl py-3 px-4 shadow-xl pointer-events-none transform -translate-y-1/2 min-w-[220px] border border-slate-750"
          style={{ left: rowTooltip.x, top: rowTooltip.y }}
        >
          <div className="font-black text-sm border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between gap-4">
            <span className="text-white truncate">{rowTooltip.reqTitle}</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${rowTooltip.source === 'acgme' ? 'bg-blue text-white' : 'bg-emerald-600 text-white'}`}
            >
              {rowTooltip.source === 'acgme' ? 'ACGME' : 'Curriculum'}
            </span>
          </div>

          <div className="space-y-1">
            <div className="text-slate-400 font-semibold mb-2">Requirement Details:</div>
            
            {rowTooltip.minimum !== null && rowTooltip.minimum > 0 && (
              <div className="flex justify-between gap-4 text-[11px]">
                <span className="text-slate-400">Graduation Min:</span>
                <span className="font-bold text-slate-100">{rowTooltip.minimum} weeks</span>
              </div>
            )}
            
            {rowTooltip.pgy1Ideal !== null && rowTooltip.pgy1Ideal > 0 && (
              <div className="flex justify-between gap-4 text-[11px]">
                <span className="text-slate-400">PGY-1 Target:</span>
                <span className="font-bold text-slate-200">{rowTooltip.pgy1Ideal} weeks</span>
              </div>
            )}
            
            {rowTooltip.pgy2Ideal !== null && rowTooltip.pgy2Ideal > 0 && (
              <div className="flex justify-between gap-4 text-[11px]">
                <span className="text-slate-400">PGY-2 Target:</span>
                <span className="font-bold text-slate-200">{rowTooltip.pgy2Ideal} weeks</span>
              </div>
            )}
            
            {rowTooltip.pgy3Ideal !== null && rowTooltip.pgy3Ideal > 0 && (
              <div className="flex justify-between gap-4 text-[11px]">
                <span className="text-slate-400">PGY-3 Target:</span>
                <span className="font-bold text-slate-200">{rowTooltip.pgy3Ideal} weeks</span>
              </div>
            )}

            <div className="mt-2.5 pt-2 border-t border-slate-800 space-y-1.5">
              {rowTooltip.internBurden > 0 && (
                <div className="flex justify-between items-center gap-4 text-[11px]">
                  <span className="text-slate-300">Intern Weeks Required:</span>
                  <span className="font-bold text-slate-200">{rowTooltip.internBurden} {isUnified ? '/ 3 yr' : '/ yr'}</span>
                </div>
              )}
              {rowTooltip.seniorBurden > 0 && (
                <div className="flex justify-between items-center gap-4 text-[11px]">
                  <span className="text-slate-300">Senior Weeks Required:</span>
                  <span className="font-bold text-slate-200">{rowTooltip.seniorBurden} {isUnified ? '/ 3 yr' : '/ yr'}</span>
                </div>
              )}
              <div className="flex justify-between items-center gap-4 text-[11px]">
                <span className="text-blue-300 font-bold">Resident Weeks Required:</span>
                <span className="font-black text-blue-200">{rowTooltip.totalBurden} {isUnified ? '/ 3 yr' : '/ yr'}</span>
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5 border-t border-slate-800/50 pt-1">
                (Based on {sortedResidents.length} displayed residents)
              </div>
            </div>
          </div>
          
          {/* Tooltip caret pointing left */}
          <div className="absolute top-1/2 -left-1.5 w-3 h-3 bg-slate-900 border-l border-b border-slate-750 transform -translate-y-1/2 rotate-45" />
        </div>
      )}

      {/* Column Header Hover Floating Tooltip */}
      {colTooltip && (
        <div
          className="fixed z-[200] bg-slate-900 text-white text-xs rounded-xl py-3 px-4 shadow-xl pointer-events-none transform -translate-x-1/2 min-w-[220px] border border-slate-750"
          style={{ left: colTooltip.x, top: colTooltip.y }}
        >
          <div className="font-black text-sm border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between gap-4">
            <span className="text-white truncate">{colTooltip.residentName}</span>
            <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-slate-700 text-slate-300">
              Pre-existing Deficits
            </span>
          </div>

          <div className="space-y-2 mt-2">
            {colTooltip.deficits.length === 0 ? (
              <div className="text-emerald-400 font-bold text-[11px] flex items-center gap-1.5">
                <span>✅</span> No prior deficits
              </div>
            ) : (
              colTooltip.deficits.map((def, i) => (
                <div key={i} className="flex justify-between items-center gap-4 text-[11px] border-b border-slate-800/50 pb-1.5 last:border-0 last:pb-0">
                  <span className="text-slate-300 font-medium truncate max-w-[120px]" title={def.reqTitle}>
                    {def.reqTitle}
                  </span>
                  <span className="font-black text-rose-400 flex items-center gap-1">
                    -{def.deficit} wk
                    <span className="text-[9px] text-slate-500 font-normal ml-0.5">
                      ({def.actual}/{def.expected})
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
          
          {/* Tooltip caret pointing UP */}
          <div className="absolute -top-1.5 left-1/2 w-3 h-3 bg-slate-900 border-l border-t border-slate-750 transform -translate-x-1/2 rotate-45" />
        </div>
      )}
    </div>
  );
});
RequirementsStats.displayName = 'RequirementsStats';
