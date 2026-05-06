import fs from 'fs';
import { RequirementsEngine } from '../services/requirementsEngine';
import { Resident } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const activeYear = 2026;
const residents: Resident[] = data.residents;
const activeSchedule = data.schedules['0'];
const grid = activeSchedule.data['2026'];

const gaps: number[] = [];
for (let w = 0; w < 52; w++) {
    let pgy2Flexible = 0;
    let pgy3Flexible = 0;

    residents.forEach(r => {
        const cell = grid[r.id]?.[w];
        if (!cell || !cell.assignment) return;

        const currentPgy = activeYear - r.startYear + 1;
        if (currentPgy < 1 || currentPgy > 3) return;

        if (RequirementsEngine.isJeopardyBlock(cell.assignment)) {
            if (currentPgy === 2) pgy2Flexible++;
            if (currentPgy === 3) pgy3Flexible++;
        }
    });

    if (pgy2Flexible === 0 || pgy3Flexible === 0) gaps.push(w + 1);
}

console.log('Jeopardy Gaps Count:', gaps.length);
