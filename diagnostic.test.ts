
import { describe, it } from 'vitest';
import { generateSchedule, getRequirementViolations, getWeeklyViolations } from './services/scheduler';
import { GENERATE_RESIDENTS_FOR_YEAR } from './constants';
import { CompetitionPriority } from './types';

describe('Algorithm Diagnostic', () => {
    it('should profile violation patterns across algorithms', async () => {
        const residents = GENERATE_RESIDENTS_FOR_YEAR(2026);
        const cohortMap: Record<string, number> = {};
        residents.forEach((r, idx) => { cohortMap[r.id] = idx % 5; });

        for (const algoId of ['experimental', 'stochastic', 'strict']) {
            const result = await generateSchedule(
                residents, {},
                { tries: 50, priority: CompetitionPriority.BEST_SCORE, algorithmIds: [algoId], topN: 1 },
                undefined, undefined, cohortMap
            );
            const best = result.results[0];
            const reqV = getRequirementViolations(residents, best.schedule);
            const weekV = getWeeklyViolations(residents, best.schedule);

            console.log(`\n=== ${algoId.toUpperCase()} (${best.winnerName}) ===`);
            console.log(`Score: ${best.score} | Req Violations: ${reqV.length} | Weekly Violations: ${weekV.length}`);

            // Group req violations by type
            const byType: Record<string, number> = {};
            reqV.forEach(v => {
                const key = `${v.type} (need ${v.target}, have ${v.actual})`;
                byType[key] = (byType[key] || 0) + 1;
            });
            if (reqV.length > 0) {
                console.log('Req Violations by type:');
                Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
                    console.log(`  ${k}: ${v} residents`);
                });
            }

            // Group weekly violations by issue
            const byIssue: Record<string, number> = {};
            weekV.forEach(v => {
                byIssue[v.issue] = (byIssue[v.issue] || 0) + 1;
            });
            if (weekV.length > 0) {
                console.log('Weekly Violations by issue:');
                Object.entries(byIssue).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
                    console.log(`  ${k}: ${v} weeks`);
                });
            }
        }
    }, 120000);
});
