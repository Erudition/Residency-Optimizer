import fs from 'fs';
import { RequirementsEngine } from '../services/requirementsEngine';
import { AssignmentType, Resident } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);
const grid = data.schedules['0'].data['2026'];
const residents: Resident[] = data.residents;

// Checking week 30 and 37 (indices 29 and 36)
[29, 36].forEach(wIndex => {
    let seniorEmergencyCount = 0;
    residents.forEach(r => {
        const pgy = 2026 - r.startYear + 1;
        if (pgy > 1) { // Senior
            const cell = grid[r.id]?.[wIndex];
            if (cell && cell.assignment === AssignmentType.EM) {
                seniorEmergencyCount++;
            }
        }
    });
    console.log(`Week ${wIndex + 1} Senior Emergency Count:`, seniorEmergencyCount);
});
