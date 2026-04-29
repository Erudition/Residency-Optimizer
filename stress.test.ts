
import { describe, it, expect } from 'vitest';
import { getRequirementViolations } from './services/scheduler';
import { GENERATE_INITIAL_RESIDENTS } from './constants';
import { AssignmentType } from './types';
import { StrictGenerator } from './services/generators/strict';
import { StochasticGenerator } from './services/generators/stochastic';
import { ExperimentalGenerator } from './services/generators/experimental';

describe('Algorithm Consistency Tests', () => {
    const residents = GENERATE_INITIAL_RESIDENTS();
    const generators = [
        { name: 'Strict', gen: StrictGenerator },
        { name: 'Stochastic', gen: StochasticGenerator },
        { name: 'Experimental', gen: ExperimentalGenerator }
    ];

    generators.forEach(({ name, gen }) => {
        it(`${name} generator consistency check (10 runs)`, { timeout: 300000 }, async () => {
            let totalViolations = 0;
            let failures = 0;

            console.log(`\n--- Starting tests for ${name} ---`);

            for (let i = 0; i < 10; i++) {
                const emptySchedule = {};
                const schedule = gen.generate(residents, emptySchedule, i, {}, {});
                const violations = getRequirementViolations(residents, schedule);

                if (violations.length > 0) {
                    console.error(`  [${name}] Run ${i + 1} FAILED with ${violations.length} violations`);
                    // Log specific violations by type
                    const byType: Record<string, number> = {};
                    violations.forEach(v => byType[v.type] = (byType[v.type] || 0) + 1);
                    Object.entries(byType).forEach(([type, count]) => {
                        console.error(`    - ${type}: ${count} residents failing`);
                    });
                    
                    // Show one specific example if it's a CARDS violation (known hard one)
                    const cardsExample = violations.find(v => v.type === AssignmentType.CARDS);
                    if (cardsExample) {
                        console.error(`    - Example: ${cardsExample.residentId} got ${cardsExample.actual} instead of ${cardsExample.target} for CARDS`);
                    }

                    failures++;
                    totalViolations += violations.length;
                } else {
                    console.log(`  [${name}] Run ${i + 1} PASSED`);
                }
            }

            console.log(`[${name}] Final Result: ${(10 - failures)}/10 Passed. Avg Violations per Failed Run: ${failures > 0 ? (totalViolations / failures).toFixed(1) : 0}`);
            expect(failures).toBe(0);
        });
    });
});
