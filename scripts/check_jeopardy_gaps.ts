import fs from 'fs';
import { AssignmentType, Resident } from '../types';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const activeYear = 2026;
const residents: Resident[] = data.residents;
const activeSchedule = data.schedules['0'];
const grid = activeSchedule.data['2026'];

const FLEXIBLE_BLOCKS = [AssignmentType.ELECTIVE, AssignmentType.ELECTIVE, 'Consult'];

const getJeopardyGaps = () => {
    const gaps: number[] = [];
    if (!grid) return gaps;
    
    // We assume 52 weeks
    for (let w = 0; w < 52; w++) {
        let pgy2Flexible = 0;
        let pgy3Flexible = 0;
        
        residents.forEach(r => {
            const cell = grid[r.id]?.[w];
            if (!cell || !cell.assignment) return;
            
            // Calculate PGY for this specific year
            const currentPgy = activeYear - r.startYear + 1;
            
            if (FLEXIBLE_BLOCKS.includes(cell.assignment as any) || cell.assignment.includes('Consult')) {
                if (currentPgy === 2) pgy2Flexible++;
                if (currentPgy === 3) pgy3Flexible++;
            }
        });
        
        if (pgy2Flexible === 0 || pgy3Flexible === 0) gaps.push(w + 1);
    }
    return gaps;
};

const gaps = getJeopardyGaps();
console.log('Jeopardy Gaps Count:', gaps.length);
console.log('Weeks with gaps:', gaps);
