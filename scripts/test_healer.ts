import * as fs from 'fs';
import { healSchedule } from '../services/healer';
import { Resident, ScheduleGrid, AssignmentType } from '../types';
import { GENERATE_INITIAL_RESIDENTS, ACTIVE_START_YEAR } from '../constants';
import { preloadHistoricalData } from '../services/generators/historyPreloader';

async function run() {
    const data = JSON.parse(fs.readFileSync('schedules/best run yet.json', 'utf8'));
    
    // The schedule data is keyed by year, then by resident ID.
    // The resident IDs match the master list, but only some residents are present in each year.
    const nestedSchedule = data.schedules["0"].data; 
    const residents: Resident[] = data.residents || GENERATE_INITIAL_RESIDENTS();
    const startYear = data.startYear || ACTIVE_START_YEAR;
    
    const { history, cohortAssignments } = preloadHistoricalData(residents);
    
    console.log(`Running healer on hunter_manual.json with startYear ${startYear}...`);
    const start = Date.now();
    
    // Flattening: map each resident to their full sequence of weeks across all years (2026, 2027, 2028).
    const flatSchedule: ScheduleGrid = {};
    const years = ['2026', '2027', '2028'];
    
    residents.forEach(r => {
        flatSchedule[r.id] = [];
        years.forEach(year => {
            if (nestedSchedule[year] && nestedSchedule[year][r.id]) {
                flatSchedule[r.id].push(...nestedSchedule[year][r.id]);
            } else {
                // If resident not found for a year (e.g. resident graduated), fill with null/empty
                // The healer seems to expect a certain length. Let's fill 52 weeks of dummy.
                for (let i = 0; i < 52; i++) {
                    flatSchedule[r.id].push({ assignment: 'ELECTIVE', locked: false });
                }
            }
        });
    });

    let lastLogTime = Date.now();
    const healed = await healSchedule(flatSchedule, residents, startYear, 1000, history, cohortAssignments, (step, maxSteps, violations) => {
        const now = Date.now();
        if (now - lastLogTime > 1000 || step === maxSteps || step === 0) {
            console.log(`[${((now - start) / 1000).toFixed(1)}s] Step ${step}/${maxSteps} - Violations: ${violations}`);
            lastLogTime = now;
        }
    });
    
    const end = Date.now();
    console.log(`Healer finished in ${end - start}ms`);
    
    fs.writeFileSync('schedules/hunter_manual_healed.json', JSON.stringify({ ...data, grid: healed, residents: residents }, null, 2));
    console.log("Saved healed schedule to schedules/hunter_manual_healed.json");
}

run().catch(console.error);
