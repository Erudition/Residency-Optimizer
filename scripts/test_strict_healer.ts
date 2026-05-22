import * as fs from 'fs';
import { strictHealer } from '../services/healers/strictHealer';
import { Resident, ScheduleGrid, AssignmentType } from '../types';
import { GENERATE_INITIAL_RESIDENTS, ACTIVE_START_YEAR } from '../constants';
import { preloadHistoricalData } from '../services/generators/historyPreloader';

async function run() {
    const data = JSON.parse(fs.readFileSync('schedules/best run yet.json', 'utf8'));
    
    // The schedule data is keyed by year, then by resident ID.
    const nestedSchedule = data.schedules["0"].data; 
    const residents: Resident[] = data.residents || GENERATE_INITIAL_RESIDENTS();
    const startYear = data.startYear || ACTIVE_START_YEAR;
    
    const { history, cohortAssignments } = preloadHistoricalData(residents);
    
    console.log(`Running strict healer on best run yet.json with startYear ${startYear}...`);
    const start = Date.now();
    
    const flatSchedule: ScheduleGrid = {};
    const years = ['2026', '2027', '2028'];
    
    residents.forEach(r => {
        flatSchedule[r.id] = [];
        years.forEach(year => {
            if (nestedSchedule[year] && nestedSchedule[year][r.id]) {
                flatSchedule[r.id].push(...nestedSchedule[year][r.id]);
            } else {
                for (let i = 0; i < 52; i++) {
                    flatSchedule[r.id].push({ assignment: 'ELECTIVE', locked: false });
                }
            }
        });
    });

    const healed = await strictHealer.solve(
        residents, 
        flatSchedule, 
        0, 
        history as any, 
        cohortAssignments as any, 
        (step, maxSteps, violations) => {
            console.log(`[${((Date.now() - start) / 1000).toFixed(1)}s] Iteration ${step} - Violations: ${violations}`);
        }
    );
    
    const end = Date.now();
    console.log(`Healer finished in ${end - start}ms`);
    
    fs.writeFileSync('schedules/best_run_strict_healed.json', JSON.stringify({ ...data, grid: healed, residents: residents }, null, 2));
    console.log("Saved healed schedule to schedules/best_run_strict_healed.json");
}

run().catch(console.error);
