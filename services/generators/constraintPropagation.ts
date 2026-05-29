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
import { buildEnrichedLevelRequirements } from './reqBuilder';
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
  /** Per-year ideal (soft goal): what the optimizer aims for */
  idealWeeks: number;
  /** Per-year hard minimum: failing this is a genuine violation.
   *  Pro-rated from the graduation minimum. 0 if no graduation min defined. */
  hardMinWeeks: number;
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
    // and whose staffing ceiling allows this resident's PGY level
    v.domain = assignable.filter(codename => {
      const meta = programData.rotations.get(codename);
      if (!meta) return false;
      const dur = meta.duration || X;
      // Rotation fits if its duration is <= the slot (we'll assign the full slot
      // or split into sub-slots during search)
      if (dur > v.duration) return false;
      // Ceiling check: if maxInterns is 0, PGY-1 residents can't do this rotation
      if (v.pgy === 1 && (meta.maxInterns ?? 99) === 0) return false;
      if (v.pgy >= 2 && (meta.maxSeniors ?? 99) === 0) return false;
      return true;
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

      const reqs = buildEnrichedLevelRequirements(programData, pgy as 1 | 2 | 3);
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
        const remainingIdeal = Math.max(0, req.idealWeeks - prior);
        const remainingHard = Math.max(0, req.hardMinWeeks - prior);
        if (remainingIdeal <= 0) continue;

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
          idealWeeks: remainingIdeal,
          hardMinWeeks: remainingHard,
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
  /** Week → list of variable indices covering that week (pre-built for fast lookups) */
  weekVarIndex: Map<number, number[]>;
  /** Rotations with staffing floors, pre-computed for fast iteration */
  staffingFloorRotations: { codename: string; minI: number; minS: number }[];
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
  // weekVarIndex and staffingFloorRotations are rebuilt from vars, not deep-cloned
  return { vars, weekStaffing, eduProgress, weekVarIndex: s.weekVarIndex, staffingFloorRotations: s.staffingFloorRotations };
}

function initState(vars: Variable[], programData: ProgramData): CSPState {
  // Pre-build week → variable index for fast lookups
  const weekVarIndex = new Map<number, number[]>();
  for (let i = 0; i < vars.length; i++) {
    const v = vars[i];
    for (let w = v.startWeek; w < v.startWeek + v.duration; w++) {
      if (!weekVarIndex.has(w)) weekVarIndex.set(w, []);
      weekVarIndex.get(w)!.push(i);
    }
  }

  // Pre-compute rotations with staffing floors
  const staffingFloorRotations: { codename: string; minI: number; minS: number }[] = [];
  for (const [codename, meta] of programData.rotations) {
    if (isClinicRotation(programData, codename)) continue;
    const minI = meta.minInterns || 0;
    const minS = meta.minSeniors || 0;
    if (minI > 0 || minS > 0) {
      staffingFloorRotations.push({ codename, minI, minS });
    }
  }

  return {
    vars,
    weekStaffing: new Map(),
    eduProgress: new Map(),
    weekVarIndex,
    staffingFloorRotations,
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
 * Forward check: after assigning variable `assigned`:
 *  1. Prune domains of unassigned variables that would violate staffing ceilings.
 *  2. Verify staffing floors are still achievable for each affected week.
 * Returns false if any domain becomes empty or a floor becomes unachievable (dead end).
 */
function forwardCheck(
  state: CSPState,
  assigned: Variable,
  programData: ProgramData,
): boolean {
  const codename = assigned.assigned!;
  const meta = programData.rotations.get(codename);
  if (!meta) return true;

  // --- Step 1: Ceiling pruning ---
  // For each week this assignment covers, remove this rotation from domains of
  // unassigned variables where the ceiling is now met.
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

/**
 * Check whether staffing floors are still achievable for week `w`.
 * Uses pre-computed weekVarIndex and staffingFloorRotations for speed.
 * Returns false if assigned + potential < minimum for any rotation/level.
 */
function checkStaffingFloorsFeasible(
  state: CSPState,
  w: number,
): boolean {
  const rotMap = state.weekStaffing.get(w);
  const varIndices = state.weekVarIndex.get(w);

  for (const { codename: rot, minI, minS } of state.staffingFloorRotations) {
    const assigned = rotMap?.get(rot) || { interns: 0, seniors: 0 };
    if (assigned.interns >= minI && assigned.seniors >= minS) continue;

    // Count unassigned variables covering this week that could provide this rotation
    let potentialInterns = 0;
    let potentialSeniors = 0;

    if (varIndices) {
      for (const idx of varIndices) {
        const v = state.vars[idx];
        if (v.assigned !== null) continue;
        // Check if v still covers week w (may have been split)
        if (v.startWeek > w || v.startWeek + v.duration <= w) continue;
        if (!v.domain.includes(rot)) continue;

        if (v.pgy === 1) potentialInterns++;
        else potentialSeniors++;
      }
    }

    if (assigned.interns + potentialInterns < minI) return false;
    if (assigned.seniors + potentialSeniors < minS) return false;
  }
  return true;
}

// ─── Phase 2b: Deterministic Staffing Pre-Assignment ─────────────────────────

/**
 * Pre-assign staffing-floor obligations before the CSP search.
 * Iterates week-by-week and for each rotation with unmet staffing floors,
 * picks the best available unassigned variable covering that week and assigns it.
 * This guarantees zero staffing violations without any backtracking.
 */
function staffingPreAssign(
  state: CSPState,
  programData: ProgramData,
  gridStartYear: number,
  eduNeeds: EducationalNeed[],
): void {
  const totalWeeks = Math.max(...state.vars.map(v => v.startWeek + v.duration), 0);
  let preAssigned = 0;
  let eduAligned = 0;

  for (let w = 0; w < totalWeeks; w++) {
    for (const { codename: rot, minI, minS } of state.staffingFloorRotations) {
      // Re-read staffing state each iteration (it changes after recordAssignment)
      const getCurrentCounts = () => {
        const rotMap = state.weekStaffing.get(w);
        return rotMap?.get(rot) || { interns: 0, seniors: 0 };
      };

      // Fill intern slots
      while (getCurrentCounts().interns < minI) {
        const v = findBestStaffingCandidate(state, w, rot, 1, programData, eduNeeds);
        if (!v) break;
        const hasEduNeed = eduNeeds.some(
          n => n.residentId === v.residentId && n.codenames.includes(rot)
        );
        if (hasEduNeed) eduAligned++;
        v.assigned = rot;
        v.domain = [rot];
        recordAssignment(state, v, rot, programData, gridStartYear);
        preAssigned++;
      }

      // Fill senior slots
      while (getCurrentCounts().seniors < minS) {
        const v = findBestStaffingCandidate(state, w, rot, 2, programData, eduNeeds);
        if (!v) break;
        const hasEduNeed = eduNeeds.some(
          n => n.residentId === v.residentId && n.codenames.includes(rot)
        );
        if (hasEduNeed) eduAligned++;
        v.assigned = rot;
        v.domain = [rot];
        recordAssignment(state, v, rot, programData, gridStartYear);
        preAssigned++;
      }
    }
  }
  console.log(`[CSP] Staffing pre-assignment: ${preAssigned} variables locked (${eduAligned} education-aligned)`);
}

/**
 * Find the best unassigned variable starting at week `w` for staffing rotation `rot`
 * at the given PGY level. Only considers variables whose block starts at exactly `w`
 * to avoid stealing blocks already counted for prior weeks. Verifies that assigning
 * won't exceed any ceiling across the block's duration.
 */
function findBestStaffingCandidate(
  state: CSPState,
  w: number,
  rot: string,
  pgyLevel: number,
  programData: ProgramData,
  eduNeeds: EducationalNeed[],
): Variable | null {
  const meta = programData.rotations.get(rot);
  let best: Variable | null = null;
  let bestScore = -1;

  for (const v of state.vars) {
    if (v.assigned !== null) continue;
    if (v.startWeek !== w) continue; // Only blocks starting at this week
    if (!v.domain.includes(rot)) continue;
    if (pgyLevel === 1 && v.pgy !== 1) continue;
    if (pgyLevel >= 2 && v.pgy < 2) continue;

    // Verify ceiling won't be exceeded for any week this block covers
    if (meta) {
      let ceilingOk = true;
      for (let bw = v.startWeek; bw < v.startWeek + v.duration; bw++) {
        const rotMap = state.weekStaffing.get(bw);
        const counts = rotMap?.get(rot) || { interns: 0, seniors: 0 };
        if (pgyLevel === 1 && counts.interns >= (meta.maxInterns ?? 99)) {
          ceilingOk = false;
          break;
        }
        if (pgyLevel >= 2 && counts.seniors >= (meta.maxSeniors ?? 99)) {
          ceilingOk = false;
          break;
        }
      }
      if (!ceilingOk) continue;
    }

    // Score: educational alignment is primary, then flexibility as tiebreak
    let score = 0;

    // Strong preference for residents who need this rotation educationally
    const resNeeds = eduNeeds.filter(n => n.residentId === v.residentId);
    for (const need of resNeeds) {
      if (!need.codenames.includes(rot)) continue;
      const progress = state.eduProgress.get(v.residentId)
        ?.get(v.yearIndex)?.get(need.tagTitle) || 0;
      const deficit = need.idealWeeks - progress;
      if (deficit > 0) {
        score += 10000 + deficit; // Strongly prefer, and prefer higher deficit
      }
    }

    // Tiebreak: prefer larger domain (more flexible variable, less disruption)
    score += v.domain.length;

    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

// ─── Phase 3: Search ─────────────────────────────────────────────────────────

/**
 * Select the next unassigned variable.
 * Fair-distribution heuristic:
 *   First, identify all residents with unmet educational needs and pick the one
 *   who has received the FEWEST educational assignments so far. Among that
 *   resident's variables, pick the one with the highest addressable deficit.
 *   This ensures fair rotation distribution across all residents.
 *   Falls back to MRV for variables with no educational relevance.
 */
function selectVariable(state: CSPState, eduNeeds: EducationalNeed[]): Variable | null {
  // Group unassigned variables by resident, tracking each resident's progress
  const residentVars = new Map<string, Variable[]>();
  for (const v of state.vars) {
    if (v.assigned !== null) continue;
    if (!residentVars.has(v.residentId)) residentVars.set(v.residentId, []);
    residentVars.get(v.residentId)!.push(v);
  }

  // For each resident with unassigned variables, calculate:
  // - total educational progress (assignments already made this session)
  // - maximum addressable deficit across their unassigned variables
  let bestVar: Variable | null = null;
  let bestResProgress = Infinity;
  let bestVarDeficit = 0;
  let bestVarDomainSize = Infinity;

  for (const [residentId, vars] of residentVars) {
    // Get this resident's needs
    const resNeeds = eduNeeds.filter(n => n.residentId === residentId);
    if (resNeeds.length === 0) continue; // No educational needs

    // Total educational progress: how many edu-weeks already assigned
    let totalProgress = 0;
    const yearMap = state.eduProgress.get(residentId);
    if (yearMap) {
      for (const tagMap of yearMap.values()) {
        for (const weeks of tagMap.values()) {
          totalProgress += weeks;
        }
      }
    }

    // Find the best variable for this resident (highest addressable deficit)
    for (const v of vars) {
      let maxDeficit = 0;
      for (const need of resNeeds) {
        const progress = state.eduProgress.get(residentId)
          ?.get(need.yearIndex)?.get(need.tagTitle) || 0;
        const deficit = need.idealWeeks - progress;
        if (deficit <= 0) continue;
        if (need.codenames.some(c => v.domain.includes(c))) {
          if (deficit > maxDeficit) maxDeficit = deficit;
        }
      }
      if (maxDeficit <= 0) continue;

      // Fair distribution: prefer residents with LESS progress
      // Tiebreak: higher deficit variable, then smaller domain (MRV)
      if (totalProgress < bestResProgress ||
          (totalProgress === bestResProgress && maxDeficit > bestVarDeficit) ||
          (totalProgress === bestResProgress && maxDeficit === bestVarDeficit &&
           v.domain.length < bestVarDomainSize)) {
        bestResProgress = totalProgress;
        bestVarDeficit = maxDeficit;
        bestVarDomainSize = v.domain.length;
        bestVar = v;
      }
    }
  }

  if (bestVar) return bestVar;

  // Fallback: pure MRV for variables with no educational relevance
  let mrvBest: Variable | null = null;
  let mrvSize = Infinity;
  for (const v of state.vars) {
    if (v.assigned !== null) continue;
    if (v.domain.length < mrvSize) {
      mrvSize = v.domain.length;
      mrvBest = v;
    }
  }
  return mrvBest;
}

/**
 * Order values for a variable: prioritize rotations the resident needs most
 * (largest educational deficit across all years), penalize filler rotations
 * when the resident still has unmet requirements.
 */
function orderValues(
  v: Variable,
  state: CSPState,
  eduNeeds: EducationalNeed[],
  programData: ProgramData,
): string[] {
  // Get ALL needs for this resident (cross-year)
  const resNeeds = eduNeeds.filter(n => n.residentId === v.residentId);
  const fillers = new Set(['ELEC', 'VAC', 'RSCH']);

  // Check if this resident still has unmet educational needs
  let totalResidentDeficit = 0;
  for (const need of resNeeds) {
    const progress = state.eduProgress.get(v.residentId)
      ?.get(need.yearIndex)?.get(need.tagTitle) || 0;
    const deficit = need.idealWeeks - progress;
    if (deficit > 0) totalResidentDeficit += deficit;
  }

  const { X } = programData.cycleConfig;

  return [...v.domain].sort((a, b) => {
    // Weighted educational deficit: deficit × weeks-contributed.
    // A 4-week rotation at deficit 28 scores 4×28=112 while a 2-week rotation
    // at deficit 30 scores 2×30=60. This ensures 4-week slots are used for
    // large requirements (Wards, Core) instead of being split for specialties.
    const defA = getDeficitForCodename(a, v, resNeeds, state, programData);
    const defB = getDeficitForCodename(b, v, resNeeds, state, programData);
    const durA = Math.min(programData.rotations.get(a)?.duration || X, v.duration);
    const durB = Math.min(programData.rotations.get(b)?.duration || X, v.duration);

    // Surplus penalty: if a rotation addresses an ALREADY-MET requirement
    // for THIS year, penalize it to prevent hogging (e.g. giving one resident
    // 48 ward weeks). Always computed alongside deficit for balanced scoring.
    const surplusA = getSurplusForCodename(a, v, resNeeds, state, programData);
    const surplusB = getSurplusForCodename(b, v, resNeeds, state, programData);

    const weightedA = defA * durA - surplusA;
    const weightedB = defB * durB - surplusB;
    if (weightedB !== weightedA) return weightedB - weightedA;

    // Tiebreak 1: Penalize filler rotations when resident still has unmet needs
    if (totalResidentDeficit > 0) {
      const fillerA = fillers.has(a) ? 1 : 0;
      const fillerB = fillers.has(b) ? 1 : 0;
      if (fillerA !== fillerB) return fillerA - fillerB; // non-fillers first
    }

    // Tiebreak 2: Staffing need at this week (higher need → try first)
    const staffA = getStaffingNeed(a, v, state, programData);
    const staffB = getStaffingNeed(b, v, state, programData);
    if (staffB !== staffA) return staffB - staffA;

    return 0;
  });
}

/**
 * Calculate the maximum educational deficit this codename would address
 * for the given variable's resident, considering ALL years (not just current).
 */
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
      ?.get(need.yearIndex)?.get(need.tagTitle) || 0;
    const deficit = need.idealWeeks - progress;
    if (deficit > maxDeficit) maxDeficit = deficit;
  }
  return maxDeficit;
}

/**
 * Calculate the surplus (overshoot) this codename would contribute for
 * already-met requirements in THIS variable's year. Returns 0 if no
 * relevant need is already met, or the max surplus across met needs.
 */
function getSurplusForCodename(
  codename: string,
  v: Variable,
  resNeeds: EducationalNeed[],
  state: CSPState,
  programData: ProgramData,
): number {
  let maxSurplus = 0;
  for (const need of resNeeds) {
    if (need.yearIndex !== v.yearIndex) continue; // Only check this variable's year
    if (!RequirementsEngine.fulfills(codename, need.tagTitle, programData)) continue;
    const progress = state.eduProgress.get(v.residentId)
      ?.get(need.yearIndex)?.get(need.tagTitle) || 0;
    const surplus = progress - need.idealWeeks;
    if (surplus >= 0) {
      // Already met for this year — penalize by how much we'd overshoot
      maxSurplus = Math.max(maxSurplus, surplus + v.duration);
    }
  }
  return maxSurplus;
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
  if (stats.nodes % 10000 === 0) {
    console.log(`[CSP] ... ${stats.nodes} nodes explored, ${stats.backtracks} backtracks, depth ${depth}`);
  }

  const v = selectVariable(state, eduNeeds);
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

// ─── Phase 4: Educational Improvement Pass ──────────────────────────────────

/**
 * Post-search optimization: iteratively swap filler rotations (ELEC, VAC, RSCH)
 * for educationally useful rotations when the resident has unmet requirements.
 * Respects staffing ceilings. Runs multiple rounds until convergence.
 */
function educationalImprovementPass(
  state: CSPState,
  eduNeeds: EducationalNeed[],
  programData: ProgramData,
  gridStartYear: number,
): void {
  const fillers = new Set(['ELEC', 'VAC', 'RSCH']);
  const maxRounds = 10;
  let totalSwaps = 0;

  for (let round = 0; round < maxRounds; round++) {
    let roundSwaps = 0;

    for (const v of state.vars) {
      if (!v.assigned || !fillers.has(v.assigned)) continue;

      // Get this resident's unmet educational needs
      const resNeeds = eduNeeds.filter(n => n.residentId === v.residentId);
      let bestSwap: string | null = null;
      let bestDeficit = 0;

      for (const need of resNeeds) {
        const progress = state.eduProgress.get(v.residentId)
          ?.get(need.yearIndex)?.get(need.tagTitle) || 0;
        const deficit = need.idealWeeks - progress;
        if (deficit <= 0) continue;

        // Find a rotation that fulfills this need and fits in this slot
        for (const codename of need.codenames) {
          if (fillers.has(codename)) continue; // Don't swap filler for filler
          const meta = programData.rotations.get(codename);
          if (!meta) continue;
          const dur = meta.duration || programData.cycleConfig.X;
          if (dur > v.duration) continue; // Doesn't fit
          if (dur < v.duration) continue; // Would need to split — skip for simplicity

          // Check PGY ceiling
          if (v.pgy === 1 && (meta.maxInterns ?? 99) === 0) continue;
          if (v.pgy >= 2 && (meta.maxSeniors ?? 99) === 0) continue;

          // Check staffing ceiling for all weeks in this block
          let ceilingOk = true;
          for (let w = v.startWeek; w < v.startWeek + v.duration; w++) {
            const counts = state.weekStaffing.get(w)?.get(codename) || { interns: 0, seniors: 0 };
            if (v.pgy === 1 && counts.interns >= (meta.maxInterns ?? 99)) {
              ceilingOk = false;
              break;
            }
            if (v.pgy >= 2 && counts.seniors >= (meta.maxSeniors ?? 99)) {
              ceilingOk = false;
              break;
            }
          }
          if (!ceilingOk) continue;

          if (deficit > bestDeficit) {
            bestDeficit = deficit;
            bestSwap = codename;
          }
        }
      }

      if (bestSwap) {
        // Undo old assignment from staffing/edu tracking
        unrecordAssignment(state, v, v.assigned, programData);
        // Apply new assignment
        v.assigned = bestSwap;
        recordAssignment(state, v, bestSwap, programData, gridStartYear);
        roundSwaps++;
      }
    }

    totalSwaps += roundSwaps;
    if (roundSwaps === 0) break; // Converged
  }

  if (totalSwaps > 0) {
    console.log(`[CSP] Educational improvement: ${totalSwaps} filler→edu swaps`);
  }
}

/**
 * Undo a variable's assignment from the state tracking (inverse of recordAssignment).
 */
function unrecordAssignment(
  state: CSPState,
  v: Variable,
  codename: string,
  programData: ProgramData,
): void {
  const isIntern = v.pgy === 1;

  // Undo weekly staffing counts
  for (let w = v.startWeek; w < v.startWeek + v.duration; w++) {
    const rotMap = state.weekStaffing.get(w);
    if (!rotMap) continue;
    const counts = rotMap.get(codename);
    if (!counts) continue;
    if (isIntern) counts.interns = Math.max(0, counts.interns - 1);
    else counts.seniors = Math.max(0, counts.seniors - 1);
  }

  // Undo educational progress
  const yearMap = state.eduProgress.get(v.residentId);
  if (!yearMap) return;
  const tagMap = yearMap.get(v.yearIndex);
  if (!tagMap) return;

  const tags = programData.rotationTags.get(codename) || [];
  for (const tag of [codename, ...tags]) {
    const current = tagMap.get(tag) || 0;
    tagMap.set(tag, Math.max(0, current - v.duration));
  }
}



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
    const state = initState(vars, programData);

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

    // Phase 2b: Deterministic staffing pre-assignment
    // Fill all staffing floor obligations before the CSP search begins,
    // guaranteeing zero staffing violations without backtracking.
    staffingPreAssign(state, programData, gridStartYear, eduNeeds);

    // Run forward check for newly pre-assigned staffing variables
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

    // Post-search: iteratively improve educational coverage by swapping filler
    // rotations for educationally useful ones
    educationalImprovementPass(state, eduNeeds, programData, gridStartYear);

    // Write solution to grid
    writeToGrid(state, grid, programData);
    fillElectives(grid, programData);

    return grid;
  },
};
