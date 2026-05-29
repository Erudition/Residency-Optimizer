/**
 * Constraint Propagation Schedule Generator
 *
 * Models the residency schedule as a CSP:
 *   Variables  = block slots (contiguous inpatient windows per resident)
 *   Domains    = rotation codenames that could legally fill each slot
 *   Constraints = staffing cardinality + educational minimums + capacity ceilings
 *
 * Phases:
 *   0. Build block-slot structure from X+Y cycle
 *   1. Encode constraints & initialize domains
 *   2. Propagate (forward-check after each assignment)
 *   3. Search with MRV variable ordering + LCV value ordering
 *   4. Symmetry breaking (fix cohort-0 first block)
 *   5. Fill remaining flex slots with electives
 */

import { Resident, ScheduleGrid, ScheduleCell, AssignmentType, ScheduleGenerator } from '../../types';
import type { ProgramData } from '../api/client';
import { TOTAL_WEEKS, CANDIDATE_START_YEAR } from '../../constants';
import { isClinicRotation, getClinicCodenames } from '../programDataUtils';
import { RequirementsEngine } from '../requirementsEngine';
import { buildLevelRequirements } from './reqBuilder';
import { getCohortAtWeek, getStandardCohortMap } from './utils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A contiguous inpatient window for one resident. */
export interface BlockSlot {
  id: number;
  residentId: string;
  startWeek: number;
  /** Full inpatient span (X weeks). May be split later. */
  maxDuration: number;
  pgy: number;
  yearIndex: number;
  cohort: number;
}

/** A decision variable: one assignable segment within a block slot. */
export interface Variable {
  id: number;
  blockSlotId: number;
  residentId: string;
  startWeek: number;
  duration: number;
  pgy: number;
  yearIndex: number;
  cohort: number;
  domain: string[];
  assigned: string | null;
}

