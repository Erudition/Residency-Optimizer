import { ScheduleGrid, AssignmentType, Resident, ScheduleCell } from '../types';
import { ROTATION_METADATA } from '../constants';
import { canFitBlock, getAssignedCount } from './generators/utils';
import { getRequirementViolations } from './scheduler';
/**
 * Checks if the current schedule has any staffing violations at a given week.
 */
const getLevelAtWeek = (r: Resident, week: number, gridStartYear: number): number => {
    const currentYear = gridStartYear + Math.floor(week / 52);
    return currentYear - r.startYear + 1;
};

const hasStaffingViolation = (schedule: ScheduleGrid, residents: Resident[], week: number, gridStartYear: number): boolean => {
    return Object.values(AssignmentType).some(type => {
        const meta = ROTATION_METADATA[type];
        if (!meta) return false;

        const assignees = residents.filter(r => schedule[r.id]?.[week]?.assignment === type);
        const interns = assignees.filter(r => getLevelAtWeek(r, week, gridStartYear) === 1).length;
        const seniors = assignees.filter(r => getLevelAtWeek(r, week, gridStartYear) > 1).length;

        return (interns < (meta.minInterns || 0)) || (interns > (meta.maxInterns || 99)) ||
               (seniors < (meta.minSeniors || 0)) || (seniors > (meta.maxSeniors || 99));
    });
};

/**
 * Phase 2 Healer: Post-generation hill-climbing optimization.
 */
export const healSchedule = (
    schedule: ScheduleGrid,
    residents: Resident[],
    gridStartYear: number,
    maxIterations: number = 1000
): ScheduleGrid => {

    let currentSchedule = JSON.parse(JSON.stringify(schedule));
    
    let currentViolations = getRequirementViolations(residents, currentSchedule).length;

    // Simple hill-climbing: try random swaps
    for (let i = 0; i < maxIterations; i++) {
        const useCrossResident = Math.random() < 0.3; // 30% chance for cross-resident swap

        if (useCrossResident) {
            // CROSS-RESIDENT SWAP
            const r1 = residents[Math.floor(Math.random() * residents.length)];
            const r2 = residents[Math.floor(Math.random() * residents.length)];
            if (r1.id === r2.id) continue;

            const weeks = schedule[r1.id].length;
            const w = Math.floor(Math.random() * weeks);

            const cell1 = currentSchedule[r1.id][w];
            const cell2 = currentSchedule[r2.id][w];

            if (cell1.locked || cell2.locked) continue;
            if (cell1.assignment === cell2.assignment) continue;

            // Swap them
            currentSchedule[r1.id][w] = { ...cell2 };
            currentSchedule[r2.id][w] = { ...cell1 };

            if (hasStaffingViolation(currentSchedule, residents, w, gridStartYear)) {
                // Revert
                currentSchedule[r1.id][w] = { ...cell1 };
                currentSchedule[r2.id][w] = { ...cell2 };
            } else {
                const newViolations = getRequirementViolations(residents, currentSchedule, {}, gridStartYear).length;
                if (newViolations > currentViolations) {
                    // Revert
                    currentSchedule[r1.id][w] = { ...cell1 };
                    currentSchedule[r2.id][w] = { ...cell2 };
                } else {
                    currentViolations = newViolations;
                }
            }
        } else {
            // INTRA-RESIDENT SWAP
            const resident = residents[Math.floor(Math.random() * residents.length)];
            const weeks = currentSchedule[resident.id].length;
            const w1 = Math.floor(Math.random() * weeks);
            const w2 = Math.floor(Math.random() * weeks);
            
            if (w1 === w2) continue;
            
            const cell1 = currentSchedule[resident.id][w1];
            const cell2 = currentSchedule[resident.id][w2];
            
            if (cell1.locked || cell2.locked) continue;
            
            // Perform swap
            currentSchedule[resident.id][w1] = { ...cell2 };
            currentSchedule[resident.id][w2] = { ...cell1 };
            
            // Check if swap is valid (staffing)
            if (hasStaffingViolation(currentSchedule, residents, w1, gridStartYear) || hasStaffingViolation(currentSchedule, residents, w2, gridStartYear)) {
                // Revert
                currentSchedule[resident.id][w1] = { ...cell1 };
                currentSchedule[resident.id][w2] = { ...cell2 };
            } else {
                const newViolations = getRequirementViolations(residents, currentSchedule, {}, gridStartYear).length;
                if (newViolations > currentViolations) {
                    // Revert
                    currentSchedule[resident.id][w1] = { ...cell1 };
                    currentSchedule[resident.id][w2] = { ...cell2 };
                } else {
                    currentViolations = newViolations;
                }
            }
        }
    }
    
    return currentSchedule;
};
