import fs from 'fs';
import { getWeeklyViolations } from '../services/scheduler';
import { Resident, ScheduleGrid } from '../types';
import { RequirementsEngine } from '../services/requirementsEngine';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const activeYear = 2026;
const residents: Resident[] = data.residents;
const activeSchedule = data.schedules['0'];

// In single year mode, displayGrid is activeSchedule.data[activeYear]
const displayGrid = activeSchedule.data['2026'];

const violations = {
    constraints: getWeeklyViolations(residents, displayGrid, 2026),
    reqs: RequirementsEngine.getViolations(residents, displayGrid, {}, 2026)
};

console.log('Single year mode constraints length:', violations.constraints.length);
console.log('Single year mode reqs length:', violations.reqs.length);

// What about unified mode?
const displayGridUnified = activeSchedule.unifiedData;
const violationsUnified = {
    constraints: getWeeklyViolations(residents, displayGridUnified, 2026),
    reqs: RequirementsEngine.getViolations(residents, displayGridUnified, {}, 2026)
};

console.log('Unified mode constraints length:', violationsUnified.constraints.length);
console.log('Unified mode reqs length:', violationsUnified.reqs.length);

const reqsFor1Y = violations.reqs.filter(v => v.year === 2026);
console.log('Req violations in 2026:', reqsFor1Y.length);

