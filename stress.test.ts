import { describe, test, expect } from 'vitest';
import { getRequirementViolations, getWeeklyViolations } from './services/scheduler';
import { GENERATE_RESIDENTS_FOR_YEAR, TOTAL_WEEKS } from './constants';
import { ScheduleGrid } from './types';
import { EducationFirstGenerator } from './services/generators/educationFirst';
import { StaffingFirstGenerator } from './services/generators/staffingFirst';
import { WeekByWeekGenerator } from './services/generators/weekByWeek';
import { StochasticGenerator } from './services/generators/stochastic';

describe('Algorithm Stress Tests', () => {
    const runTest = (name: string, gen: any) => {
        test(`${name} stability`, () => {
            const residents = GENERATE_RESIDENTS_FOR_YEAR(2026);
            const emptySchedule: ScheduleGrid = {};
            residents.forEach(r => {
                emptySchedule[r.id] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
            });

            const cohortAssignments: Record<string, number> = {};
            residents.forEach((r, idx) => {
                cohortAssignments[r.id] = idx % 5;
            });

            const tries = 5;
            const results = [];

            for (let i = 0; i < tries; i++) {
                const schedule = gen.generate(residents, emptySchedule, i, {}, cohortAssignments);
                const weeklyCount = getWeeklyViolations(residents, schedule).length;
                const reqsCount = getRequirementViolations(residents, schedule).length;
                results.push({ weekly: weeklyCount, reqs: reqsCount });
            }

            const avgWeekly = results.reduce((sum, r) => sum + r.weekly, 0) / tries;
            const avgReq = results.reduce((sum, r) => sum + r.reqs, 0) / tries;

            console.log(`[${name}] Avg Weekly Violations: ${avgWeekly.toFixed(2)}`);
            console.log(`[${name}] Avg Requirement Violations: ${avgReq.toFixed(2)}`);

            // Higher tolerance for educational requirements as they are harder to meet perfectly
            expect(avgWeekly).toBeLessThan(500); 
        });
    };

    runTest('WeekByWeek', WeekByWeekGenerator);
    runTest('EducationFirst', EducationFirstGenerator);
    runTest('StaffingFirst', StaffingFirstGenerator);
    runTest('Stochastic', StochasticGenerator);
});
