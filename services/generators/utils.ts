import { ScheduleGrid, AssignmentType, ScheduleCell, Resident } from '../../types';
import { TOTAL_WEEKS, fulfillsRequirement, ROTATION_METADATA } from '../../constants';

export const canFitBlock = (schedule: ScheduleGrid, residentId: string, start: number, duration: number): boolean => {
    const row = schedule[residentId];
    if (!row) return false;
    for (let i = 0; i < duration; i++) {
        const week = start + i;
        if (week < 0 || week >= row.length) continue;
        const cell = row[week];
        if (cell && (cell.assignment !== null || cell.locked)) return false;
    }
    return true;
};

export const placeBlock = (schedule: ScheduleGrid, residentId: string, start: number, duration: number, type: AssignmentType) => {
    if (!schedule[residentId]) {
        const totalWeeks = Object.values(schedule)[0]?.length || TOTAL_WEEKS;
        schedule[residentId] = Array(totalWeeks).fill(null).map(() => ({ assignment: null, locked: false }));
    }
    const row = schedule[residentId];
    for (let i = 0; i < duration; i++) {
        const week = start + i;
        if (week < 0 || week >= row.length) continue;
        if (row[week].locked) continue;
        schedule[residentId][week] = { assignment: type, locked: false };
    }
};

export const shuffle = <T>(array: T[]): T[] => [...array].sort(() => Math.random() - 0.5);

export const getRequirementCount = (row: ScheduleCell[], type: AssignmentType): number => {
    return row.filter(c => c && fulfillsRequirement(c.assignment, type)).length;
};

export const getYearRequirementCount = (
    row: ScheduleCell[],
    type: AssignmentType,
    yearStart: number,
    yearEnd: number
): number => {
    return row.slice(yearStart, yearEnd)
        .filter(c => c && fulfillsRequirement(c.assignment, type)).length;
};

export const getPriorRequirementCount = (
    priorCounts: Record<string, number>,
    type: AssignmentType
): number => {
    return priorCounts[type] || 0;
};

export const getCumulativeRequirementCount = (residentId: string, currentYearRow: ScheduleCell[], type: AssignmentType, priorRequirementCounts?: Record<string, Record<string, number>>): number => {
    let count = getRequirementCount(currentYearRow, type);
    if (type === AssignmentType.NIGHT_FLOAT) {
        return count;
    }
    if (priorRequirementCounts && priorRequirementCounts[residentId]) {
        count += priorRequirementCounts[residentId][type] || 0;
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

export const getAssignedCount = (schedule: ScheduleGrid, residents: { id: string, level: number }[], week: number, type: AssignmentType, requestedLevel?: number) => {
    return residents.filter(r => {
        const cell = schedule[r.id]?.[week];
        if (!cell || !cell.assignment) return false;
        
        // Exact match check (as used by staffing logic)
        const isMatch = cell.assignment === type;
        
        // Graduation aware level
        const currentLevel = Number(r.level) + Math.floor(week / 52);

        if (requestedLevel === 1) return currentLevel === 1 && isMatch;
        if (requestedLevel === 2) return currentLevel >= 2 && isMatch;
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

export const getCohortAtWeek = (
    r: Resident,
    w: number,
    cohortAssignments?: Record<string, number> | Record<number, Record<string, number>>
): number => {
    if (!cohortAssignments) return 0;
    const isNested = Object.values(cohortAssignments).some(val => typeof val === 'object' && val !== null);
    const startYear = r.startYear + Number(r.level) - 1;
    const academicYear = startYear + Math.floor(w / 52);
    if (isNested) {
        return (cohortAssignments as Record<number, Record<string, number>>)[academicYear]?.[r.id] ?? 0;
    } else {
        return (cohortAssignments as Record<string, number>)?.[r.id] ?? 0;
    }
};


export const getStandardCohortMap = (residents: Resident[]): Record<string, number> => {
    const sorted = [...residents].sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return a.name.localeCompare(b.name);
    });
    const map: Record<string, number> = {};
    sorted.forEach((r, idx) => {
        map[r.id] = idx % 5;
    });
    return map;
};