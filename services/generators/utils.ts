
import { ScheduleGrid, AssignmentType, ScheduleCell } from '../../types';
import { TOTAL_WEEKS } from '../../constants';

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

export const isWards = (type: AssignmentType | null) => type === AssignmentType.WARDS_RED || type === AssignmentType.WARDS_BLUE || type === AssignmentType.MET_WARDS;

export const getRequirementCount = (row: ScheduleCell[], type: AssignmentType, level: number): number => {
    if (!row) return 0;
    if (isWards(type)) {
        return row.filter(c => c && isWards(c.assignment)).length;
    }
    return row.filter(c => c && c.assignment === type).length;
};
