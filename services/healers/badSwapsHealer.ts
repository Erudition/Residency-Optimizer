import { Resident, ScheduleGrid, AssignmentType } from '../../types';
import { ROTATION_METADATA, ELECTIVE_TYPES } from '../../constants';
import { HealerSolver } from '../healerSolver';
import { RequirementsEngine } from '../requirementsEngine';

export const badSwapsHealer: HealerSolver = {
    name: "Bad Swaps Healer (1 Block)",
    solve: async (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number>, onProgress?: (step: number, maxSteps: number, currentPenalty: number) => void): Promise<ScheduleGrid> => {
        let schedule = JSON.parse(JSON.stringify(existingSchedule));
        
        // Fast localized evaluation
        const totalWeeks = schedule[residents[0].id].length;
        const activeYear = 2026;

        const getReqViolationsForResidents = (resList: Resident[], grid: ScheduleGrid): number => {
            return RequirementsEngine.getViolations(resList, grid, priorRequirementCounts as any || {}, activeYear).length;
        };

        const getStaffingGapsForWeeks = (weeks: number[], grid: ScheduleGrid): number => {
            let gaps = 0;
            const flexibleAssigns = [...ELECTIVE_TYPES, AssignmentType.AMCS_CONSULTS];

            weeks.forEach(week => {
                const assignments = residents.map(r => grid[r.id]?.[week]?.assignment);
                const clinicCount = assignments.filter(a => a === AssignmentType.CLINIC || a === AssignmentType.NIMA_CLINIC).length;
                if (clinicCount === 0) gaps++;

                Object.values(AssignmentType).forEach(type => {
                    const meta = ROTATION_METADATA[type];
                    if (!meta) return;

                    let interns = 0;
                    let seniors = 0;
                    residents.forEach(r => {
                        if (grid[r.id]?.[week]?.assignment === type) {
                            const pgy = Number(r.level) + Math.floor(week / 52);
                            if (pgy === 1) interns++;
                            if (pgy > 1) seniors++;
                        }
                    });

                    if (interns < meta.minInterns) gaps++;
                    if (interns > meta.maxInterns) gaps++;
                    if (seniors < meta.minSeniors) gaps++;
                    if (seniors > meta.maxSeniors) gaps++;
                });

                let jeopardyPgy2 = 0;
                let jeopardyPgy3 = 0;
                let seniorFlexibleCount = 0;
                residents.forEach(r => {
                    const pgy = Number(r.level) + Math.floor(week / 52);
                    const assign = grid[r.id]?.[week]?.assignment;
                    if (assign) {
                        if (flexibleAssigns.includes(assign)) {
                            if (pgy === 2) jeopardyPgy2++;
                            if (pgy === 3) jeopardyPgy3++;
                            if (pgy > 1) seniorFlexibleCount++;
                        }
                    }
                });

                if (jeopardyPgy2 < 1) gaps++;
                if (jeopardyPgy3 < 1) gaps++;
                if (seniorFlexibleCount === 0) gaps++;
            });
            return gaps;
        };

        const allWeeks = Array.from({length: totalWeeks}, (_, i) => i);
        let currentReqViolations = getReqViolationsForResidents(residents, schedule);
        let currentStaffingGaps = getStaffingGapsForWeeks(allWeeks, schedule);
        let currentTotalViolations = currentReqViolations + currentStaffingGaps;

        console.log(`[Bad Swaps] Initial violations: ${currentTotalViolations} (Req: ${currentReqViolations}, Staffing: ${currentStaffingGaps})`);

        if (currentTotalViolations === 0) return schedule;

        const maxIter = 500;
        let improved = true;
        let iter = 0;

        while (improved && iter < maxIter) {
            improved = false;
            iter++;
            let swaps1Block = 0;

            // 3. Single week mutations
            for (let i = 0; i < residents.length; i++) {
                const r = residents[i];
                for (let w = 0; w < totalWeeks; w++) {
                    const c = schedule[r.id][w];
                    if (!c || c.locked || c.assignment === AssignmentType.CLINIC || c.assignment === AssignmentType.NIMA_CLINIC) continue;
                    
                    const oldA = c.assignment;
                    
                    const oldStaffGaps = getStaffingGapsForWeeks([w], schedule);
                    const oldReqViolations = getReqViolationsForResidents([r], schedule);

                    let mutated = false;
                    for (const a of Object.values(AssignmentType)) {
                        if (a === oldA || a === AssignmentType.CLINIC || a === AssignmentType.NIMA_CLINIC || a === AssignmentType.VACATION) continue;
                        
                        schedule[r.id][w].assignment = a;
                        
                        const newStaffGaps = getStaffingGapsForWeeks([w], schedule);
                        if (newStaffGaps > oldStaffGaps) {
                            continue;
                        }

                        const newReqViolations = getReqViolationsForResidents([r], schedule);
                        
                        const deltaStaff = newStaffGaps - oldStaffGaps;
                        const deltaReq = newReqViolations - oldReqViolations;
                        const deltaTotal = deltaStaff + deltaReq;

                        if (deltaTotal < 0) {
                            currentStaffingGaps += deltaStaff;
                            currentReqViolations += deltaReq;
                            currentTotalViolations += deltaTotal;
                            improved = true;
                            mutated = true;
                            swaps1Block++;
                            break; // Break type loop, proceed to next week
                        }
                    }
                    if (!mutated) {
                        schedule[r.id][w].assignment = oldA;
                    }
                }
            }
            
            if (onProgress) onProgress(iter, maxIter, currentTotalViolations);
            console.log(`[Bad Swaps] Iteration ${iter} finished. Beneficial Swaps -> 1-Block: ${swaps1Block}. Violations: ${currentTotalViolations} (Req: ${currentReqViolations}, Staff: ${currentStaffingGaps})`);
        }

        console.log(`[Bad Swaps] Final violations: ${currentTotalViolations} (Req: ${currentReqViolations}, Staffing: ${currentStaffingGaps})`);
        return schedule;
    }
};