import fs from 'fs';
import { getWeeklyViolations } from '../services/scheduler';
import { Resident, ScheduleGrid } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const activeYear = 2026;
// Use year data specifically
const grid: ScheduleGrid = data.schedules['0'].data['2026'];
const residents: Resident[] = data.residents;

const violations = getWeeklyViolations(residents, grid, 2026);
console.log('Total violations year 2026 grid:', violations.length);

const byType: Record<string, number> = {};
violations.forEach(v => {
    byType[v.issue] = (byType[v.issue] || 0) + 1;
});
for (const [k, v] of Object.entries(byType)) {
    console.log(`${v} - ${k}`);
}
