import { Resident, ScheduleGrid, AssignmentType, ScheduleHistory, ScheduleGenerator } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement, COHORT_COUNT } from '../../constants';
import { StaffingFirstGenerator } from './staffingFirst';

class SeededRNG {
    private seed: number;
    constructor(seed: number) {
        this.seed = seed;
    }
    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

export const ExactConstraintGenerator: ScheduleGenerator = {
    name: "Annealed Core Constraint Solver",
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, historicalSchedules?: ScheduleHistory, cohortAssignments?: Record<string, number>): ScheduleGrid => {
        const rng = new SeededRNG(42 + attemptIndex);
        
        // --- INTERRUPTION SUPPORT ---
        const checkInterrupt = () => {
            if (typeof self !== 'undefined' && (self as any).isPromoteTriggered) return true;
            return false;
        };

        let validCohortAssignments = { ...(cohortAssignments || {}) };
        if (Object.keys(validCohortAssignments).length === 0) {
            const sorted = [...residents].sort((a, b) => {
                if (a.level !== b.level) return a.level - b.level;
                return a.name.localeCompare(b.name);
            });
            sorted.forEach((r, idx) => {
                validCohortAssignments[r.id] = idx % 5;
            });
        }

        const availableWeeks: Record<string, number[]> = {};
        residents.forEach(r => {
            const cohort = validCohortAssignments[r.id] ?? 0;
            availableWeeks[r.id] = [];
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                const isClinic = w % COHORT_COUNT === cohort;
                const isLocked = existingSchedule && existingSchedule[r.id] && existingSchedule[r.id][w]?.locked;
                if (!isClinic && !isLocked) {
                    availableWeeks[r.id].push(w);
                }
            }
        });

        const constrainedTypes = Object.values(AssignmentType).filter(type => {
            const m = ROTATION_METADATA[type];
            return m && (m.minInterns > 0 || m.maxInterns < 10 || m.minSeniors > 0 || m.maxSeniors < 10);
        });

        const weekTypeCounts: { interns: Record<AssignmentType, number>, seniors: Record<AssignmentType, number> }[] = [];
        for (let w = 0; w < TOTAL_WEEKS; w++) {
            weekTypeCounts[w] = { interns: {} as any, seniors: {} as any };
        }

        const getWeekViolationsFromCounts = (w: number): number => {
            let count = 0;
            const interns = weekTypeCounts[w].interns;
            const seniors = weekTypeCounts[w].seniors;

            const clinicCount = (interns[AssignmentType.CLINIC] || 0) + (seniors[AssignmentType.CLINIC] || 0) +
                                (interns[AssignmentType.NIMA_CLINIC] || 0) + (seniors[AssignmentType.NIMA_CLINIC] || 0);
            if (clinicCount === 0) {
                count += 50000; 
            }

            constrainedTypes.forEach(type => {
                const meta = ROTATION_METADATA[type];
                if (!meta) return;

                const cInterns = interns[type] || 0;
                const cSeniors = seniors[type] || 0;

                if (cInterns < meta.minInterns) count += Math.pow(meta.minInterns - cInterns, 2) * 10000;
                if (cInterns > meta.maxInterns) count += Math.pow(cInterns - meta.maxInterns, 2) * 10000;
                if (cSeniors < meta.minSeniors) count += Math.pow(meta.minSeniors - cSeniors, 2) * 10000;
                if (cSeniors > meta.maxSeniors) count += Math.pow(cSeniors - meta.maxSeniors, 2) * 10000;
            });

            return count;
        };

        const residentCounts: Record<string, Record<AssignmentType, number>> = {};
        const relevantReqTypes = new Set<AssignmentType>();
        [1, 2, 3].forEach(l => (REQUIREMENTS[l] || []).forEach(r => relevantReqTypes.add(r.type)));

        const updateResidentCounts = (rId: string, level: number) => {
            residentCounts[rId] = {} as any;
            relevantReqTypes.forEach(t => {
                let count = 0;
                if (historicalSchedules) {
                    Object.values(historicalSchedules).forEach(grid => {
                        grid[rId]?.forEach(cell => { if (cell?.assignment && fulfillsRequirement(cell.assignment, t)) count++; });
                    });
                }
                if (existingSchedule && existingSchedule[rId]) {
                    existingSchedule[rId].forEach(cell => { if (cell?.locked && cell.assignment && fulfillsRequirement(cell.assignment, t)) count++; });
                }
                residentCounts[rId][t] = count;
            });
        };

        const getResidentViolationPenalty = (rId: string): number => {
            let p = 0;
            const r = residents.find(res => res.id === rId);
            if (!r) return 0;
            const reqs = REQUIREMENTS[r.level] || [];
            reqs.forEach(req => {
                const current = residentCounts[rId][req.type] || 0;
                if (current < req.target) {
                    p += Math.pow(req.target - current, 2) * 50000; 
                }
            });
            return p;
        };

        const currentSchedule = StaffingFirstGenerator.generate(residents, existingSchedule, attemptIndex, historicalSchedules, validCohortAssignments);
        
        for (let w = 0; w < TOTAL_WEEKS; w++) {
            Object.values(AssignmentType).forEach(t => {
                weekTypeCounts[w].interns[t] = 0;
                weekTypeCounts[w].seniors[t] = 0;
            });
        }

