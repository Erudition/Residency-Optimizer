import { describe, test, expect } from 'vitest';
import { generateSchedule } from '../services/scheduler';
import { GENERATE_INITIAL_RESIDENTS, ACTIVE_START_YEAR } from '../constants';
import { CompetitionParams, CompetitionPriority, AssignmentType } from '../types';

describe('Multi-Year Cohort Regression Test', () => {
    test('clinic assignments in all years should be distributed across cohorts rather than clumped in a single week', async () => {
        const residents = GENERATE_INITIAL_RESIDENTS();
        const startYear = ACTIVE_START_YEAR;
        const totalYears = 3;

        const params: CompetitionParams = {
            tries: 1, // Focus on triggering the generator directly
            priority: CompetitionPriority.BEST_SCORE,
            algorithmIds: ['stochastic'],
            topN: 1,
            multiYear: true
        };

        const cohortMap: Record<string, number> = {};
        residents.forEach((r, idx) => { cohortMap[r.id] = idx % 5; });

        const result = await generateSchedule(
            startYear,
            totalYears,
            residents,
            {}, // historicalSchedules
            { existing: {}, cohortAssignments: { [startYear]: cohortMap } }, // Replicate frontend nested cohorts
            params,
            ['stochastic'],
            () => false,
            () => {}
        );

        const winner = result.results[0];
        expect(winner).toBeDefined();
        expect(winner.schedule).toBeDefined();

        // Check all years (startYear to startYear + totalYears - 1)
        for (let y = startYear; y < startYear + totalYears; y++) {
            const yearSchedule = winner.schedule[y];
            expect(yearSchedule).toBeDefined();

            // Track clinic count per week (0 to 51)
            const weeklyClinicCounts = Array(52).fill(0);
            let activeCount = 0;

            Object.entries(yearSchedule).forEach(([resId, weeks]) => {
                activeCount++;
                weeks.forEach((cell, w) => {
                    if (cell && (cell.assignment === AssignmentType.CLINIC || cell.assignment === AssignmentType.NIMA_CLINIC)) {
                        weeklyClinicCounts[w]++;
                    }
                });
            });

            // Under the 4+1 rule, exactly 1/5th (20%) of the cohort should be in clinic each week.
            // If the bug is present and all residents are assigned to Cohort 0, then for weeks where w % 5 === 0,
            // almost all residents will be assigned to clinic at once.
            // We assert that no week should have more than 50% of the active residents assigned to clinic at the same time.
            const maxAllowedClinicPercentage = 0.50; 
            const maxAllowedInClinic = Math.ceil(activeCount * maxAllowedClinicPercentage);

            weeklyClinicCounts.forEach((count, w) => {
                expect(count).toBeLessThanOrEqual(maxAllowedInClinic);
            });
        }
    }, 60000);
});
