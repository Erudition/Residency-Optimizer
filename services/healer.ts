import { ScheduleGrid, AssignmentType, Resident, ScheduleCell } from '../types';
import { ROTATION_METADATA, REQUIREMENTS } from '../constants';
import { canFitBlock, getAssignedCount, getYearRequirementCount } from './generators/utils';
import { getRequirementViolations, getWeeklyViolations } from './scheduler';

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
    maxIterations: number = 2000
): ScheduleGrid => {

    let currentSchedule = JSON.parse(JSON.stringify(schedule));
    let currentViolations = getRequirementViolations(residents, currentSchedule, {}, gridStartYear).length;
    let currentStaffingGaps = getWeeklyViolations(residents, currentSchedule, gridStartYear).length;

    const totalWeeks = (Object.values(currentSchedule)[0] as any)?.length || 52;

    for (let i = 0; i < maxIterations; i++) {
        // Targeted selection: pick a resident with at least one violation 50% of the time
        let resident = residents[Math.floor(Math.random() * residents.length)];
        if (Math.random() < 0.5) {
            const violations = getRequirementViolations(residents, currentSchedule, {}, gridStartYear);
            if (violations.length > 0) {
                const targetId = violations[Math.floor(Math.random() * violations.length)].residentId;
                resident = residents.find(r => r.id === targetId) || resident;
            }
        }

        const row = currentSchedule[resident.id];
        if (!row) continue;
        
        // Pick duration: 4 (60%), 2 (30%), 1 (10%)
        const rand = Math.random();
        const duration = rand < 0.6 ? 4 : (rand < 0.9 ? 2 : 1);
        
        // Pick two random start weeks
        const w1 = Math.floor(Math.random() * (totalWeeks - duration));
        const w2 = Math.floor(Math.random() * (totalWeeks - duration));
        
        if (Math.abs(w1 - w2) < duration) continue;

        // Alignment check: In a 4+1 system, swaps should ideally be aligned to 5-week cycles
        // to avoid splitting blocks across clinic weeks.
        const cohort = resident.cohort || 0;
        const clinicOffset = (4 - cohort + 5) % 5;
        
        // For block swaps (4 or 2), try to stay within the 4-week inpatient window
        const isClinicInW1 = Array.from({length: duration}, (_, k) => (w1 + k) % 5 === clinicOffset).some(v => v);
        const isClinicInW2 = Array.from({length: duration}, (_, k) => (w2 + k) % 5 === clinicOffset).some(v => v);

        // If one has a clinic week and the other doesn't, it's a "bad" swap for cadence
        if (isClinicInW1 !== isClinicInW2) {
            if (Math.random() < 0.8) continue; // Reject 80% of cadence-breaking swaps
        }

        const window1 = row.slice(w1, w1 + duration);
        const window2 = row.slice(w2, w2 + duration);
        
        if (window1.some(c => c.locked) || window2.some(c => c.locked)) continue;
        
        const type1 = window1[0].assignment;
        const type2 = window2[0].assignment;
        
        if (type1 === type2) continue;

        // Perform swap
        for (let d = 0; d < duration; d++) {
            const temp = currentSchedule[resident.id][w1 + d];
            currentSchedule[resident.id][w1 + d] = currentSchedule[resident.id][w2 + d];
            currentSchedule[resident.id][w2 + d] = temp;
        }

        // Validate staffing (Never introduce new staffing gaps)
        const newStaffingGaps = getWeeklyViolations(residents, currentSchedule, gridStartYear).length;
        if (newStaffingGaps > currentStaffingGaps) {
            // Revert
            for (let d = 0; d < duration; d++) {
                const temp = currentSchedule[resident.id][w1 + d];
                currentSchedule[resident.id][w1 + d] = currentSchedule[resident.id][w2 + d];
                currentSchedule[resident.id][w2 + d] = temp;
            }
            continue;
        }

        // Validate Requirements (Hill-climbing: only keep if improvement or same)
        const newViolations = getRequirementViolations(residents, currentSchedule, {}, gridStartYear).length;
        if (newViolations <= currentViolations) {
            currentViolations = newViolations;
            currentStaffingGaps = newStaffingGaps;
        } else {
            // Revert
            for (let d = 0; d < duration; d++) {
                const temp = currentSchedule[resident.id][w1 + d];
                currentSchedule[resident.id][w1 + d] = currentSchedule[resident.id][w2 + d];
                currentSchedule[resident.id][w2 + d] = temp;
            }
        }
    }

    return currentSchedule;
};
