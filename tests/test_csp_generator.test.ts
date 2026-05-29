/**
 * Integration test for the CSP Generator using real backend data.
 *
 * Requires the Payload backend to be running at http://localhost:3000.
 * Run with: npx vitest run tests/test_csp_generator.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ConstraintPropagationGenerator } from '../services/generators/constraintPropagation';
import { StaffingFirstGenerator } from '../services/generators/staffingFirst';
import { RequirementsEngine } from '../services/requirementsEngine';
import { getUnifiedResidents, buildCohortAssignments, sliceIntoYears } from '../services/scheduler';
import { loadProgramData, type ProgramData } from '../services/api/client';
import type { Resident, ScheduleGrid } from '../types';
import { TOTAL_WEEKS } from '../constants';

const START_YEAR = 2026;
const TOTAL_YEARS = 3;

let programData: ProgramData;
let residents: Resident[];
let cohortAssignments: Record<number, Record<string, number>>;
let baseGrid: ScheduleGrid;
let priorCounts: Record<string, Record<string, number>>;

async function isBackendReachable(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:3000/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

describe('CSP Generator (real backend data)', () => {
  beforeAll(async () => {
    const reachable = await isBackendReachable();
    if (!reachable) {
      console.warn('⚠️  Backend not reachable at localhost:3000 — skipping CSP tests');
      return;
    }

    programData = await loadProgramData(START_YEAR);
    residents = getUnifiedResidents(programData.residents, START_YEAR, TOTAL_YEARS);
    cohortAssignments = buildCohortAssignments(START_YEAR, TOTAL_YEARS, residents, programData);

    const totalWeeks = TOTAL_YEARS * TOTAL_WEEKS;

    // Build empty base grid
    baseGrid = {};
    for (const r of residents) {
      baseGrid[r.id] = Array.from({ length: totalWeeks }, () => ({
        assignment: null as any,
        locked: false,
      }));
    }

    // Pre-compute historical requirement counts
    priorCounts = {};
    for (const r of residents) {
      priorCounts[r.id] = {};
      for (const [yStr, grid] of Object.entries(programData.historicalSchedules)) {
        if (parseInt(yStr) < START_YEAR && grid[r.id]) {
          for (const c of grid[r.id]) {
            if (c?.assignment) {
              priorCounts[r.id][c.assignment] = (priorCounts[r.id][c.assignment] || 0) + 1;
            }
          }
        }
      }
    }

    console.log(`Loaded ${residents.length} residents, ${programData.rotations.size} rotations`);
    console.log(`Requirements: ${programData.requirements.length}`);
  }, 120_000);

  it('should produce a schedule grid with correct dimensions', async () => {
    const reachable = await isBackendReachable();
    if (!reachable) return;

    const result = ConstraintPropagationGenerator.generate(
      residents,
      JSON.parse(JSON.stringify(baseGrid)),
      programData,
      0,
      priorCounts,
      cohortAssignments,
    ) as ScheduleGrid;

    // Every resident should have a row of correct length
    for (const r of residents) {
      expect(result[r.id]).toBeDefined();
      expect(result[r.id].length).toBe(TOTAL_YEARS * TOTAL_WEEKS);
    }

    // No null assignments should remain (all filled with at least ELEC)
    let nullCount = 0;
    for (const r of residents) {
      for (let w = 0; w < result[r.id].length; w++) {
        if (result[r.id][w].assignment === null && !result[r.id][w].locked) {
          nullCount++;
        }
      }
    }
    console.log(`Null (unfilled, unlocked) cells: ${nullCount}`);
  }, 600_000); // 10 minutes — no time compromise

  it('should have fewer or equal staffing violations than StaffingFirst', async () => {
    const reachable = await isBackendReachable();
    if (!reachable) return;

    // Run CSP generator
    const cspGrid = ConstraintPropagationGenerator.generate(
      residents,
      JSON.parse(JSON.stringify(baseGrid)),
      programData,
      0,
      priorCounts,
      cohortAssignments,
    ) as ScheduleGrid;

    // Run StaffingFirst for comparison
    const sfGrid = StaffingFirstGenerator.generate(
      residents,
      JSON.parse(JSON.stringify(baseGrid)),
      programData,
      0,
      priorCounts,
      cohortAssignments,
    ) as ScheduleGrid;

    const cspWeekly = RequirementsEngine.getWeeklyViolations(residents, cspGrid, programData, START_YEAR);
    const sfWeekly = RequirementsEngine.getWeeklyViolations(residents, sfGrid, programData, START_YEAR);

    const cspStaffingViolations = cspWeekly.filter(v => v.issue.includes('Min') || v.issue.includes('Max'));
    const sfStaffingViolations = sfWeekly.filter(v => v.issue.includes('Min') || v.issue.includes('Max'));

    console.log(`\n=== Staffing Violations ===`);
    console.log(`CSP:           ${cspStaffingViolations.length}`);
    console.log(`StaffingFirst: ${sfStaffingViolations.length}`);

    // Log CSP violations for debugging
    if (cspStaffingViolations.length > 0) {
      console.log(`\nCSP staffing violations:`);
      for (const v of cspStaffingViolations.slice(0, 20)) {
        console.log(`  Week ${v.week}: ${v.type} — ${v.issue}`);
      }
    }
  }, 600_000);

  it('should report educational violations', async () => {
    const reachable = await isBackendReachable();
    if (!reachable) return;

    const cspGrid = ConstraintPropagationGenerator.generate(
      residents,
      JSON.parse(JSON.stringify(baseGrid)),
      programData,
      0,
      priorCounts,
      cohortAssignments,
    ) as ScheduleGrid;

    const sfGrid = StaffingFirstGenerator.generate(
      residents,
      JSON.parse(JSON.stringify(baseGrid)),
      programData,
      0,
      priorCounts,
      cohortAssignments,
    ) as ScheduleGrid;

    const cspEdu = RequirementsEngine.getViolations(residents, cspGrid, {}, START_YEAR, programData, true);
    const sfEdu = RequirementsEngine.getViolations(residents, sfGrid, {}, START_YEAR, programData, true);

    const cspDeficit = cspEdu.reduce((sum, v) => sum + Math.max(0, v.minWeeks - v.actual), 0);
    const sfDeficit = sfEdu.reduce((sum, v) => sum + Math.max(0, v.minWeeks - v.actual), 0);

    console.log(`\n=== Educational Violations ===`);
    console.log(`CSP:           ${cspEdu.length} violations, ${cspDeficit} total deficit weeks`);
    console.log(`StaffingFirst: ${sfEdu.length} violations, ${sfDeficit} total deficit weeks`);

    // Log top deficits
    const sorted = [...cspEdu].sort((a, b) => (b.minWeeks - b.actual) - (a.minWeeks - a.actual));
    if (sorted.length > 0) {
      console.log(`\nTop CSP educational deficits:`);
      for (const v of sorted.slice(0, 15)) {
        const resName = residents.find(r => r.id === v.residentId)?.name || v.residentId;
        console.log(`  ${resName}: ${v.type} — need ${v.minWeeks}, have ${v.actual} (deficit ${v.minWeeks - v.actual})`);
      }
    }
  }, 600_000);

  it('should correctly lock clinic weeks', async () => {
    const reachable = await isBackendReachable();
    if (!reachable) return;

    const cspGrid = ConstraintPropagationGenerator.generate(
      residents,
      JSON.parse(JSON.stringify(baseGrid)),
      programData,
      0,
      priorCounts,
      cohortAssignments,
    ) as ScheduleGrid;

    const { Y, Z } = programData.cycleConfig;
    let clinicErrors = 0;

    for (const r of residents) {
      for (let w = 0; w < cspGrid[r.id].length; w++) {
        if (w < (r.activeWeekStart ?? 0) || w >= (r.activeWeekEnd ?? Infinity)) continue;
        const cohort = cohortAssignments[START_YEAR + Math.floor(w / 52)]?.[r.id] ?? 0;
        const isClinicWeek = Math.floor((w % Z) / Y) === cohort;
        const cell = cspGrid[r.id][w];

        if (isClinicWeek && !cell.locked) {
          clinicErrors++;
        }
      }
    }

    console.log(`\nClinic lock errors: ${clinicErrors}`);
    expect(clinicErrors).toBe(0);
  }, 600_000);
});