        residents.forEach(r => {
            updateResidentCounts(r.id, r.level);
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                const a = currentSchedule[r.id]?.[w]?.assignment;
                if (a) {
                    if (r.level === 1) weekTypeCounts[w].interns[a]++;
                    else weekTypeCounts[w].seniors[a]++;

                    if (!(existingSchedule?.[r.id]?.[w]?.locked)) {
                        relevantReqTypes.forEach(t => {
                            if (fulfillsRequirement(a, t)) residentCounts[r.id][t]++;
                        });
                    }
                }
            }
        });

        let totalPenalty = 0;
        for (let w = 0; w < TOTAL_WEEKS; w++) totalPenalty += getWeekViolationsFromCounts(w);
        residents.forEach(r => totalPenalty += getResidentViolationPenalty(r.id));

        if (totalPenalty === 0) return currentSchedule;

        const maxSteps = 100000; 
        let T = 1.0;

        for (let step = 0; step < maxSteps; step++) {
            if (step % 1000 === 0 && checkInterrupt()) break;

            T *= 0.99995;
            const r = residents[Math.floor(rng.next() * residents.length)];
            const weeks = availableWeeks[r.id];
            if (weeks.length < 2) continue;

            const idxA = Math.floor(rng.next() * weeks.length);
            const w1 = weeks[idxA];

            if (rng.next() < 0.3) {
                const a1 = currentSchedule[r.id][w1].assignment;
                if (!a1) continue;

                const possibleMutations = Object.values(AssignmentType).filter(t => {
                    if (t === a1) return false;
                    const m = ROTATION_METADATA[t];
                    return m && (r.level === 1 ? m.maxInterns > 0 : m.maxSeniors > 0);
                });

                const a2 = possibleMutations[Math.floor(rng.next() * possibleMutations.length)];
                
                const oldP = getWeekViolationsFromCounts(w1) + getResidentViolationPenalty(r.id);

                if (r.level === 1) { weekTypeCounts[w1].interns[a1]--; weekTypeCounts[w1].interns[a2]++; }
                else { weekTypeCounts[w1].seniors[a1]--; weekTypeCounts[w1].seniors[a2]++; }
                
                relevantReqTypes.forEach(t => {
                    if (fulfillsRequirement(a1, t)) residentCounts[r.id][t]--;
                    if (fulfillsRequirement(a2, t)) residentCounts[r.id][t]++;
                });

                const newP = getWeekViolationsFromCounts(w1) + getResidentViolationPenalty(r.id);
                const delta = newP - oldP;

                if (delta <= 0 || rng.next() < Math.exp(-delta / T)) {
                    totalPenalty += delta;
                    currentSchedule[r.id][w1].assignment = a2;
                    if (totalPenalty === 0) return currentSchedule;
                } else {
                    if (r.level === 1) { weekTypeCounts[w1].interns[a1]++; weekTypeCounts[w1].interns[a2]--; }
                    else { weekTypeCounts[w1].seniors[a1]++; weekTypeCounts[w1].seniors[a2]--; }
                    relevantReqTypes.forEach(t => {
                        if (fulfillsRequirement(a1, t)) residentCounts[r.id][t]++;
                        if (fulfillsRequirement(a2, t)) residentCounts[r.id][t]--;
                    });
                }
            } else {
                let idxB = Math.floor(rng.next() * weeks.length);
                while (idxB === idxA) { idxB = Math.floor(rng.next() * weeks.length); }
                const w2 = weeks[idxB];
                const a1 = currentSchedule[r.id][w1].assignment;
                const a2 = currentSchedule[r.id][w2].assignment;
                if (a1 === a2) continue;

                const oldP = getWeekViolationsFromCounts(w1) + getWeekViolationsFromCounts(w2);
                if (r.level === 1) {
                    weekTypeCounts[w1].interns[a1]--; weekTypeCounts[w1].interns[a2]++;
                    weekTypeCounts[w2].interns[a2]--; weekTypeCounts[w2].interns[a1]++;
                } else {
                    weekTypeCounts[w1].seniors[a1]--; weekTypeCounts[w1].seniors[a2]++;
                    weekTypeCounts[w2].seniors[a2]--; weekTypeCounts[w2].seniors[a1]++;
                }

                const newP = getWeekViolationsFromCounts(w1) + getWeekViolationsFromCounts(w2);
                const delta = newP - oldP;

                if (delta <= 0 || rng.next() < Math.exp(-delta / T)) {
                    totalPenalty += delta;
                    currentSchedule[r.id][w1].assignment = a2;
                    currentSchedule[r.id][w2].assignment = a1;
                    if (totalPenalty === 0) return currentSchedule;
                } else {
                    if (r.level === 1) {
                        weekTypeCounts[w1].interns[a1]++; weekTypeCounts[w1].interns[a2]--;
                        weekTypeCounts[w2].interns[a2]++; weekTypeCounts[w2].interns[a1]--;
                    } else {
                        weekTypeCounts[w1].seniors[a1]++; weekTypeCounts[w1].seniors[a2]--;
                        weekTypeCounts[w2].seniors[a2]++; weekTypeCounts[w2].seniors[a1]--;
                    }
                }
            }
        }

        return currentSchedule;
    }
}
