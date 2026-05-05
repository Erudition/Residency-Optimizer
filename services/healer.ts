import { ScheduleGrid, AssignmentType, Resident, ScheduleCell } from '../types';
import { ROTATION_METADATA, REQUIREMENTS } from '../constants';
import { canFitBlock, getAssignedCount, getYearRequirementCount } from './generators/utils';
import { getRequirementViolations, getWeeklyViolations } from './scheduler';
import { HealerConstraintGenerator } from './generators/healerSolver';

/**
 * Checks if the current schedule has any staffing violations at a given week.
 */
const getLevelAtWeek = (r: Resident, week: number, gridStartYear: number): number => {
    const currentYear = gridStartYear + Math.floor(week / 52);
    return currentYear - r.startYear + 1;
};

const hasStaffingViolationInWindow = (schedule: ScheduleGrid, residents: Resident[], startWeek: number, duration: number, gridStartYear: number): boolean => {
    for (let w = startWeek; w < startWeek + duration; w++) {
        const violated = Object.values(AssignmentType).some(type => {
            const meta = ROTATION_METADATA[type];
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
export const healSchedule = (
    schedule: ScheduleGrid,
    residents: Resident[],
    gridStartYear: number,
    maxIterations?: number,
    historicalSchedules: any = {}
): ScheduleGrid => {

    let currentSchedule = JSON.parse(JSON.stringify(schedule));
    let currentViolations = getRequirementViolations(residents, currentSchedule, historicalSchedules, gridStartYear).length;
    let currentStaffingGaps = getWeeklyViolations(residents, currentSchedule, gridStartYear).length;

    const totalWeeks = (Object.values(currentSchedule)[0] as any)?.length || 52;

    // T6.5: Deficit Recovery for split blocks (NEURO, GI, PULM)
    residents.forEach(r => {
        const rViolations = getRequirementViolations(residents, currentSchedule, historicalSchedules, gridStartYear)
            .filter(v => v.residentId === r.id && [AssignmentType.NEURO, AssignmentType.GI, AssignmentType.PULM].includes(v.type));
        
        rViolations.forEach(v => {
            const deficit = v.minWeeks - v.actual;
            let recovered = 0;
            const start = r.activeWeekStart ?? 0;
            const end = r.activeWeekEnd ?? totalWeeks;
            
            for (let w = start; w < end && recovered < deficit; w++) {
                const cell = currentSchedule[r.id]?.[w];
                if (cell && cell.assignment === AssignmentType.ELECTIVE && !cell.locked) {
                    cell.assignment = v.type;
                    recovered++;
                }
            }
        });
    });

    // Recompute current metrics after deficit recovery
    currentViolations = getRequirementViolations(residents, currentSchedule, historicalSchedules, gridStartYear).length;
    currentStaffingGaps = getWeeklyViolations(residents, currentSchedule, gridStartYear).length;

    const cohortAssignments: Record<string, number> = {};
    residents.forEach(r => {
        if (r.cohort !== undefined) {
            cohortAssignments[r.id] = r.cohort;
        }
    });

    currentSchedule = HealerConstraintGenerator.generate(
        residents,
        currentSchedule,
        0,
        historicalSchedules,
        cohortAssignments
    );
    return currentSchedule;
};
