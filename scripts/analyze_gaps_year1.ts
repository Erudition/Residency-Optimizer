import fs from 'fs';
import { Resident, ScheduleGrid, AssignmentType } from '../types';
import { ROTATION_METADATA, ELECTIVE_TYPES, GENERATE_INITIAL_RESIDENTS, ACTIVE_START_YEAR } from '../constants';

const rawData = fs.readFileSync('schedules/best run yet.json', 'utf-8');
const data = JSON.parse(rawData);

const nestedSchedule = data.schedules["0"].data; 
const residents: Resident[] = data.residents || GENERATE_INITIAL_RESIDENTS();

const activeYear = 2026;
residents.forEach(r => {
    if (!r.startYear) r.startYear = activeYear - Number(r.level) + 1;
    r.level = Number(activeYear - r.startYear + 1) as 1|2|3;
});

const flatSchedule: ScheduleGrid = {};
residents.forEach(r => {
    flatSchedule[r.id] = nestedSchedule['2026']?.[r.id] || [];
});

let gaps = 0;
const flexibleAssigns = [...ELECTIVE_TYPES, AssignmentType.AMCS_CONSULTS];
const gapCounts: Record<string, number> = {};

for (let week = 0; week < 52; week++) {
    const assignments = residents.map(r => flatSchedule[r.id]?.[week]?.assignment);
    const clinicCount = assignments.filter(a => a === AssignmentType.CLINIC || a === AssignmentType.NIMA_CLINIC).length;
    if (clinicCount === 0) {
        gapCounts['0 Clinic'] = (gapCounts['0 Clinic'] || 0) + 1;
        gaps++;
    }

    Object.values(AssignmentType).forEach(type => {
        const meta = ROTATION_METADATA[type];
        if (!meta) return;

        let interns = 0;
        let seniors = 0;
        residents.forEach(r => {
            if (flatSchedule[r.id]?.[week]?.assignment === type) {
                const pgy = Number(r.level);
                if (pgy === 1) interns++;
                if (pgy > 1) seniors++;
            }
        });

        if (interns < meta.minInterns) { gapCounts[`${type} minInterns`] = (gapCounts[`${type} minInterns`] || 0) + 1; gaps++; }
        if (interns > meta.maxInterns) { gapCounts[`${type} maxInterns`] = (gapCounts[`${type} maxInterns`] || 0) + 1; gaps++; }
        if (seniors < meta.minSeniors) { gapCounts[`${type} minSeniors`] = (gapCounts[`${type} minSeniors`] || 0) + 1; gaps++; }
        if (seniors > meta.maxSeniors) { gapCounts[`${type} maxSeniors`] = (gapCounts[`${type} maxSeniors`] || 0) + 1; gaps++; }
    });

    let jeopardyPgy2 = 0;
    let jeopardyPgy3 = 0;
    let seniorFlexibleCount = 0;
    residents.forEach(r => {
        const pgy = Number(r.level);
        const assign = flatSchedule[r.id]?.[week]?.assignment;
        if (assign && flexibleAssigns.includes(assign)) {
            if (pgy === 2) jeopardyPgy2++;
            if (pgy === 3) jeopardyPgy3++;
            if (pgy > 1) seniorFlexibleCount++;
        }
    });

    if (jeopardyPgy2 < 1) { gapCounts['No PGY2 Jeopardy'] = (gapCounts['No PGY2 Jeopardy'] || 0) + 1; gaps++; }
    if (jeopardyPgy3 < 1) { gapCounts['No PGY3 Jeopardy'] = (gapCounts['No PGY3 Jeopardy'] || 0) + 1; gaps++; }
    if (seniorFlexibleCount === 0) { gapCounts['No Senior Jeopardy'] = (gapCounts['No Senior Jeopardy'] || 0) + 1; gaps++; }
}

console.log("Total gaps for 2026:", gaps);
console.log("Breakdown:", Object.entries(gapCounts).sort((a,b) => b[1] - a[1]));