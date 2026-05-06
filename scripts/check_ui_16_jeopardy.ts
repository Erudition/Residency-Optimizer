import fs from 'fs';
import { RequirementsEngine } from '../services/requirementsEngine';
import { Resident, ScheduleGrid } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const activeYear = 2026;
// RequirementsStats uses schedule directly from props, which is usually activeSchedule.data[activeYear] or unifiedData?
// Let's test unifiedData first
const schedule: ScheduleGrid = data.schedules['0'].unifiedData;
const residents: Resident[] = data.residents;

const gaps: number[] = [];
const totalWeeks = Object.values(schedule)[0]?.length || 52;

for (let w = 0; w < totalWeeks; w++) {
    let pgy2Flexible = 0;
    let pgy3Flexible = 0;

    residents.forEach(res => {
        const currentYear = activeYear + Math.floor(w / 52);
        const pgy = currentYear - res.startYear + 1;
        const cell = schedule[res.id]?.[w];
        if (!cell || !cell.assignment) return;
        
        if (RequirementsEngine.isJeopardyBlock(cell.assignment)) {
            if (pgy === 2) pgy2Flexible++;
            if (pgy === 3) pgy3Flexible++;
        }
    });

    if (pgy2Flexible === 0 || pgy3Flexible === 0) gaps.push(w + 1);
}

const year1Gaps = gaps.filter(w => w <= 52);

console.log('Jeopardy gaps in unifiedData:', gaps.length);
console.log('Jeopardy gaps in Year 1:', year1Gaps.length);
console.log('Jeopardy weeks in Year 1:', year1Gaps.join(', '));
