import { GENERATE_RESIDENTS_FOR_YEAR } from '../constants';
import { ExactConstraintGenerator } from '../services/generators/exact';
import { getWeeklyViolations, getRequirementViolations } from '../services/scheduler';

const startYear = 2026;
const residents = GENERATE_RESIDENTS_FOR_YEAR(startYear);
const yearResidents = residents.filter(r => {
    const level = startYear - r.startYear + 1;
    return level >= 1 && level <= 3;
}).map(r => ({
    ...r,
    level: (startYear - r.startYear + 1) as 1 | 2 | 3,
}));

console.log("Running generator...");
const sched = ExactConstraintGenerator.generate(yearResidents, {});
console.log("Completed. Validating violations...");

const weekly = getWeeklyViolations(yearResidents, sched);
console.log("Weekly violations count:", weekly.length);
weekly.forEach(v => {
    console.log(`Week ${v.week + 1}, Type: ${v.type}, Issue: ${v.issue}`);
});

const reqs = getRequirementViolations(yearResidents, sched, {});
console.log("Req violations count:", reqs.length);
reqs.forEach(v => {
    console.log(`Resident ${v.residentId}, Type: ${v.type}, Target: ${v.target}, Actual: ${v.actual}`);
});
