import fs from 'fs';
import { getWeeklyViolations } from '../services/scheduler';
import { Resident, ScheduleGrid } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const grid: ScheduleGrid = data.schedules['0'].unifiedData;
const residents: Resident[] = data.residents;

const violations = getWeeklyViolations(residents, grid, 2026);
const year1 = violations.filter(v => v.year === 2026);
console.log('Total violations year 2026:', year1.length);

const byType: Record<string, number> = {};
year1.forEach(v => {
    byType[v.issue] = (byType[v.issue] || 0) + 1;
});
for (const [k, v] of Object.entries(byType)) {
    console.log(`${v} - ${k}`);
}

const uniqueJeopardyWeeks = new Set();
year1.filter(v => v.issue.includes('Jeopardy Gap')).forEach(v => uniqueJeopardyWeeks.add(v.week));
console.log('Unique Jeopardy gap weeks:', uniqueJeopardyWeeks.size);

