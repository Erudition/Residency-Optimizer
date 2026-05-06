import fs from 'fs';
import { getWeeklyViolations } from '../services/scheduler';
import { Resident, ScheduleGrid } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const activeYear = 2026;
// Get year data specifically because the UI passes either activeSchedule.data[year] or activeSchedule.unifiedData to components depending on viewMode
// Let's check the violations calculation in App.tsx
// It does: `getWeeklyViolations(displayResidents, displayGrid, viewMode === 'unified' ? (activeSchedule?.startYear || 2026) : activeYear)`
const grid1 = data.schedules['0'].data['2026'];
const residents: Resident[] = data.residents;

const violations1 = getWeeklyViolations(residents, grid1, 2026);
console.log('Total violations for 1Y grid:', violations1.length);
const sum1 = violations1.reduce((sum, v) => sum + (v.instances !== undefined ? v.instances : 1), 0);
console.log('Sum of instances 1Y grid:', sum1);

// Now unifiedData
const gridU = data.schedules['0'].unifiedData;
const violationsU = getWeeklyViolations(residents, gridU, 2026);
const year1U = violationsU.filter(v => v.year === 2026);
console.log('Total violations for year 1 in unifiedData:', year1U.length);
const sumU = year1U.reduce((sum, v) => sum + (v.instances !== undefined ? v.instances : 1), 0);
console.log('Sum of instances year 1 unifiedData:', sumU);

// Total unified
console.log('Total violations in unifiedData:', violationsU.length);
const sumUAll = violationsU.reduce((sum, v) => sum + (v.instances !== undefined ? v.instances : 1), 0);
console.log('Sum of instances unifiedData:', sumUAll);

