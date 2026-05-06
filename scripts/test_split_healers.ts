import fs from 'fs';
import { Resident, ScheduleGrid, AssignmentType } from '../types';
import { goodSwapsHealer } from '../services/healers/goodSwapsHealer';
import { badSwapsHealer } from '../services/healers/badSwapsHealer';
import { GENERATE_INITIAL_RESIDENTS, ACTIVE_START_YEAR } from '../constants';
import { preloadHistoricalData } from '../services/generators/historyPreloader';

async function main() {
    const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
    const data = JSON.parse(rawData);

    const nestedSchedule = data.schedules["0"].data; 
    const residents: Resident[] = data.residents || GENERATE_INITIAL_RESIDENTS();
    const startYear = data.startYear || ACTIVE_START_YEAR;
    
    const { history, cohortAssignments } = preloadHistoricalData(residents);
    
    const flatSchedule: ScheduleGrid = {};
    const years = ['2026', '2027', '2028'];
    
    residents.forEach(r => {
        flatSchedule[r.id] = [];
        years.forEach(year => {
            if (nestedSchedule[year] && nestedSchedule[year][r.id]) {
                flatSchedule[r.id].push(...nestedSchedule[year][r.id]);
            } else {
                for (let i = 0; i < 52; i++) {
                    flatSchedule[r.id].push({ assignment: AssignmentType.ELECTIVE, locked: false });
                }
            }
        });
    });

    console.log("=== Testing Good Swaps Healer (4 & 2 Block) ===");
    console.time("Good Swaps Time");
    const goodSchedule = await goodSwapsHealer.solve(
        residents, 
        flatSchedule, 
        0, 
        history as any, 
        cohortAssignments as any, 
        (step, max, penalty) => {
            console.log(`Good Swaps Iteration ${step} - Violations: ${penalty}`);
        }
    );
    console.timeEnd("Good Swaps Time");
    console.log("--------------------------------------------------\n");

    console.log("=== Testing Bad Swaps Healer (1 Block) ===");
    console.time("Bad Swaps Time");
    const badSchedule = await badSwapsHealer.solve(
        residents, 
        flatSchedule, 
        0, 
        history as any, 
        cohortAssignments as any, 
        (step, max, penalty) => {
            console.log(`Bad Swaps Iteration ${step} - Violations: ${penalty}`);
        }
    );
    console.timeEnd("Bad Swaps Time");
    console.log("--------------------------------------------------");
}

main().catch(console.error);