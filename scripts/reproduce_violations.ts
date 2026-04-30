
import { GENERATE_RESIDENTS_FOR_YEAR } from '../constants';
import { generateSchedule, getWeeklyViolations } from '../services/scheduler';
import { CompetitionPriority, AssignmentType } from '../types';

const test = async () => {
    const residents = GENERATE_RESIDENTS_FOR_YEAR(2026);
    const mockCohortMap: Record<string, number> = residents.reduce((acc, r, idx) => ({ ...acc, [r.id]: idx % 5 }), {});
    
    let failures = 0;
    for (let i = 0; i < 20; i++) {
        const result = await generateSchedule(
            2026, 1, {},
            { residents, existing: {}, cohortAssignments: { 2026: mockCohortMap } },
            { tries: 1, priority: CompetitionPriority.BEST_SCORE, topN: 1 },
            ['experimental'], () => false, () => {}
        );
        
        const schedule = result.results[0].schedule[2026];
        const violations = getWeeklyViolations(residents, schedule);
        
        const staffingViolations = violations.filter(v => v.issue.includes('Min') || v.issue.includes('Max'));
        if (staffingViolations.length > 0) {
            failures++;
            console.log(`Staffing Violation in attempt ${i}:`, staffingViolations[0]);
        }

        const pgy2s = residents.filter(r => r.level === 2);
        for (const r of pgy2s) {
            const row = schedule[r.id];
            const wardsCount = row.filter(c => c.assignment === AssignmentType.WARDS_RED || c.assignment === AssignmentType.WARDS_BLUE || c.assignment === AssignmentType.WARDS_METRO).length;
            if (wardsCount < 8) {
                failures++;
                console.log(`Requirement Violation for ${r.id} in attempt ${i}: Wards=${wardsCount}`);
                break;
            }
        }
    }
    console.log(`Total failures: ${failures}/20`);
};

test();
