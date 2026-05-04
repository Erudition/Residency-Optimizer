
import { describe, it } from 'vitest';
import { generateSchedule, getRequirementViolations, getWeeklyViolations } from '../services/scheduler';
import { GENERATE_RESIDENTS_FOR_YEAR } from '../constants';
import { CompetitionPriority } from '../types';

describe('Algorithm Diagnostic', () => {
    it('should profile violation patterns across algorithms', async () => {
        const residents = GENERATE_RESIDENTS_FOR_YEAR(2026);
        const cohortMap: Record<string, number> = {};
        residents.forEach((r, idx) => { cohortMap[r.id] = idx % 5; });

        for (const algoId of ['exact']) {
            const result = await generateSchedule(
                2026, 1, {}, 
                { residents, existing: {}, cohortAssignments: { 2026: cohortMap } },
                { tries: 1, priority: CompetitionPriority.BEST_SCORE, topN: 1 },
                [algoId], () => false, () => {}
            );
            const best = result.results[0];
            const bestSchedule = best.schedule[2026];
            const reqV = getRequirementViolations(residents, bestSchedule);
            const weekV = getWeeklyViolations(residents, bestSchedule);

            // Track Continuity
            let totalChanges = 0;
            let totalCoreBlocks = 0;
            residents.forEach(r => {
                const weeks = bestSchedule[r.id] || [];
                for (let cycle = 0; cycle < 10; cycle++) {
                    const start = cycle * 5;
                    const core = weeks.slice(start, start + 4).map(c => c?.assignment).filter(Boolean);
                    if (core.length < 2) continue;
                    totalCoreBlocks++;
                    for (let i = 1; i < core.length; i++) {
                        if (core[i] !== core[i-1]) totalChanges++;
                    }
                }
            });
            const avgChanges = totalChanges / totalCoreBlocks;

            console.log(`=== ${algoId.toUpperCase()} ===`);
            console.log(`Score: ${best.score} | Req Violations: ${reqV.length} | Weekly Violations: ${weekV.length} | Avg Changes/Block: ${avgChanges.toFixed(2)}`);

            // Group req violations by type
            const byType: Record<string, number> = {};
            reqV.forEach(v => {
                const key = `${v.type} (need ${v.minWeeks}, have ${v.actual})`;
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
    }, 300000);
});
