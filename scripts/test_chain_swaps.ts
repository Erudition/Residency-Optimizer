import fs from 'fs';
import { Resident, ScheduleGrid, AssignmentType } from '../types';
import { chainSwapsHealer } from '../services/healers/chainSwapsHealer';
import { GENERATE_INITIAL_RESIDENTS, ACTIVE_START_YEAR } from '../constants';
import { preloadHistoricalData } from '../services/generators/historyPreloader';

async function main() {
    const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
    const data = JSON.parse(rawData);

    const nestedSchedule = data.schedules["0"].data; 
    const residents: Resident[] = data.residents || GENERATE_INITIAL_RESIDENTS();
    
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

    console.log("=== Testing Chain Swaps Healer (2 & 3 Way 4-Block) ===");
    console.time("Chain Swaps Time");
    const schedule = await chainSwapsHealer.solve(
        residents, 
        flatSchedule, 
        0, 
        history as any, 
        cohortAssignments as any, 
        (step, max, penalty) => {
            console.log(`Chain Swaps Iteration ${step} - Violations: ${penalty}`);
        }
    );
    console.timeEnd("Chain Swaps Time");
    console.log("--------------------------------------------------\n");
}

main().catch(console.error);