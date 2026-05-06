import { Resident, ScheduleGrid, AssignmentType, WeeklyViolation } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, ACGME_TYPES, ELECTIVE_TYPES } from '../../constants';
import { HealerSolver } from '../healerSolver';
import { RequirementsEngine } from '../requirementsEngine';

export const strictHealer: HealerSolver = {
    name: "Strict Phase 4 Healer",
    solve: async (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number>, onProgress?: (step: number, maxSteps: number, currentPenalty: number) => void): Promise<ScheduleGrid> => {
        let schedule = JSON.parse(JSON.stringify(existingSchedule));
        
        // Fast localized evaluation
        const totalWeeks = schedule[residents[0].id].length;
        const activeYear = 2026;

        // Evaluate requirement violations for specific residents
        const getReqViolationsForResidents = (resList: Resident[], grid: ScheduleGrid): number => {
            return RequirementsEngine.getViolations(resList, grid, priorRequirementCounts as any || {}, activeYear).length;
        };

        // Evaluate staffing gaps for specific weeks
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

                // Jeopardy
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

        // Baseline global evaluation
        const allWeeks = Array.from({length: totalWeeks}, (_, i) => i);
        let currentReqViolations = getReqViolationsForResidents(residents, schedule);
        let currentStaffingGaps = getStaffingGapsForWeeks(allWeeks, schedule);
        let currentTotalViolations = currentReqViolations + currentStaffingGaps;

        console.log(`Initial violations: ${currentTotalViolations} (Req: ${currentReqViolations}, Staffing: ${currentStaffingGaps})`);

        if (currentTotalViolations === 0) return schedule;

        const maxIter = 500;
        let improved = true;
        let iter = 0;

        while (improved && iter < maxIter) {
            improved = false;
            iter++;
            let swaps4Block = 0;
            let swaps2Block = 0;
            let swaps1Block = 0;

            // 1. Cross-Resident 4-Block Swaps
            for (let i = 0; i < residents.length; i++) {
                const r1 = residents[i];
                for (let j = i + 1; j < residents.length; j++) {
                    const r2 = residents[j];
                    if (r1.level !== r2.level) continue;

                    for (let w = 0; w < totalWeeks - 3; w++) {
                        let valid = true;
                        let same = true;
                        for (let k = 0; k < 4; k++) {
                            const c1 = schedule[r1.id][w + k];
                            const c2 = schedule[r2.id][w + k];
                            if (!c1 || !c2 || c1.locked || c2.locked || 
                                c1.assignment === AssignmentType.CLINIC || c2.assignment === AssignmentType.CLINIC ||
                                c1.assignment === AssignmentType.NIMA_CLINIC || c2.assignment === AssignmentType.NIMA_CLINIC) {
                                valid = false;
                                break;
                            }
                            if (c1.assignment !== c2.assignment) same = false;
                        }
                        if (!valid || same) continue;

                        const changedWeeks = [w, w+1, w+2, w+3];
                        
                        // Calculate pre-swap localized violations
                        const oldStaffGaps = getStaffingGapsForWeeks(changedWeeks, schedule);
                        const oldReqViolations = getReqViolationsForResidents([r1, r2], schedule);

                        // Perform swap IN PLACE
                        for (let k = 0; k < 4; k++) {
                            const temp = schedule[r1.id][w + k].assignment;
                            schedule[r1.id][w + k].assignment = schedule[r2.id][w + k].assignment;
                            schedule[r2.id][w + k].assignment = temp;
                        }

                        // Calculate post-swap localized violations
                        const newStaffGaps = getStaffingGapsForWeeks(changedWeeks, schedule);
                        
                        if (newStaffGaps > oldStaffGaps) {
                            // Revert and continue
                            for (let k = 0; k < 4; k++) {
                                const temp = schedule[r1.id][w + k].assignment;
                                schedule[r1.id][w + k].assignment = schedule[r2.id][w + k].assignment;
                                schedule[r2.id][w + k].assignment = temp;
                            }
                            continue;
                        }

                        const newReqViolations = getReqViolationsForResidents([r1, r2], schedule);
                        
                        const deltaStaff = newStaffGaps - oldStaffGaps;
                        const deltaReq = newReqViolations - oldReqViolations;
                        const deltaTotal = deltaStaff + deltaReq;

                        if (deltaTotal < 0) {
                            // Accept swap
                            currentStaffingGaps += deltaStaff;
                            currentReqViolations += deltaReq;
                            currentTotalViolations += deltaTotal;
                            improved = true;
                            swaps4Block++;
                            w += 3; // Skip the rest of this 4-week block
                        } else {
                            // Revert
                            for (let k = 0; k < 4; k++) {
                                const temp = schedule[r1.id][w + k].assignment;
                                schedule[r1.id][w + k].assignment = schedule[r2.id][w + k].assignment;
                                schedule[r2.id][w + k].assignment = temp;
                            }
                        }
                    }
                }
            }

            // 2. Intra-Resident 2-Block Swaps
            for (let i = 0; i < residents.length; i++) {
                const r = residents[i];
                for (let w1 = 0; w1 < totalWeeks - 1; w1++) {
                    for (let w2 = w1 + 2; w2 < totalWeeks - 1; w2++) {
                        let valid = true;
                        let same = true;
                        for (let k = 0; k < 2; k++) {
                            const c1 = schedule[r.id][w1 + k];
                            const c2 = schedule[r.id][w2 + k];
                            if (!c1 || !c2 || c1.locked || c2.locked ||
                                c1.assignment === AssignmentType.CLINIC || c2.assignment === AssignmentType.CLINIC ||
                                c1.assignment === AssignmentType.NIMA_CLINIC || c2.assignment === AssignmentType.NIMA_CLINIC) {
                                valid = false;
                                break;
                            }
                            if (c1.assignment !== c2.assignment) same = false;
                        }
                        if (!valid || same) continue;

                        const changedWeeks = [w1, w1+1, w2, w2+1];
                        
                        const oldStaffGaps = getStaffingGapsForWeeks(changedWeeks, schedule);
                        const oldReqViolations = getReqViolationsForResidents([r], schedule);

                        for (let k = 0; k < 2; k++) {
                            const temp = schedule[r.id][w1 + k].assignment;
                            schedule[r.id][w1 + k].assignment = schedule[r.id][w2 + k].assignment;
                            schedule[r.id][w2 + k].assignment = temp;
                        }

                        const newStaffGaps = getStaffingGapsForWeeks(changedWeeks, schedule);
                        
                        if (newStaffGaps > oldStaffGaps) {
                            for (let k = 0; k < 2; k++) {
                                const temp = schedule[r.id][w1 + k].assignment;
                                schedule[r.id][w1 + k].assignment = schedule[r.id][w2 + k].assignment;
                                schedule[r.id][w2 + k].assignment = temp;
                            }
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
                            swaps2Block++;
                        } else {
                            for (let k = 0; k < 2; k++) {
                                const temp = schedule[r.id][w1 + k].assignment;
                                schedule[r.id][w1 + k].assignment = schedule[r.id][w2 + k].assignment;
                                schedule[r.id][w2 + k].assignment = temp;
                            }
                        }
                    }
                }
            }

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
            console.log(`[Healer] Iteration ${iter} finished. Beneficial Swaps -> 4-Block: ${swaps4Block}, 2-Block: ${swaps2Block}, 1-Block: ${swaps1Block}. Violations: ${currentTotalViolations} (Req: ${currentReqViolations}, Staff: ${currentStaffingGaps})`);
        }

        console.log(`Final violations: ${currentTotalViolations} (Req: ${currentReqViolations}, Staffing: ${currentStaffingGaps})`);
        return schedule;
    }
};
