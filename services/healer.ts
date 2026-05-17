import { ScheduleGrid, AssignmentType, CODENAMES, Resident, ScheduleCell } from '../types';
import { ProgramData } from './api/client';

import { canFitBlock, getAssignedCount, getYearRequirementCount } from './generators/utils';
import { getWeeklyViolations } from './scheduler';
import { RequirementsEngine } from './requirementsEngine';
import { healer } from './healerSolver';

/**
 * Checks if the current schedule has any staffing violations at a given week.
 */
const getLevelAtWeek = (r: Resident, week: number, gridStartYear: number): number => {
    const currentYear = gridStartYear + Math.floor(week / 52);
    return currentYear - r.startYear + 1;
};

const hasStaffingViolationInWindow = (schedule: ScheduleGrid, residents: Resident[], startWeek: number, duration: number, gridStartYear: number, programData: ProgramData): boolean => {
    for (let w = startWeek; w < startWeek + duration; w++) {
        const violated = Object.values(CODENAMES).some(type => {
            const meta = programData.rotations[type];
            if (!meta) return false;

            const assignees = residents.filter(r => schedule[r.id]?.[w]?.assignment === type);
            const interns = assignees.filter(r => getLevelAtWeek(r, w, gridStartYear) === 1).length;
            const seniors = assignees.filter(r => getLevelAtWeek(r, w, gridStartYear) > 1).length;

            return (interns < (meta.minInterns || 0)) || (interns > (meta.maxInterns || 99)) ||
                   (seniors < (meta.minSeniors || 0)) || (seniors > (meta.maxSeniors || 99));
        });
        if (violated) return true;
    }
    return false;
};

/**
 * Phase 2 Healer: Post-generation hill-climbing optimization.
 * Now performs block-aware swaps (4-week or 2-week) to fix requirement gaps.
 */
export const healSchedule = async (
    schedule: ScheduleGrid,
    residents: Resident[],
    programData: ProgramData,
    gridStartYear: number,
    maxIterations?: number,
    historicalSchedules: any = {},
    cohortAssignmentsParam: any = {},
    onProgress?: (step: number, maxSteps: number, violations?: number) => void
): Promise<ScheduleGrid> => {

    let currentSchedule = JSON.parse(JSON.stringify(schedule));
    let currentViolations = RequirementsEngine.getViolations(residents, currentSchedule, historicalSchedules, gridStartYear, programData).length;
    let currentStaffingGaps = getWeeklyViolations(residents, currentSchedule, programData, gridStartYear).length;

    const totalWeeks = (Object.values(currentSchedule)[0] as any)?.length || 52;

    // T6.5: Deficit Recovery for split blocks (NEURO, GI, PULM)
    residents.forEach(r => {
        const rViolations = RequirementsEngine.getViolations(residents, currentSchedule, historicalSchedules, gridStartYear, programData)
            .filter(v => v.residentId === r.id && ['Neuro', 'GI', 'Pulm'].includes(v.type));
        
        rViolations.forEach(v => {
            const deficit = v.minWeeks - v.actual;
            let recovered = 0;
            const start = r.activeWeekStart ?? 0;
            const end = r.activeWeekEnd ?? totalWeeks;
            
            for (let w = start; w < end && recovered < deficit; w++) {
                const cell = currentSchedule[r.id]?.[w];
                if (cell && cell.assignment === 'ELECTIVE' && !cell.locked) {
                    cell.assignment = v.type;
                    recovered++;
                }
            }
        });
    });

    // Recompute current metrics after deficit recovery
    currentViolations = RequirementsEngine.getViolations(residents, currentSchedule, historicalSchedules, gridStartYear, programData).length;
    currentStaffingGaps = getWeeklyViolations(residents, currentSchedule, programData, gridStartYear).length;

    const isNested = cohortAssignmentsParam && typeof Object.values(cohortAssignmentsParam)[0] === 'object';
    const flatCohorts = isNested 
        ? (cohortAssignmentsParam[gridStartYear] || {}) 
        : (cohortAssignmentsParam || {});

    const cohortAssignments: Record<string, number> = {};
    residents.forEach(r => {
        if (flatCohorts[r.id] !== undefined) {
            cohortAssignments[r.id] = flatCohorts[r.id];
        } else if (r.cohort !== undefined) {
            cohortAssignments[r.id] = r.cohort;
        }
    });

    currentSchedule = await healer.solve(
        residents,
        currentSchedule,
        programData,
        0,
        historicalSchedules,
        cohortAssignments,
        onProgress
    );
    return currentSchedule;
};
