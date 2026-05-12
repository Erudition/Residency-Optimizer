import { getCohortAtWeek } from './services/generators/utils';

const resident = { id: 'c2026-1', startYear: 2026, level: 1, cohort: 0 };
const cohortAssignments = { 2026: { 'c2026-1': 3 } };

const w = 0;
const cohort = getCohortAtWeek(resident as any, w, cohortAssignments);
console.log("Cohort:", cohort);
