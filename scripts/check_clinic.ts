import fs from 'fs';
import { Resident, ScheduleGrid, AssignmentType } from '../types';
import { GENERATE_INITIAL_RESIDENTS } from '../constants';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const nestedSchedule = data.schedules["0"].data; 
const residents: Resident[] = data.residents || GENERATE_INITIAL_RESIDENTS();

for (const r of residents) {
    const sched = nestedSchedule['2026']?.[r.id];
    if (!sched) continue;
    const clinicWeeks = [];
    for (let w = 0; w < 52; w++) {
        if (sched[w]?.assignment === AssignmentType.CLINIC || sched[w]?.assignment === AssignmentType.NIMA_CLINIC) {
            clinicWeeks.push(w);
        }
    }
    console.log(`${r.id} clinics:`, clinicWeeks.join(', '));
}