interface EducationalNeed {
  residentId: string;
  tagTitle: string;
  /** Concrete codename(s) that fulfill this tag */
  codenames: string[];
  minWeeks: number;
  yearIndex: number;
  pgy: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPgyAtWeek(r: Resident, w: number, gridStartYear: number): number {
  const sy = r.startYear > 0 ? r.startYear : gridStartYear - Number(r.level) + 1;
  return gridStartYear - sy + 1 + Math.floor(w / 52);
}

function isActive(r: Resident, w: number): boolean {
  const s = r.activeWeekStart ?? 0;
  const e = r.activeWeekEnd ?? Infinity;
  return w >= s && w < e;
}

// ─── Phase 0: Build Block Slots ──────────────────────────────────────────────

function buildBlockSlots(
  residents: Resident[],
  programData: ProgramData,
  totalWeeks: number,
  gridStartYear: number,
  cohortAssignments: Record<string, number> | Record<number, Record<string, number>>
): BlockSlot[] {
  const { X, Y, Z } = programData.cycleConfig;
  const slots: BlockSlot[] = [];
  let nextId = 0;

  for (const r of residents) {
    for (let w = 0; w < totalWeeks; w++) {
      if (!isActive(r, w)) continue;
      const cohort = getCohortAtWeek(r, w, cohortAssignments);
      const isClinicWeek = Math.floor((w % Z) / Y) === cohort;
      if (isClinicWeek) continue;

      // Check if this is the start of an inpatient block
      const blockStart = (cohort * Y + Y) % Z;
      const startRelToInpatient = ((w % Z) - blockStart + Z) % Z;
      const isBlockStart = startRelToInpatient === 0 || w % 52 === 0;
      if (!isBlockStart) continue;

      // Calculate how many contiguous inpatient weeks from here
      let dur = 0;
      for (let i = w; i < totalWeeks && dur < X; i++) {
        if (!isActive(r, i)) break;
        const c = getCohortAtWeek(r, i, cohortAssignments);
        if (Math.floor((i % Z) / Y) === c) break; // clinic week
        // Don't cross year boundaries
        if (Math.floor(i / 52) !== Math.floor(w / 52)) break;
        dur++;
      }
      if (dur <= 0) continue;

      const pgy = getPgyAtWeek(r, w, gridStartYear);
      if (pgy < 1 || pgy > 3) continue;

      slots.push({
        id: nextId++,
        residentId: r.id,
        startWeek: w,
        maxDuration: dur,
        pgy,
        yearIndex: Math.floor(w / 52),
        cohort,
      });
    }
  }
  return slots;
}

// ─── Phase 0b: Create Variables from Block Slots ─────────────────────────────

/**
 * Initially each block slot becomes one variable spanning the full X weeks.
 * During search, a variable may be split into two half-width variables
 * if a 2-week rotation is chosen, allowing the other half to differ.
 *
 * Block slots shorter than the shortest available rotation are skipped —
 * they'll be filled with electives in the backfill phase.
 */
function createVariables(slots: BlockSlot[], programData: ProgramData): Variable[] {
  // Determine the minimum rotation duration across all non-clinic rotations
  let minRotDur = Infinity;
  for (const [codename, meta] of programData.rotations) {
    if (isClinicRotation(programData, codename)) continue;
    const d = meta.duration || programData.cycleConfig.X;
    if (d < minRotDur) minRotDur = d;
  }
  if (!isFinite(minRotDur)) minRotDur = 1;

  const vars: Variable[] = [];
  let nextId = 0;
  let skipped = 0;
  for (const slot of slots) {
    if (slot.maxDuration < minRotDur) {
      skipped++;
      continue; // Too short for any rotation — will be backfilled with electives
    }
    vars.push({
      id: nextId++,
      blockSlotId: slot.id,
      residentId: slot.residentId,
      startWeek: slot.startWeek,
      duration: slot.maxDuration,
      pgy: slot.pgy,
      yearIndex: slot.yearIndex,
      cohort: slot.cohort,
      domain: [],
      assigned: null,
    });
  }
  if (skipped > 0) {
    console.log(`[CSP] Skipped ${skipped} block slots shorter than min rotation duration (${minRotDur}w)`);
  }
  return vars;
}

// ─── Phase 1: Initialize Domains & Constraints ──────────────────────────────

function getAssignableCodenames(programData: ProgramData): string[] {
  const result: string[] = [];
  for (const [codename] of programData.rotations) {
    if (isClinicRotation(programData, codename)) continue;
    result.push(codename);
  }
  return result;
}

function initializeDomains(
  vars: Variable[],
  programData: ProgramData,
  assignable: string[],
): void {
  const { X } = programData.cycleConfig;
  let emptyCount = 0;
  const durDistribution = new Map<number, number>();
  for (const v of vars) {
    durDistribution.set(v.duration, (durDistribution.get(v.duration) || 0) + 1);
    // Filter to rotations whose preferred duration fits this slot
    v.domain = assignable.filter(codename => {
      const meta = programData.rotations.get(codename);
      if (!meta) return false;
      const dur = meta.duration || X;
      // Rotation fits if its duration is <= the slot (we'll assign the full slot
      // or split into sub-slots during search)
      return dur <= v.duration;
    });
    if (v.domain.length === 0) emptyCount++;
  }
  console.log(`[CSP] Domain init: ${emptyCount} variables with empty domains`);
  console.log(`[CSP] Slot durations: ${[...durDistribution.entries()].map(([d, c]) => `${d}w×${c}`).join(', ')}`);
  
  // Log rotation durations for debugging
  const rotDurs = new Map<number, string[]>();
  for (const code of assignable) {
    const d = programData.rotations.get(code)?.duration || X;
    if (!rotDurs.has(d)) rotDurs.set(d, []);
    rotDurs.get(d)!.push(code);
  }
  console.log(`[CSP] Rotation durations: ${[...rotDurs.entries()].map(([d, codes]) => `${d}w: ${codes.join(',')}`).join(' | ')}`);
}

function buildEducationalNeeds(
  residents: Resident[],
  programData: ProgramData,
  gridStartYear: number,
  totalWeeks: number,
  priorCounts: Record<string, Record<string, number>>,
): EducationalNeed[] {
  const needs: EducationalNeed[] = [];
  const numYears = Math.ceil(totalWeeks / 52);

  for (const r of residents) {
    for (let yi = 0; yi < numYears; yi++) {
      const year = gridStartYear + yi;
      const pgy = year - r.startYear + 1;
      if (pgy < 1 || pgy > 3) continue;

      const reqs = buildLevelRequirements(programData, pgy as 1 | 2 | 3);
      for (const req of reqs) {
        // Credit historical assignments
        let prior = 0;
        const priorMap = priorCounts[r.id];
        if (priorMap) {
          // Sum all codenames that fulfill this requirement tag
          for (const [code, count] of Object.entries(priorMap)) {
            if (RequirementsEngine.fulfills(code, req.type, programData)) {
              prior += count;
            }
          }
        }
        const remaining = Math.max(0, req.minWeeks - prior);
        if (remaining <= 0) continue;

        // Find all codenames that fulfill this requirement
        const codenames: string[] = [];
        for (const [codename] of programData.rotations) {
          if (isClinicRotation(programData, codename)) continue;
          if (RequirementsEngine.fulfills(codename, req.type, programData)) {
            codenames.push(codename);
          }
        }
        if (codenames.length === 0) continue;

        needs.push({
          residentId: r.id,
          tagTitle: req.type,
          codenames,
          minWeeks: remaining,
          yearIndex: yi,
          pgy,
        });
      }
    }
  }
  return needs;
}

// ─── Phase 2: Forward Checking (lightweight propagation) ─────────────────────

interface CSPState {
  vars: Variable[];
  /** Week → rotation → {intern count, senior count} for assigned variables */
  weekStaffing: Map<number, Map<string, { interns: number; seniors: number }>>;
  /** residentId → yearIndex → tagTitle → assigned weeks count */
  eduProgress: Map<string, Map<number, Map<string, number>>>;
}

function cloneState(s: CSPState): CSPState {
  const vars = s.vars.map(v => ({ ...v, domain: [...v.domain] }));
  const weekStaffing = new Map<number, Map<string, { interns: number; seniors: number }>>();
  for (const [w, rotMap] of s.weekStaffing) {
    const m = new Map<string, { interns: number; seniors: number }>();
    for (const [rot, counts] of rotMap) {
      m.set(rot, { ...counts });
    }
    weekStaffing.set(w, m);
  }
  const eduProgress = new Map<string, Map<number, Map<string, number>>>();
  for (const [rid, yearMap] of s.eduProgress) {
    const ym = new Map<number, Map<string, number>>();
    for (const [yi, tagMap] of yearMap) {
      ym.set(yi, new Map(tagMap));
    }
    eduProgress.set(rid, ym);
  }
  return { vars, weekStaffing, eduProgress };
}

function initState(vars: Variable[]): CSPState {
  return {
    vars,
    weekStaffing: new Map(),
    eduProgress: new Map(),
  };
}

function recordAssignment(
  state: CSPState,
  v: Variable,
  codename: string,
  programData: ProgramData,
  gridStartYear: number,
): void {
  const isIntern = v.pgy === 1;
  // Update weekly staffing counts
  for (let w = v.startWeek; w < v.startWeek + v.duration; w++) {
    if (!state.weekStaffing.has(w)) {
      state.weekStaffing.set(w, new Map());
    }
    const rotMap = state.weekStaffing.get(w)!;
    if (!rotMap.has(codename)) {
      rotMap.set(codename, { interns: 0, seniors: 0 });
    }
    const counts = rotMap.get(codename)!;
    if (isIntern) counts.interns++;
    else counts.seniors++;
  }

  // Update educational progress
  if (!state.eduProgress.has(v.residentId)) {
    state.eduProgress.set(v.residentId, new Map());
  }
  const yearMap = state.eduProgress.get(v.residentId)!;
  if (!yearMap.has(v.yearIndex)) {
    yearMap.set(v.yearIndex, new Map());
  }
  const tagMap = yearMap.get(v.yearIndex)!;

  // Credit all tags this codename fulfills
  const tags = programData.rotationTags.get(codename) || [];
  for (const tag of [codename, ...tags]) {
    tagMap.set(tag, (tagMap.get(tag) || 0) + v.duration);
  }
}

/**
 * Forward check: after assigning variable `assigned`, prune domains of
 * remaining unassigned variables that would violate staffing ceilings.
 * Returns false if any domain becomes empty (dead end).
 */
function forwardCheck(
  state: CSPState,
  assigned: Variable,
  programData: ProgramData,
): boolean {
  const codename = assigned.assigned!;
  const meta = programData.rotations.get(codename);
  if (!meta) return true;

  // For each week this assignment covers, check if any other unassigned
  // variable covering the same week would exceed capacity if also assigned
  // to this same rotation. If so, remove it from their domain.
  for (let w = assigned.startWeek; w < assigned.startWeek + assigned.duration; w++) {
    const rotMap = state.weekStaffing.get(w);
    if (!rotMap) continue;
    const counts = rotMap.get(codename) || { interns: 0, seniors: 0 };

    for (const v of state.vars) {
      if (v.assigned !== null) continue;
      if (v.startWeek > w || v.startWeek + v.duration <= w) continue;

      const isIntern = v.pgy === 1;
      const wouldExceed = isIntern
        ? counts.interns >= (meta.maxInterns ?? 99)
        : counts.seniors >= (meta.maxSeniors ?? 99);

      if (wouldExceed) {
        const idx = v.domain.indexOf(codename);
        if (idx !== -1) {
          v.domain.splice(idx, 1);
          if (v.domain.length === 0) return false;
        }
      }
    }
  }
  return true;
}

// ─── Phase 3: Search ─────────────────────────────────────────────────────────

/** Select the unassigned variable with the smallest domain (MRV). */
function selectVariable(state: CSPState): Variable | null {
  let best: Variable | null = null;
  let bestSize = Infinity;
  for (const v of state.vars) {
    if (v.assigned !== null) continue;
    if (v.domain.length < bestSize) {
      bestSize = v.domain.length;
      best = v;
    }
  }
  return best;
}

/**
 * Order values for a variable: prioritize rotations the resident needs most
 * (largest educational deficit), then those that disturb staffing least.
 */
function orderValues(
  v: Variable,
  state: CSPState,
  eduNeeds: EducationalNeed[],
  programData: ProgramData,
): string[] {
  const resNeeds = eduNeeds.filter(
    n => n.residentId === v.residentId && n.yearIndex === v.yearIndex
  );

  return [...v.domain].sort((a, b) => {
    // Priority 1: Educational deficit (higher deficit → try first)
    const defA = getDeficitForCodename(a, v, resNeeds, state, programData);
    const defB = getDeficitForCodename(b, v, resNeeds, state, programData);
    if (defB !== defA) return defB - defA;

    // Priority 2: Staffing need at this week (higher need → try first)
    const staffA = getStaffingNeed(a, v, state, programData);
    const staffB = getStaffingNeed(b, v, state, programData);
    if (staffB !== staffA) return staffB - staffA;

    return 0;
  });
}

function getDeficitForCodename(
  codename: string,
  v: Variable,
  resNeeds: EducationalNeed[],
  state: CSPState,
  programData: ProgramData,
): number {
  let maxDeficit = 0;
  for (const need of resNeeds) {
    if (!RequirementsEngine.fulfills(codename, need.tagTitle, programData)) continue;
    const progress = state.eduProgress.get(v.residentId)
      ?.get(v.yearIndex)?.get(need.tagTitle) || 0;
    const deficit = need.minWeeks - progress;
    if (deficit > maxDeficit) maxDeficit = deficit;
  }
  return maxDeficit;
}

function getStaffingNeed(
  codename: string,
  v: Variable,
  state: CSPState,
  programData: ProgramData,
): number {
  const meta = programData.rotations.get(codename);
  if (!meta) return 0;

  let totalNeed = 0;
  for (let w = v.startWeek; w < v.startWeek + v.duration; w++) {
    const counts = state.weekStaffing.get(w)?.get(codename) || { interns: 0, seniors: 0 };
    const isIntern = v.pgy === 1;
    if (isIntern) {
      totalNeed += Math.max(0, (meta.minInterns || 0) - counts.interns);
    } else {
      totalNeed += Math.max(0, (meta.minSeniors || 0) - counts.seniors);
    }
  }
  return totalNeed;
}

/**
 * Core backtracking search. Returns true if a complete valid assignment is found.
 * No time limit — exhaustive search per user requirement.
 */
function search(
  state: CSPState,
  eduNeeds: EducationalNeed[],
  programData: ProgramData,
  gridStartYear: number,
  depth: number = 0,
  stats: { nodes: number; backtracks: number } = { nodes: 0, backtracks: 0 },
): boolean {
  stats.nodes++;
  if (stats.nodes % 100000 === 0) {
    console.log(`[CSP] ... ${stats.nodes} nodes explored, ${stats.backtracks} backtracks, depth ${depth}`);
  }

  const v = selectVariable(state);
  if (!v) return true; // All variables assigned — solution found

  if (depth === 0) {
    console.log(`[CSP] First variable: resident=${v.residentId} week=${v.startWeek} dur=${v.duration} domainSize=${v.domain.length}`);
    if (v.domain.length <= 5) console.log(`[CSP]   domain: ${v.domain.join(', ')}`);
  }

  const orderedValues = orderValues(v, state, eduNeeds, programData);

  for (const codename of orderedValues) {
    const meta = programData.rotations.get(codename);
    if (!meta) continue;

    const rotDur = meta.duration || programData.cycleConfig.X;

    if (rotDur >= v.duration) {
      // Rotation fills the entire slot (possibly longer than slot — we clamp to slot duration)
      const saved = cloneState(state);
      v.assigned = codename;
      recordAssignment(state, v, codename, programData, gridStartYear);

      if (forwardCheck(state, v, programData)) {
        if (search(state, eduNeeds, programData, gridStartYear, depth + 1, stats)) {
          return true;
        }
      }
      stats.backtracks++;
      restoreState(state, saved);
      v.assigned = null;

    } else if (rotDur > 0 && rotDur < v.duration) {
      // Rotation is shorter than the slot — split the slot.
      // Assign this rotation to the first `rotDur` weeks,
      // create a new variable for the remainder.
      const saved = cloneState(state);
      const origDur = v.duration;

      v.duration = rotDur;
      v.assigned = codename;
      recordAssignment(state, v, codename, programData, gridStartYear);

      // Create remainder variable
      const remainder: Variable = {
        id: state.vars.length,
        blockSlotId: v.blockSlotId,
        residentId: v.residentId,
        startWeek: v.startWeek + rotDur,
        duration: origDur - rotDur,
        pgy: v.pgy,
        yearIndex: v.yearIndex,
        cohort: v.cohort,
        domain: [...v.domain],
        assigned: null,
      };
      state.vars.push(remainder);

      if (forwardCheck(state, v, programData)) {
        if (search(state, eduNeeds, programData, gridStartYear, depth + 1, stats)) {
          return true;
        }
      }

      stats.backtracks++;
      restoreState(state, saved);
      v.assigned = null;
      v.duration = origDur;
    }
    // rotDur === v.duration is covered by the first branch (rotDur >= v.duration)
  }

  return false; // No value works — backtrack
}

function restoreState(target: CSPState, saved: CSPState): void {
  // Restore vars (in-place to preserve references held by the search stack)
  target.vars.length = saved.vars.length;
  for (let i = 0; i < saved.vars.length; i++) {
    Object.assign(target.vars[i], saved.vars[i]);
    target.vars[i].domain = [...saved.vars[i].domain];
  }
  target.weekStaffing = saved.weekStaffing;
  target.eduProgress = saved.eduProgress;
}

// ─── Phase 5: Fill Grid ──────────────────────────────────────────────────────

function writeToGrid(
  state: CSPState,
  grid: ScheduleGrid,
  programData: ProgramData,
): void {
  for (const v of state.vars) {
    if (!v.assigned) continue;
    for (let w = v.startWeek; w < v.startWeek + v.duration; w++) {
      if (w < 0 || w >= (grid[v.residentId]?.length || 0)) continue;
      const cell = grid[v.residentId][w];
      if (cell.locked) continue;
      grid[v.residentId][w] = { assignment: v.assigned, locked: false };
    }
  }
}

function fillElectives(grid: ScheduleGrid, programData: ProgramData): void {
  const elecCodename = programData.flexibleCodenames.values().next().value || 'ELEC';
  for (const [rid, row] of Object.entries(grid)) {
    for (let w = 0; w < row.length; w++) {
      if (!row[w].locked && row[w].assignment === null) {
        row[w] = { assignment: elecCodename, locked: false };
      }
    }
  }
}

// ─── Generator Entry Point ───────────────────────────────────────────────────

export const ConstraintPropagationGenerator: ScheduleGenerator = {
  name: 'Constraint Propagation',
  generate: (
    residents: Resident[],
    existingSchedule: ScheduleGrid,
    programData: ProgramData,
    attemptIndex: number = 0,
    priorRequirementCounts?: Record<string, Record<string, number>>,
    cohortAssignments?: Record<string, number> | Record<number, Record<string, number>>,
  ): ScheduleGrid => {
    const existingRows = Object.values(existingSchedule);
    const totalWeeks = existingRows.length > 0 ? existingRows[0].length : TOTAL_WEEKS;
    const grid: ScheduleGrid = JSON.parse(JSON.stringify(existingSchedule));

    const firstRes = residents.find(r => r.startYear && r.startYear > 0);
    const gridStartYear = firstRes
      ? firstRes.startYear + Number(firstRes.level) - 1
      : CANDIDATE_START_YEAR;

    // Resolve cohort assignments
    let validCohorts = cohortAssignments || programData?.cycleConfig?.assignments;
    if (!validCohorts || Object.keys(validCohorts).length === 0) {
      validCohorts = getStandardCohortMap(residents, programData);
    }

    // Ensure all residents have grid rows
    for (const r of residents) {
      if (!grid[r.id]) {
        grid[r.id] = Array.from({ length: totalWeeks }, () => ({
          assignment: null as any,
          locked: false,
        }));
      }
    }

    // Pre-populate clinic weeks
    const clinicCodename = getClinicCodenames(programData)[0] || 'CCIM';
    const { Y, Z } = programData.cycleConfig;
    for (const r of residents) {
      for (let w = 0; w < totalWeeks; w++) {
        if (!isActive(r, w)) {
          if (!grid[r.id][w].locked) {
            grid[r.id][w] = { assignment: null as any, locked: true };
          }
          continue;
        }
        const cohort = getCohortAtWeek(r, w, validCohorts);
        if (Math.floor((w % Z) / Y) === cohort) {
          if (!grid[r.id][w].locked) {
            const ct = (programData.cycleConfig as any).clinicAssignments?.[r.id] || clinicCodename;
            grid[r.id][w] = { assignment: ct, locked: true };
          }
        }
      }
    }

    // Build block slots from the non-clinic, non-locked weeks
    const blockSlots = buildBlockSlots(residents, programData, totalWeeks, gridStartYear, validCohorts);
    const vars = createVariables(blockSlots, programData);

    console.log(`[CSP] Built ${blockSlots.length} block slots → ${vars.length} variables`);

    // Initialize domains
    const assignable = getAssignableCodenames(programData);
    initializeDomains(vars, programData, assignable);

    // Build educational needs
    const priorCounts = priorRequirementCounts || {};
    const eduNeeds = buildEducationalNeeds(residents, programData, gridStartYear, totalWeeks, priorCounts);

    console.log(`[CSP] ${eduNeeds.length} educational needs, ${assignable.length} assignable rotations`);

    // Pre-assign locked cells from existing schedule
    for (const v of vars) {
      const cell = grid[v.residentId]?.[v.startWeek];
      if (cell?.locked && cell.assignment) {
        v.assigned = cell.assignment;
        v.domain = [cell.assignment];
      }
    }

    // Initialize state and run search
    const state = initState(vars);

    // Record pre-existing assignments
    for (const v of state.vars) {
      if (v.assigned) {
        recordAssignment(state, v, v.assigned, programData, gridStartYear);
      }
    }

    // Initial forward check for pre-assigned variables
    for (const v of state.vars) {
      if (v.assigned) {
        forwardCheck(state, v, programData);
      }
    }

    const stats = { nodes: 0, backtracks: 0 };
    console.log(`[CSP] Starting search...`);
    const t0 = Date.now();

    const found = search(state, eduNeeds, programData, gridStartYear, 0, stats);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`[CSP] Search ${found ? 'SUCCEEDED' : 'FAILED'} in ${elapsed}s (${stats.nodes} nodes, ${stats.backtracks} backtracks)`);

    // Write solution to grid
    writeToGrid(state, grid, programData);
    fillElectives(grid, programData);

    return grid;
  },
};
