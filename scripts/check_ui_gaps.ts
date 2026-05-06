import fs from 'fs';
import { ROTATION_METADATA } from '../constants';
import { ScheduleGrid, Resident, AssignmentType } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const activeYear = 2026;
// Use unifiedData which is the full multi-year grid
const grid: ScheduleGrid = data.schedules['0'].unifiedData;
const residents: Resident[] = data.residents;

// Simulate AssignmentStats.tsx checkConstraints
let uiGaps = 0;
const weeks = Object.values(grid)[0]?.length || 52;
const types = Object.keys(ROTATION_METADATA) as AssignmentType[];

console.log('Total weeks in unified data:', weeks);

for (let w = 0; w < weeks; w++) {
    for (const type of types) {
        const meta = ROTATION_METADATA[type];
        if (!meta) continue;

        // Find assignees for this week and type
        const assignees = residents.filter(r => {
            const cell = grid[r.id]?.[w];
            return cell && cell.assignment === type;
        });

        // Compute interns and seniors the same way the UI does
        const interns = assignees.filter(r => (Number(r.level) + Math.floor(w / 52)) === 1).length;
        const seniors = assignees.filter(r => (Number(r.level) + Math.floor(w / 52)) > 1).length;

        if (interns < meta.minInterns || interns > meta.maxInterns || seniors < meta.minSeniors || seniors > meta.maxSeniors) {
            uiGaps++;
        }
    }
}
console.log('UI Gaps total:', uiGaps);

// Count just for first 52 weeks
let year1UiGaps = 0;
for (let w = 0; w < 52; w++) {
    for (const type of types) {
        const meta = ROTATION_METADATA[type];
        if (!meta) continue;

        const assignees = residents.filter(r => {
            const cell = grid[r.id]?.[w];
            return cell && cell.assignment === type;
        });

        const interns = assignees.filter(r => (Number(r.level) + Math.floor(w / 52)) === 1).length;
        const seniors = assignees.filter(r => (Number(r.level) + Math.floor(w / 52)) > 1).length;

        if (interns < meta.minInterns || interns > meta.maxInterns || seniors < meta.minSeniors || seniors > meta.maxSeniors) {
            year1UiGaps++;
        }
    }
}
console.log('UI Gaps Year 1 (intern/senior):', year1UiGaps);

// Calculate Jeopardy gaps like RequirementsStats.tsx
let jeopardyGaps = 0;
for (let w = 0; w < 52; w++) {
    let pgy2Flexible = 0;
    let pgy3Flexible = 0;

    residents.forEach(res => {
        const currentYear = activeYear + Math.floor(w / 52);
        const pgy = currentYear - res.startYear + 1;
        const cell = grid[res.id]?.[w];
        if (!cell || !cell.assignment) return;

        // Simplified isJeopardyBlock
        const isJeop = cell.assignment.includes('Elective') || cell.assignment.includes('Consult') || cell.assignment.includes('Research');
        
        if (isJeop) {
            if (pgy === 2) pgy2Flexible++;
            if (pgy === 3) pgy3Flexible++;
        }
    });

    if (pgy2Flexible === 0 || pgy3Flexible === 0) jeopardyGaps++;
}
console.log('Jeopardy Gaps Year 1:', jeopardyGaps);
