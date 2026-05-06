import fs from 'fs';
import { getWeeklyViolations } from '../services/scheduler';
import { Resident, ScheduleGrid } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const grid: ScheduleGrid = data.schedules['0'].data;
const residents: Resident[] = data.residents;

const violations = getWeeklyViolations(residents, grid, 2026);
console.log('Total violations:', violations.length);
console.log('Violations in year 2026 (week < 52):', violations.filter(v => v.week < 52).length);
console.log('First 20 violations in 2026:', violations.filter(v => v.week < 52).slice(0, 20));
