import { Resident, ScheduleGrid, AssignmentType, ScheduleHistory, ScheduleGenerator } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement, COHORT_COUNT } from '../../constants';
import { WeekByWeekGenerator } from './weekByWeek';

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

        // --- 1. DEFINE 2-WEEK ALIGNED BLOCKS ---
        const coreBlocks: Record<string, [number, number][]> = {};
        residents.forEach(r => {
            const cohort = validCohortAssignments[r.id] ?? 0;
            coreBlocks[r.id] = [];
            for (let cycle = 0; cycle < 10; cycle++) {
                const cycleStart = cycle * 5;
                const coreWeeks: number[] = [];
                for (let i = 0; i < 5; i++) {
                    const w = cycleStart + i;
                    const isClinic = w % 5 === cohort;
                    const isLocked = existingSchedule && existingSchedule[r.id] && existingSchedule[r.id][w]?.locked;
                    if (!isClinic && !isLocked) coreWeeks.push(w);
                }
                if (coreWeeks.length === 4) {
                    coreBlocks[r.id].push([coreWeeks[0], coreWeeks[1]]);
                    coreBlocks[r.id].push([coreWeeks[2], coreWeeks[3]]);
                } else if (coreWeeks.length > 1) {
                    for (let i = 0; i < coreWeeks.length - 1; i += 2) {
                        coreBlocks[r.id].push([coreWeeks[i], coreWeeks[i+1]]);
                    }
                }
            }
        });

        const constrainedTypes = Object.values(AssignmentType).filter(type => {
            const m = ROTATION_METADATA[type];
            return m && (m.minInterns > 0 || m.maxInterns < 10 || m.minSeniors > 0 || m.maxSeniors < 10);
        });

        const weekTypeCounts: { interns: Record<AssignmentType, number>, seniors: Record<AssignmentType, number> }[] = [];
        const residentCounts: Record<string, Record<AssignmentType, number>> = {};
        const relevantReqTypes = new Set<AssignmentType>();
        [1, 2, 3].forEach(l => (REQUIREMENTS[l] || []).forEach(r => relevantReqTypes.add(r.type)));

        const getWeekViolationsFromCounts = (w: number): number => {
            let count = 0;
            const interns = weekTypeCounts[w].interns;
            const seniors = weekTypeCounts[w].seniors;

            const clinicCount = (interns[AssignmentType.CLINIC] || 0) + (seniors[AssignmentType.CLINIC] || 0) +
                                (interns[AssignmentType.NIMA_CLINIC] || 0) + (seniors[AssignmentType.NIMA_CLINIC] || 0);
            if (clinicCount === 0) count += 50000; 

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

        const getResidentViolationPenalty = (rId: string): number => {
            let p = 0;
            const r = residents.find(res => res.id === rId);
            if (!r) return 0;
            (REQUIREMENTS[r.level] || []).forEach(req => {
                const current = residentCounts[rId][req.type] || 0;
                if (current < req.target) p += Math.pow(req.target - current, 2) * 50000; 
            });
            return p;
        };

        const getResidentContinuityPenalty = (rId: string, schedule: ScheduleGrid): number => {
            let p = 0;
            const cohort = validCohortAssignments[rId] ?? 0;
            for (let cycle = 0; cycle < 10; cycle++) {
                const start = cycle * 5;
                const core = [];
                for (let i = 0; i < 5; i++) {
                    const w = start + i;
                    if (w % 5 !== cohort) core.push(schedule[rId][w]?.assignment);
                }
                if (core.length < 2) continue;
                let changes = 0;
                for (let i = 1; i < core.length; i++) if (core[i] !== core[i-1]) changes++;
                if (changes === 1) p += 10000; 
                else if (changes > 1) p += changes * 50000;
            }
            return p;
        };

        const calculateTotalPenalty = (schedule: ScheduleGrid): number => {
            // Setup temporary structures for evaluation
            const tempWeekCounts: { interns: Record<AssignmentType, number>, seniors: Record<AssignmentType, number> }[] = [];
            const tempResCounts: Record<string, Record<AssignmentType, number>> = {};
            
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                tempWeekCounts[w] = { interns: {} as any, seniors: {} as any };
                Object.values(AssignmentType).forEach(t => { tempWeekCounts[w].interns[t] = 0; tempWeekCounts[w].seniors[t] = 0; });
            }
            
            residents.forEach(r => {
                tempResCounts[r.id] = {} as any;
                relevantReqTypes.forEach(t => {
                    let count = 0;
                    if (historicalSchedules) Object.values(historicalSchedules).forEach(grid => grid[r.id]?.forEach(c => { if (c?.assignment && fulfillsRequirement(c.assignment, t)) count++; }));
                    if (existingSchedule && existingSchedule[r.id]) existingSchedule[r.id].forEach(c => { if (c?.locked && c.assignment && fulfillsRequirement(c.assignment, t)) count++; });
                    tempResCounts[r.id][t] = count;
                });
                for (let w = 0; w < TOTAL_WEEKS; w++) {
                    const a = schedule[r.id][w]?.assignment;
                    if (a) {
                        if (r.level === 1) tempWeekCounts[w].interns[a]++;
                        else tempWeekCounts[w].seniors[a]++;
                        if (!(existingSchedule?.[r.id]?.[w]?.locked)) relevantReqTypes.forEach(t => { if (fulfillsRequirement(a, t)) tempResCounts[r.id][t]++; });
                    }
                }
            });

            const getWeekP = (w: number): number => {
                let c = 0;
                const interns = tempWeekCounts[w].interns;
                const seniors = tempWeekCounts[w].seniors;
                const clinicCount = (interns[AssignmentType.CLINIC] || 0) + (seniors[AssignmentType.CLINIC] || 0) +
                                    (interns[AssignmentType.NIMA_CLINIC] || 0) + (seniors[AssignmentType.NIMA_CLINIC] || 0);
                if (clinicCount === 0) c += 50000;
                constrainedTypes.forEach(type => {
                    const m = ROTATION_METADATA[type];
                    if (!m) return;
                    const cI = interns[type] || 0;
                    const cS = seniors[type] || 0;
                    if (cI < m.minInterns) c += Math.pow(m.minInterns - cI, 2) * 10000;
                    if (cI > m.maxInterns) c += Math.pow(cI - m.maxInterns, 2) * 10000;
                    if (cS < m.minSeniors) c += Math.pow(m.minSeniors - cS, 2) * 10000;
                    if (cS > m.maxSeniors) c += Math.pow(cS - m.maxSeniors, 2) * 10000;
                });
                return c;
            };

            const getResP = (rId: string): number => {
                let p = 0;
                const r = residents.find(res => res.id === rId);
                if (!r) return 0;
                (REQUIREMENTS[r.level] || []).forEach(req => {
                    const cur = tempResCounts[rId][req.type] || 0;
                    if (cur < req.target) p += Math.pow(req.target - cur, 2) * 50000;
                });
                return p;
            };

            let total = 0;
            for (let w = 0; w < TOTAL_WEEKS; w++) total += getWeekP(w);
            residents.forEach(r => { total += getResP(r.id); total += getResidentContinuityPenalty(r.id, schedule); });
            return total;
        };

        // --- 2. MULTI-SEED INITIALIZATION (Best of 20) ---
        let currentSchedule: ScheduleGrid = {};
        let bestPenalty = Infinity;

        for (let seedOff = 0; seedOff < 20; seedOff++) {
            const cand = WeekByWeekGenerator.generate(residents, existingSchedule, attemptIndex + seedOff, historicalSchedules, validCohortAssignments);
            const p = calculateTotalPenalty(cand);
            if (p < bestPenalty) {
                bestPenalty = p;
                currentSchedule = cand;
            }
        }

        // Final sync of global structures for the winner
        // Reset weekTypeCounts and residentCounts to match currentSchedule
        for (let w = 0; w < TOTAL_WEEKS; w++) {
            weekTypeCounts[w] = { interns: {} as any, seniors: {} as any };
            Object.values(AssignmentType).forEach(t => { weekTypeCounts[w].interns[t] = 0; weekTypeCounts[w].seniors[t] = 0; });
        }
        residents.forEach(r => {
            residentCounts[r.id] = {} as any;
            relevantReqTypes.forEach(t => {
                let count = 0;
                if (historicalSchedules) Object.values(historicalSchedules).forEach(grid => grid[r.id]?.forEach(c => { if (c?.assignment && fulfillsRequirement(c.assignment, t)) count++; }));
                if (existingSchedule && existingSchedule[r.id]) existingSchedule[r.id].forEach(c => { if (c?.locked && c.assignment && fulfillsRequirement(c.assignment, t)) count++; });
                residentCounts[r.id][t] = count;
            });
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                const a = currentSchedule[r.id][w]?.assignment;
                if (a) {
                    if (r.level === 1) weekTypeCounts[w].interns[a]++;
                    else weekTypeCounts[w].seniors[a]++;
                    if (!(existingSchedule?.[r.id]?.[w]?.locked)) relevantReqTypes.forEach(t => { if (fulfillsRequirement(a, t)) residentCounts[r.id][t]++; });
                }
            }
        });

        let totalPenalty = calculateTotalPenalty(currentSchedule);
        if (totalPenalty === 0) return currentSchedule;

        // --- 3. ANNEALING LOOP (Operates on 2-week blocks) ---
        const maxSteps = 100000; 
        let T = 1.0;

        for (let step = 0; step < maxSteps; step++) {
            if (step % 1000 === 0 && checkInterrupt()) break;

            T *= 0.99995;
            const r = residents[Math.floor(rng.next() * residents.length)];
            const blocks = coreBlocks[r.id];
            if (blocks.length < 2) continue;

            const idxA = Math.floor(rng.next() * blocks.length);
            const b1 = blocks[idxA];

            if (rng.next() < 0.3) {
                const a1 = currentSchedule[r.id][b1[0]].assignment;
                if (!a1) continue;
                const possible = Object.values(AssignmentType).filter(t => {
                    if (t === a1) return false;
                    const m = ROTATION_METADATA[t];
                    return m && (r.level === 1 ? m.maxInterns > 0 : m.maxSeniors > 0);
                });
                const a2 = possible[Math.floor(rng.next() * possible.length)];
                const oldP = getWeekViolationsFromCounts(b1[0]) + getWeekViolationsFromCounts(b1[1]) + getResidentViolationPenalty(r.id) + getResidentContinuityPenalty(r.id, currentSchedule);
                b1.forEach(w => {
                    if (r.level === 1) { weekTypeCounts[w].interns[a1]--; weekTypeCounts[w].interns[a2]++; }
                    else { weekTypeCounts[w].seniors[a1]--; weekTypeCounts[w].seniors[a2]++; }
                    currentSchedule[r.id][w].assignment = a2;
                });
                relevantReqTypes.forEach(t => {
                    const f1 = fulfillsRequirement(a1, t);
                    const f2 = fulfillsRequirement(a2, t);
                    if (f1 && !f2) residentCounts[r.id][t] -= 2;
                    else if (!f1 && f2) residentCounts[r.id][t] += 2;
                });
                const newP = getWeekViolationsFromCounts(b1[0]) + getWeekViolationsFromCounts(b1[1]) + getResidentViolationPenalty(r.id) + getResidentContinuityPenalty(r.id, currentSchedule);
                const delta = newP - oldP;
                if (delta <= 0 || rng.next() < Math.exp(-delta / T)) {
                    totalPenalty += delta;
                    if (totalPenalty === 0) return currentSchedule;
                } else {
                    b1.forEach(w => {
                        if (r.level === 1) { weekTypeCounts[w].interns[a2]--; weekTypeCounts[w].interns[a1]++; }
                        else { weekTypeCounts[w].seniors[a2]--; weekTypeCounts[w].seniors[a1]++; }
                        currentSchedule[r.id][w].assignment = a1;
                    });
                    relevantReqTypes.forEach(t => {
                        const f1 = fulfillsRequirement(a1, t);
                        const f2 = fulfillsRequirement(a2, t);
                        if (f1 && !f2) residentCounts[r.id][t] += 2;
                        else if (!f1 && f2) residentCounts[r.id][t] -= 2;
                    });
                }
            } else {
                let idxB = Math.floor(rng.next() * blocks.length);
                while (idxB === idxA) idxB = Math.floor(rng.next() * blocks.length);
                const b2 = blocks[idxB];
                const a1 = currentSchedule[r.id][b1[0]].assignment;
                const a2 = currentSchedule[r.id][b2[0]].assignment;
                if (a1 === a2) continue;
                const oldP = getWeekViolationsFromCounts(b1[0]) + getWeekViolationsFromCounts(b1[1]) + getWeekViolationsFromCounts(b2[0]) + getWeekViolationsFromCounts(b2[1]) + getResidentContinuityPenalty(r.id, currentSchedule);
                [...b1, ...b2].forEach(w => {
                    const oldA = currentSchedule[r.id][w].assignment;
                    const newA = (w === b1[0] || w === b1[1]) ? a2 : a1;
                    if (r.level === 1) { weekTypeCounts[w].interns[oldA]--; weekTypeCounts[w].interns[newA]++; }
                    else { weekTypeCounts[w].seniors[oldA]--; weekTypeCounts[w].seniors[newA]++; }
                    currentSchedule[r.id][w].assignment = newA;
                });
                const newP = getWeekViolationsFromCounts(b1[0]) + getWeekViolationsFromCounts(b1[1]) + getWeekViolationsFromCounts(b2[0]) + getWeekViolationsFromCounts(b2[1]) + getResidentContinuityPenalty(r.id, currentSchedule);
                const delta = newP - oldP;
                if (delta <= 0 || rng.next() < Math.exp(-delta / T)) {
                    totalPenalty += delta;
                    if (totalPenalty === 0) return currentSchedule;
                } else {
                    [...b1, ...b2].forEach(w => {
                        const oldA = currentSchedule[r.id][w].assignment;
                        const newA = (w === b1[0] || w === b1[1]) ? a1 : a2;
                        if (r.level === 1) { weekTypeCounts[w].interns[oldA]--; weekTypeCounts[w].interns[newA]++; }
                        else { weekTypeCounts[w].seniors[oldA]--; weekTypeCounts[w].seniors[newA]++; }
                        currentSchedule[r.id][w].assignment = newA;
                    });
                }
            }
        }
        return currentSchedule;
    }
}
