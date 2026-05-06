import { AssignmentType } from "../types";
import fs from 'fs';
import { getWeeklyViolations } from '../services/scheduler';
import { Resident, ScheduleGrid } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);
const residents: Resident[] = data.residents;
const activeSchedule = data.schedules['0'];
const grid = activeSchedule.data['2026'];

// Looking for Emergency violations
const violations = getWeeklyViolations(residents, grid, 2026);
const emergencyViolations = violations.filter(v => v.type === AssignmentType.EM);

console.log('Emergency violations count:', emergencyViolations.length);
if (emergencyViolations.length > 0) {
    console.log(emergencyViolations[0]);
}

// Manually checking week 30
const week30Index = 29;
let seniorCount = 0;
residents.forEach(r => {
    const pgy = 2026 - r.startYear + 1;
    if (pgy < 2) return;
    const cell = grid[r.id]?.[week30Index];
    if (cell && cell.assignment) {
        // According to scheduler.ts (which we should check), how are constraints calculated?
        // Let's assume there is a constraint for minEmergencySenior: 1
    }
});
