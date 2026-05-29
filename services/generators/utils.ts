import { ProgramData } from '../api/client';
import { ScheduleGrid, AssignmentType, ScheduleCell, Resident } from '../../types';
import { TOTAL_WEEKS } from '../../constants';
import { RequirementsEngine } from '../requirementsEngine';

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

export const getRequirementCount = (row: ScheduleCell[], type: AssignmentType, programData: ProgramData): number => {
    return row.filter(c => c && RequirementsEngine.fulfills(c.assignment, type, programData)).length;
};

export const getYearRequirementCount = (
    row: ScheduleCell[],
    type: AssignmentType,
    yearStart: number,
    yearEnd: number,
    programData: ProgramData
): number => {
    return row.slice(yearStart, yearEnd)
        .filter(c => c && RequirementsEngine.fulfills(c.assignment, type, programData)).length;
};

export const getPriorRequirementCount = (
    priorCounts: Record<string, number>,
    type: AssignmentType
): number => {
    return priorCounts[type] || 0;
};

export const getCumulativeRequirementCount = (residentId: string, currentYearRow: ScheduleCell[], type: AssignmentType, programData: ProgramData, priorRequirementCounts?: Record<string, Record<string, number>>): number => {
    let count = getRequirementCount(currentYearRow, type, programData);
    if (type === 'NF') {
        return count;
    }
    if (priorRequirementCounts && priorRequirementCounts[residentId]) {
        count += priorRequirementCounts[residentId][type] || 0;
    }
    return count;
};
export const isAligned = (w: number, cohort: number, dur: number, programData: ProgramData): boolean => {
    const { X, Y, Z } = programData.cycleConfig;
    const blockStart = (cohort * Y + Y) % Z;
    const startRelToInpatient = ((w % Z) - blockStart + Z) % Z;
    
    if (dur === X) return startRelToInpatient === 0;
    if (dur === X / 2) return startRelToInpatient === 0 || startRelToInpatient === X / 2;
    
    // For truncated durations resulting from year boundaries or upcoming clinics:
    // They must STILL start at the beginning of the inpatient block OR exactly at a year boundary.
    if (w % 52 === 0) return true;
    
    return startRelToInpatient === 0;
};

export const getPgy = (res: any, week: number, residents: any[]): number => {
    if (res.startYear && res.startYear > 0) {
        const firstRes = residents.find((r: any) => r.startYear && r.startYear > 0);
        const gridStartYear = firstRes ? (firstRes.startYear + Number(firstRes.level) - 1) : 2025;
        return Math.min(3, gridStartYear + Math.floor(week / 52) - res.startYear + 1);
    }
    return Math.min(3, (Number(res.level) || 1) + Math.floor(week / 52));
};

export const getAssignedCount = (schedule: ScheduleGrid, residents: any[], week: number, type: AssignmentType, requestedLevel?: number) => {
    return residents.filter(r => {
        const cell = schedule[r.id]?.[week];
        if (!cell || !cell.assignment) return false;
        
        // Exact match check (as used by staffing logic)
        const isMatch = cell.assignment === type;
        
        // Graduation aware level
        const currentLevel = getPgy(r, week, residents);

        if (requestedLevel === 1) return currentLevel === 1 && isMatch;
        if (requestedLevel === 2) return currentLevel >= 2 && isMatch;
        return isMatch;
    }).length;
};

export const canPlaceWithoutViolation = (schedule: ScheduleGrid, residents: { id: string, level: number }[], start: number, duration: number, type: AssignmentType, level: number, programData: ProgramData): boolean => {
    const meta = programData.rotations.get(type);
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
    if (!cohortAssignments) return r.cohort !== undefined ? r.cohort : 0;
    const isNested = Object.values(cohortAssignments).some(val => typeof val === 'object' && val !== null);
    const startYear = r.startYear + Number(r.level) - 1;
    const academicYear = startYear + Math.floor(w / 52);
    if (isNested) {
        const yearMap = (cohortAssignments as Record<number, Record<string, number>>)[academicYear];
        if (yearMap && yearMap[r.id] !== undefined) {
            return yearMap[r.id];
        }
        return r.cohort !== undefined ? r.cohort : 0;
    } else {
        const val = (cohortAssignments as Record<string, number>)?.[r.id];
        if (val !== undefined) return val;
        return r.cohort !== undefined ? r.cohort : 0;
    }
};


export const getStandardCohortMap = (residents: Resident[], programData: ProgramData): Record<string, number> => {
    const sorted = [...residents].sort((a, b) => {
        if (a.level !== b.level) return a.level - b.level;
        return a.name.localeCompare(b.name);
    });
    const map: Record<string, number> = {};
    sorted.forEach((r, idx) => {
        map[r.id] = idx % programData.cycleConfig.cohortCount;
    });
    return map;
};
export const getCappedDuration = (w: number, cohort: number, requestedDur: number, totalWeeks: number, programData: ProgramData): number => {
    const { X, Y, Z } = programData.cycleConfig;
    let maxDurBeforeClinic = requestedDur;
    for (let i = w; i < Math.min(w + requestedDur, totalWeeks); i++) {
        if (Math.floor((i % Z) / Y) === cohort) {
            maxDurBeforeClinic = i - w;
            break;
        }
    }
    const nextYearBoundary = Math.ceil((w + 1) / 52) * 52;
    return Math.min(requestedDur, maxDurBeforeClinic, nextYearBoundary - w, totalWeeks - w);
};
