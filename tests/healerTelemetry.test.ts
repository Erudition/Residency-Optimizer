import { describe, test, expect } from 'vitest';
import { healer } from '../services/healerSolver';
import { sliceIntoYears, getRequirementsViolationsCount } from '../services/scheduler';
import { WeekByWeekGenerator } from '../services/generators/weekByWeek';
import { getStandardCohortMap } from '../services/generators/utils';
import { RequirementsEngine } from '../services/requirementsEngine';
import { getMockProgramData } from './fixtures/scheduleFixture';
import { Resident, ScheduleGrid, ScheduleHistory } from '../types';

describe('Healer Telemetry Synchronization', () => {
  test('Solver heuristic penalty matches UI calculation exactly before and after healing', async () => {
    const programData = getMockProgramData();
    const startYear = 2026;

    // Build 3 cohorts of 15 residents (45 total)
    const residents: Resident[] = Array.from({ length: 45 }, (_, i) => {
      const cohortIndex = Math.floor(i / 15); // 0, 1, 2
      const resStartYear = startYear + cohortIndex;
      return {
        id: `r${i}`,
        name: `Resident ${i}`,
        level: 1, // Not strictly used for 3-year logic if startYear is set
        startYear: resStartYear,
        activeWeekStart: cohortIndex * 52,
        activeWeekEnd: (cohortIndex + 3) * 52,
        avoidResidentIds: []
      };
    });

    let initialGrid: ScheduleGrid = {};
    for (const r of residents) {
      initialGrid[r.id] = Array.from({ length: 156 }, () => ({ assignment: 'ELEC', locked: false }));
    }
    WeekByWeekGenerator.generate(residents, initialGrid, programData, 0, {});

    // Calculate exactly what the UI reports via the background worker logic
    const calculateUITelemetry = (grid: ScheduleGrid): number => {
      const fullHistory: ScheduleHistory = {};
      const sliced = sliceIntoYears(grid, startYear, 3);
      Object.assign(fullHistory, sliced);

      const reqsDeficit = getRequirementsViolationsCount(residents, grid, fullHistory, startYear, true, programData);
      const audit = RequirementsEngine.getAuditViolations(residents, fullHistory, programData, startYear);

      let constraints = 0;
      for (let offset = 0; offset < 3; offset++) {
        const y = startYear + offset;
        const yrResidents = residents.filter(r => {
          const level = y - r.startYear + 1;
          return level >= 1 && level <= 3;
        });
        const yrGrid = sliced[y] || {};
        const constraintsList = RequirementsEngine.getWeeklyViolations(yrResidents, yrGrid, programData, y);
        constraints += constraintsList.reduce((sum, v) => sum + (v.instances !== undefined ? v.instances : 1), 0);
      }
      return reqsDeficit + constraints + audit;
    };

    const initialUIPenalty = calculateUITelemetry(initialGrid);

    let initialHealerPenalty = -1;
    let finalHealerPenalty = -1;

    // Run the healer and capture the heuristic state via telemetry callback
    const cohortMap = getStandardCohortMap(residents, programData);
    const finalGrid = await healer.solve(
      residents,
      initialGrid,
      programData,
      0, // attemptIndex
      {}, // historicalSchedules
      cohortMap, // cohortAssignments
      (step, maxSteps, penalty) => {
        if (initialHealerPenalty === -1) {
          initialHealerPenalty = penalty;
        }
        finalHealerPenalty = penalty;
      }
    );

    const finalUIPenalty = calculateUITelemetry(finalGrid);

    // 1. Healer penalty must never go up
    expect(finalHealerPenalty).toBeLessThanOrEqual(initialHealerPenalty);

    // 2. UI penalty must never go up
    expect(finalUIPenalty).toBeLessThanOrEqual(initialUIPenalty);

    // 3. Absolute agreement on the numbers
    expect(initialUIPenalty).toBe(initialHealerPenalty);
    expect(finalUIPenalty).toBe(finalHealerPenalty);
  }, 30000); // Allow 30 seconds for full 200k annealing loop
});
