import { ScheduleGrid, AssignmentType, ScheduleCell, ScheduleHistory } from '../../types';
import { TOTAL_WEEKS, fulfillsRequirement } from '../../constants';

export const canFitBlock = (schedule: ScheduleGrid, residentId: string, start: number, duration: number): boolean => {
    if (start < 0 || start + duration > TOTAL_WEEKS) return false;
    const row = schedule[residentId];
    if (!row) return false;
    for (let i = 0; i < duration; i++) {
        const cell = row[start + i];
        if (cell && cell.assignment !== null) return false;
    }
    return true;
};

export const placeBlock = (schedule: ScheduleGrid, residentId: string, start: number, duration: number, type: AssignmentType) => {
    if (!schedule[residentId]) {
        schedule[residentId] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
    }
    for (let i = 0; i < duration; i++) {
        schedule[residentId][start + i] = { assignment: type, locked: false };
    }
};

export const shuffle = <T>(array: T[]): T[] => [...array].sort(() => Math.random() - 0.5);

export const getRequirementCount = (row: ScheduleCell[], type: AssignmentType): number => {
    return row.filter(c => c && fulfillsRequirement(c.assignment, type)).length;
};

export const getCumulativeRequirementCount = (residentId: string, currentYearRow: ScheduleCell[], type: AssignmentType, history?: ScheduleHistory): number => {
    let total = getRequirementCount(currentYearRow, type);
    if (!history) return total;

    Object.values(history).forEach(grid => {
        const row = grid[residentId];
        if (row) {
            total += row.filter(c => c && fulfillsRequirement(c.assignment, type)).length;
        }
    });
    return total;
};
export const isAligned = (w: number, cohort: number, dur: number): boolean => {
    // COHORT_COUNT is 5
    const COHORT_COUNT = 5;
    if (dur !== 4 && dur !== 2) return true;
    const offset = (w % COHORT_COUNT);
    const startRelToClinic = (offset - cohort + COHORT_COUNT) % COHORT_COUNT;
    if (dur === 4) return startRelToClinic === 1;
    if (dur === 2) return startRelToClinic === 1 || startRelToClinic === 3;
    return true;
};

export const getAssignedCount = (schedule: ScheduleGrid, residents: { id: string, level: number }[], week: number, type: AssignmentType, level?: number) => {
    return residents.filter(r => {
        if (level === 1) return r.level === 1 && schedule[r.id]?.[week]?.assignment === type;
        if (level === 2) return r.level >= 2 && schedule[r.id]?.[week]?.assignment === type;
        return schedule[r.id]?.[week]?.assignment === type;
    }).length;
};
