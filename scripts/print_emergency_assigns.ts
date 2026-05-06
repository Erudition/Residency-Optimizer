import fs from 'fs';
import { AssignmentType } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);
const grid = data.schedules['0'].data['2026'];

[29, 36].forEach(wIndex => {
    console.log(`Week ${wIndex + 1} assignments:`);
    Object.keys(grid).forEach(rId => {
        const cell = grid[rId]?.[wIndex];
        if (cell && cell.assignment && cell.assignment.toLowerCase().includes('emergency')) {
            console.log(`Resident ${rId}: ${cell.assignment}`);
        }
    });
});
