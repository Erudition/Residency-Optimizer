import { StochasticGenerator } from '../services/generators/stochastic';
import { Resident, AssignmentType } from '../types';
import { TOTAL_WEEKS } from '../constants';

const residents: Resident[] = [
    { id: 'r1', name: 'Test Resident', startYear: 2026, level: 1, avoidResidentIds: [], activeWeekStart: 0, activeWeekEnd: 156 }
];

const emptySchedule = {
    'r1': Array(156).fill(null).map(() => ({ assignment: null, locked: false }))
};

const result = StochasticGenerator.generate(residents, emptySchedule, 42, {}, { 'r1': 0 });

console.log("Resident 1 Assignments across 156 weeks:");
const assignments = result['r1'].map(c => c.assignment);

for (let y = 0; y < 3; y++) {
    console.log(`Year ${y + 1} (PGY-${y + 1}):`);
    const yearAssignments = assignments.slice(y * 52, (y + 1) * 52);
    let line = "";
    for (let i = 0; i < yearAssignments.length; i++) {
        line += (yearAssignments[i] || 'NULL').padEnd(15) + ( (i+1) % 4 === 0 ? '\n' : ' ' );
    }
    console.log(line);
}
