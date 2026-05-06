import * as fs from 'fs';
import { getWeeklyViolations } from '../services/scheduler';
import { Resident } from '../types';
import { ACTIVE_START_YEAR } from '../constants';

const data = JSON.parse(fs.readFileSync('schedules/hunter_manual_healed.json', 'utf8'));
const grid = data.grid;
const residents: Resident[] = data.residents;

// Need to pass activeYear, which defaults to 2026.
const violations = getWeeklyViolations(residents, grid, ACTIVE_START_YEAR);

console.log(`Total weekly staffing violations: ${violations.length}`);

// Inspect violations
violations.slice(0, 20).forEach(v => {
    // The issue was in how resident levels were calculated:
    // (Number(r.level) + Math.floor(week / 52))
    // We need to see if the resident object has 'level' as a number.
    console.log(`Week ${v.week}: ${v.type} - Issue: ${v.issue}`);
});

// Let's debug one resident's level
const r = residents[0];
console.log(`Resident ${r.name} (id: ${r.id}) - Level: ${r.level}, StartYear: ${r.startYear}`);
console.log(`Level calculation at week 0: ${Number(r.level) + Math.floor(0 / 52)}`);
console.log(`Level calculation at week 100: ${Number(r.level) + Math.floor(100 / 52)}`);
