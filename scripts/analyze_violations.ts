import * as fs from 'fs';
import { getWeeklyViolations } from '../services/scheduler';
import { Resident } from '../types';
import { ACTIVE_START_YEAR } from '../constants';

const data = JSON.parse(fs.readFileSync('schedules/hunter_manual_healed.json', 'utf8'));
const grid = data.grid;
const residents: Resident[] = data.residents;

const violations = getWeeklyViolations(residents, grid, ACTIVE_START_YEAR);

let lockedViolations = 0;
let totalViolations = violations.length;

// This is a rough estimation: if a week has a violation, we count if it involves only locked cells.
// But getWeeklyViolations returns a list of violations per week.
console.log(`Total weekly staffing violations: ${totalViolations}`);

// Just print the first 10 for inspection
violations.slice(0, 10).forEach(v => {
    console.log(`Week ${v.week}: ${v.type} - Interns: ${(v as any).interns}, Seniors: ${(v as any).seniors}`);
});
