import { ScheduleGrid, AssignmentType, ScheduleCell, ScheduleHistory } from '../../types';
import { TOTAL_WEEKS, fulfillsRequirement, ROTATION_METADATA } from '../../constants';

export const canFitBlock = (schedule: ScheduleGrid, residentId: string, start: number, duration: number): boolean => {
    const row = schedule[residentId];
    if (!row) return false;
    for (let i = 0; i < duration; i++) {
        const week = start + i;
        if (week < 0 || week >= TOTAL_WEEKS) continue;
        const cell = row[week];
        if (cell && cell.assignment !== null) return false;
    }
    return true;
};

export const placeBlock = (schedule: ScheduleGrid, residentId: string, start: number, duration: number, type: AssignmentType) => {
    if (!schedule[residentId]) {
        schedule[residentId] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
    }
    for (let i = 0; i < duration; i++) {
        const week = start + i;
        if (week < 0 || week >= TOTAL_WEEKS) continue;
        schedule[residentId][week] = { assignment: type, locked: false };
    }
};

export const shuffle = <T>(array: T[]): T[] => [...array].sort(() => Math.random() - 0.5);

export const getRequirementCount = (row: ScheduleCell[], type: AssignmentType): number => {
    return row.filter(c => c && fulfillsRequirement(c.assignment, type)).length;
};

export const getCumulativeRequirementCount = (residentId: string, currentYearRow: ScheduleCell[], type: AssignmentType, history?: ScheduleHistory): number => {
    let count = getRequirementCount(currentYearRow, type);
    if (type === AssignmentType.NIGHT_FLOAT) {
        return count;
    }
    if (history) {
        for (const year in history) {
            const yearSchedule = history[year];
            const row = yearSchedule[residentId];
            if (row) {
                count += getRequirementCount(row, type);
            }
        }
    }
    return count;
};
export const isAligned = (w: number, cohort: number, dur: number): boolean => {
    // COHORT_COUNT is 5
    const COHORT_COUNT = 5;
    if (dur !== 4 && dur !== 2) return true;
    const offset = ((w % COHORT_COUNT) + COHORT_COUNT) % COHORT_COUNT;
    const startRelToClinic = (offset - cohort + COHORT_COUNT) % COHORT_COUNT;
    if (dur === 4) return startRelToClinic === 1;
    if (dur === 2) return startRelToClinic === 1 || startRelToClinic === 3;
    return true;
};

export const getAssignedCount = (schedule: ScheduleGrid, residents: { id: string, level: number }[], week: number, type: AssignmentType, level?: number) => {
    return residents.filter(r => {
        const cell = schedule[r.id]?.[week];
        if (!cell || !cell.assignment) return false;
        
        // Exact match check (as used by staffing logic)
        const isMatch = cell.assignment === type;
        
        if (level === 1) return r.level === 1 && isMatch;
        if (level === 2) return r.level >= 2 && isMatch;
        return isMatch;
    }).length;
};

export const canPlaceWithoutViolation = (schedule: ScheduleGrid, residents: { id: string, level: number }[], start: number, duration: number, type: AssignmentType, level: number): boolean => {
    const meta = ROTATION_METADATA[type];
    if (!meta) return true;
    const max = (level === 1) ? (meta.maxInterns || 99) : (meta.maxSeniors || 99);
    
    for (let i = 0; i < duration; i++) {
        if (getAssignedCount(schedule, residents, start + i, type, level) >= max) return false;
    }
    return true;
};
