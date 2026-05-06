import fs from 'fs';
import { Resident, ScheduleGrid, AssignmentType } from '../types';
import { RequirementsEngine } from '../services/requirementsEngine';
import { GENERATE_INITIAL_RESIDENTS } from '../constants';
import { preloadHistoricalData } from '../services/generators/historyPreloader';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const nestedSchedule = data.schedules["0"].data; 
const residents: Resident[] = data.residents || GENERATE_INITIAL_RESIDENTS();
const { history, cohortAssignments } = preloadHistoricalData(residents);

const activeYear = 2026;
residents.forEach(r => {
    if (!r.startYear) r.startYear = activeYear - Number(r.level) + 1;
    r.level = Number(activeYear - r.startYear + 1) as 1|2|3;
});

const flatSchedule: ScheduleGrid = {};
residents.forEach(r => {
    flatSchedule[r.id] = nestedSchedule['2026']?.[r.id] || [];
});

const reqViolations = RequirementsEngine.getViolations(residents, flatSchedule, history as any, activeYear);
console.log("Total Req Violations for 2026:", reqViolations.length);
reqViolations.forEach(v => console.log(`${v.residentId}: ${v.type}`));