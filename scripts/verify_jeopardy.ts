import fs from 'fs';
import { RequirementsEngine } from '../services/requirementsEngine';
import { AssignmentType } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);
const grid = data.schedules['0'].data['2026'];
const residents = data.residents;

[29, 36].forEach(w => {
    let seniorFlexibleCount = 0;
    residents.forEach(r => {
        const pgy = 2026 - r.startYear + 1;
        if (pgy > 1) { // Senior
            const cell = grid[r.id]?.[w];
            if (cell && cell.assignment && RequirementsEngine.isJeopardyBlock(cell.assignment)) {
                seniorFlexibleCount++;
            }
        }
    });
    console.log(`Week ${w+1} Senior flexible count:`, seniorFlexibleCount);
});
