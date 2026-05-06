import fs from 'fs';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const activeSchedule = data.schedules['0'];
const grid = activeSchedule.data['2026'];

const targetWeeks = [29, 36]; // Weeks 30 and 37 are index 29 and 36

targetWeeks.forEach(w => {
    let emergencyCount = 0;
    Object.keys(grid).forEach(rId => {
        const cell = grid[rId]?.[w];
        if (cell && cell.assignment && cell.assignment.toLowerCase().includes('emergency')) {
            emergencyCount++;
        }
    });
    console.log(`Week ${w+1} Emergency count:`, emergencyCount);
});
