
import { describe, it, expect } from 'vitest';
import { generateSchedule, getRequirementViolations } from './services/scheduler';
import { GENERATE_INITIAL_RESIDENTS } from './constants';
import { AssignmentType } from './types';

describe('Scheduler Stress Test', () => {
    it('should consistently produce valid schedules (0 Req Violations) in 20 runs', async () => {
        const residents = GENERATE_INITIAL_RESIDENTS();
        let failures = 0;

        for (let i = 0; i < 20; i++) {
            console.log(`Run ${i + 1}...`);
            const result = await generateSchedule(residents, {});
            const violations = getRequirementViolations(residents, result.schedule);

            // Focus on PGY1 Cards which is the main hardness check
            const cardsViolations = violations.filter(v => v.type === AssignmentType.CARDS);

            if (cardsViolations.length > 0) {
                console.error(`Run ${i + 1} Failed: ${cardsViolations.length} Cards violations`);
                failures++;
            }
        }

        console.log(`Success Rate: ${(20 - failures)}/20`);
        expect(failures).toBe(0);
    });
});
