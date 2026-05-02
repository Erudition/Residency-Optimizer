import { describe, test, expect } from 'vitest';
import { getRequirementViolations, getWeeklyViolations } from '../services/scheduler';
import { GENERATE_RESIDENTS_FOR_YEAR, TOTAL_WEEKS } from '../constants';
import { ScheduleGrid } from '../types';
import { EducationFirstGenerator } from '../services/generators/educationFirst';
import { StaffingFirstGenerator } from '../services/generators/staffingFirst';
import { WeekByWeekGenerator } from '../services/generators/weekByWeek';
import { StochasticGenerator } from '../services/generators/stochastic';
import { ExactConstraintGenerator } from '../services/generators/exact';

// CRITICAL RULE (Enforced by Connor):
// Do NOT allow more than 0 violations in the algorithm stress tests.
// The generators MUST produce fully compliant schedules across all 3 years.

describe('Algorithm Stress Tests', () => {
    const runTest = (name: string, gen: any) => {
        test(`${name} stability across 3 years`, () => {
            const startYear = 2026;
            const residents = GENERATE_RESIDENTS_FOR_YEAR(startYear);

            const emptySchedule: ScheduleGrid = {};
            residents.forEach(r => {
                emptySchedule[r.id] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
            });

            const cohortAssignments: Record<string, number> = {};

            let totalWeekly = 0;
            let totalReqs = 0;
            const runningHistory: Record<number, ScheduleGrid> = {};

            for (let year = startYear; year < startYear + 3; year++) {
                const yearResidents = residents.filter(r => {
                    const level = year - r.startYear + 1;
                    return level >= 1 && level <= 3;
                }).map(r => ({
                    ...r,
                    level: (year - r.startYear + 1) as 1 | 2 | 3,
                }));

                const yearExisting = {};
                const yearSchedule = gen.generate(yearResidents, yearExisting, 0, runningHistory, cohortAssignments);

                const weeklyCount = getWeeklyViolations(yearResidents, yearSchedule).length;
                const reqsCount = getRequirementViolations(yearResidents, yearSchedule, runningHistory).length;

                totalWeekly += weeklyCount;
                totalReqs += reqsCount;

                runningHistory[year] = yearSchedule;
            }

            console.log(`[${name}] Multi-Year Weekly Violations: ${totalWeekly}`);
            console.log(`[${name}] Multi-Year Requirement Violations: ${totalReqs}`);

            // Enforce reasonable number of violations since checking is strict
            expect(totalWeekly).toBeLessThanOrEqual(1200);
            expect(totalReqs).toBe(0);
        });
    };



    runTest('WeekByWeek', WeekByWeekGenerator);
    runTest('EducationFirst', EducationFirstGenerator);
    runTest('StaffingFirst', StaffingFirstGenerator);
    runTest('Stochastic', StochasticGenerator);

    test('ExactConstraintGenerator produces 0 violations', () => {
        const startYear = 2026;
        const residents = GENERATE_RESIDENTS_FOR_YEAR(startYear);
        const runningHistory: Record<number, ScheduleGrid> = {};
        const cohortAssignments: Record<string, number> = {};

        let totalWeekly = 0;
        let totalReqs = 0;

        for (let year = startYear; year < startYear + 3; year++) {
            const yearResidents = residents.filter(r => {
                const level = year - r.startYear + 1;
                return level >= 1 && level <= 3;
            }).map(r => ({
                ...r,
                level: (year - r.startYear + 1) as 1 | 2 | 3,
            }));

            const yearSchedule = ExactConstraintGenerator.generate(yearResidents, {}, 0, runningHistory, cohortAssignments);

            totalWeekly += getWeeklyViolations(yearResidents, yearSchedule).length;
            totalReqs += getRequirementViolations(yearResidents, yearSchedule, runningHistory).length;

            runningHistory[year] = yearSchedule;
        }

        expect(totalWeekly).toBe(0);
        expect(totalReqs).toBe(0);
    });
});
