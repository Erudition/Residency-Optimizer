import * as fs from 'fs';
import { healSchedule } from '../services/healer';
import { Resident, ScheduleGrid, AssignmentType } from '../types';
import { GENERATE_INITIAL_RESIDENTS, LATEST_HISTORICAL_YEAR } from '../constants';
import { preloadHistoricalData } from '../services/generators/historyPreloader';

async function run() {
    const data = JSON.parse(fs.readFileSync('schedules/best run yet.json', 'utf8'));
    
    // The schedule data is keyed by year, then by resident ID.
    const nestedSchedule = data.schedules["0"].data; 
    const residents: Resident[] = data.residents || GENERATE_INITIAL_RESIDENTS();
    const startYear = data.startYear || LATEST_HISTORICAL_YEAR;
    
    const { history, cohortAssignments } = preloadHistoricalData(residents);
    
    console.log(`Running healer on best run yet.json with startYear ${startYear}...`);
    const start = Date.now();
    
    let acceptedSwaps = 0;
    let proposedSwaps = 0;

    // We can hook into the healerSolver's logic if we want, 
    // but the healer exported from healer.ts calls healerSolver.solve.
    // For now, let's track progress and see if we can infer swap efficiency.
    
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

    const healed = await healSchedule(flatSchedule, residents, startYear, 2000000, history, cohortAssignments, (step, maxSteps, violations) => {
        if (step % 50000 === 0) {
            console.log(`[${((Date.now() - start) / 1000).toFixed(1)}s] Step ${step}/${maxSteps} - Violations: ${violations}`);
        }
    });
    
    const end = Date.now();
    console.log(`Healer finished in ${end - start}ms`);
    
    fs.writeFileSync('schedules/best_run_healed_deep.json', JSON.stringify({ ...data, grid: healed, residents: residents }, null, 2));
}

run().catch(console.error);
