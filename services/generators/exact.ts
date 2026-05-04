import { Resident, ScheduleGrid, AssignmentType, ScheduleHistory, ScheduleGenerator } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement, COHORT_COUNT } from '../../constants';
import { WeekByWeekGenerator } from './weekByWeek';

class SeededRNG {
    private seed: number;
    constructor(seed: number) { this.seed = seed; }
    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

export const ExactConstraintGenerator: ScheduleGenerator = {
    name: "Annealed Core Constraint Solver",
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, historicalSchedules?: ScheduleHistory, cohortAssignments?: Record<string, number>): ScheduleGrid => {
        const rng = new SeededRNG(42 + attemptIndex);
        const checkInterrupt = () => (typeof self !== 'undefined' && (self as any).isPromoteTriggered);

        // --- Cohort Setup ---
        let validCohortAssignments = { ...(cohortAssignments || {}) };
        if (Object.keys(validCohortAssignments).length === 0) {
            const sorted = [...residents].sort((a, b) => (a.level !== b.level) ? a.level - b.level : a.name.localeCompare(b.name));
            sorted.forEach((r, idx) => { validCohortAssignments[r.id] = idx % COHORT_COUNT; });
        }

        // --- Precompute Requirement Types & Fulfillment Map ---
        const relevantReqTypesSet = new Set<AssignmentType>();
        [1, 2, 3].forEach(l => (REQUIREMENTS[l as 1|2|3] || []).forEach(r => relevantReqTypesSet.add(r.type)));
        const relevantReqTypes = Array.from(relevantReqTypesSet);
        const typeFulfillment: Record<string, AssignmentType[]> = {};
        Object.values(AssignmentType).forEach(type => { typeFulfillment[type] = relevantReqTypes.filter(req => fulfillsRequirement(type, req)); });

        // Valid assignment types per level — excludes CLINIC, NIMA_CLINIC, and VACATION (engine spec forbids scheduling vacation)
        const assignmentsByLevel: Record<number, AssignmentType[]> = {
            1: Object.values(AssignmentType).filter(t => t !== AssignmentType.CLINIC && t !== AssignmentType.NIMA_CLINIC && t !== AssignmentType.VACATION && (ROTATION_METADATA[t]?.maxInterns || 0) > 0),
            2: Object.values(AssignmentType).filter(t => t !== AssignmentType.CLINIC && t !== AssignmentType.NIMA_CLINIC && t !== AssignmentType.VACATION && (ROTATION_METADATA[t]?.maxSeniors || 0) > 0),
            3: Object.values(AssignmentType).filter(t => t !== AssignmentType.CLINIC && t !== AssignmentType.NIMA_CLINIC && t !== AssignmentType.VACATION && (ROTATION_METADATA[t]?.maxSeniors || 0) > 0),
        };

        const constrainedTypes = Object.values(AssignmentType).filter(type => {
            const m = ROTATION_METADATA[type];
            return m && (m.minInterns > 0 || m.maxInterns < 10 || m.minSeniors > 0 || m.maxSeniors < 10);
        });
        const superCriticalTypes = [
            AssignmentType.MICU, AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE,
            AssignmentType.NIGHT_FLOAT, AssignmentType.EM, AssignmentType.WARDS_METRO
        ];

        // --- Resident Map & Flexibility Tracking ---
        const residentMap = new Map(residents.map(r => [r.id, r]));
        const flexibleWeeks: Record<string, number[]> = {};
        const isFlexible: Record<string, boolean[]> = {};
        residents.forEach(r => {
            const cohort = validCohortAssignments[r.id] ?? 0;
            flexibleWeeks[r.id] = []; isFlexible[r.id] = Array(TOTAL_WEEKS).fill(false);
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (w % COHORT_COUNT !== cohort && !(existingSchedule?.[r.id]?.[w]?.locked)) {
                    flexibleWeeks[r.id].push(w); isFlexible[r.id][w] = true;
                }
            }
        });

        // Group residents by level for cross-resident swaps
        const residentsByLevel: Record<number, Resident[]> = { 1: [], 2: [], 3: [] };
        residents.forEach(r => { if (residentsByLevel[r.level]) residentsByLevel[r.level].push(r); });

        // --- Penalty Weights (spec: generators.md) ---
        const W_STAFFING = 1_000_000_000, W_REQUIREMENT = 1_000_000, W_CONTINUITY = 10_000;

        // Total cycles covering all 52 weeks (last cycle may be partial)
        const TOTAL_CYCLES = Math.floor((TOTAL_WEEKS - 1) / COHORT_COUNT) + 1;

        // --- Penalty Functions ---
        const getTypeStaffingPenalty = (type: AssignmentType, interns: number, seniors: number): number => {
            const m = ROTATION_METADATA[type]!; let c = 0;
            if (interns < m.minInterns) c += (m.minInterns - interns) * W_STAFFING;
            if (interns > m.maxInterns) c += (interns - m.maxInterns) * W_STAFFING;
            if (seniors < m.minSeniors) c += (m.minSeniors - seniors) * W_STAFFING;
            if (seniors > m.maxSeniors) c += (seniors - m.maxSeniors) * W_STAFFING;
            return c;
        };

        const getWeekPenalty = (w: number, wc: any): number => {
            let total = 0; constrainedTypes.forEach(t => total += getTypeStaffingPenalty(t, wc.interns[t] || 0, wc.seniors[t] || 0));
            return total;
        };

        const getResPenalty = (rId: string, rc: Record<string, number>): number => {
            let p = 0; const r = residentMap.get(rId)!;
            (REQUIREMENTS[r.level] || []).forEach(req => { const c = rc[req.type] || 0; if (c < req.target) p += (req.target - c) * W_REQUIREMENT; });
            return p;
        };

        const getCycleCont = (rId: string, sched: ScheduleGrid, cycle: number): number => {
            const cohort = validCohortAssignments[rId] ?? 0, start = cycle * COHORT_COUNT;
            let lastA: string | null = null, changes = 0, coreCount = 0;
            for (let i = 0; i < COHORT_COUNT; i++) {
                const w = start + i;
                if (w >= TOTAL_WEEKS) continue; // bounds check for partial last cycle
                if (w % COHORT_COUNT !== cohort) { const a = sched[rId][w]?.assignment; if (a) { coreCount++; if (lastA && a !== lastA) changes++; lastA = a; } }
            }
            return (coreCount < 2) ? 0 : changes * W_CONTINUITY;
        };

        // --- Base Resident Counts (historical + locked) ---
        const baseResidentCounts: Record<string, Record<string, number>> = {};
        residents.forEach(r => {
            baseResidentCounts[r.id] = {};
            relevantReqTypes.forEach(t => {
                let count = 0;
                if (historicalSchedules) Object.values(historicalSchedules).forEach(grid => grid[r.id]?.forEach(c => { if (c?.assignment && fulfillsRequirement(c.assignment, t)) count++; }));
                if (existingSchedule?.[r.id]) existingSchedule[r.id].forEach(c => { if (c?.locked && c.assignment && fulfillsRequirement(c.assignment, t)) count++; });
                baseResidentCounts[r.id][t] = count;
            });
        });

        // --- Full Recalculation (for seed selection) ---
        const calculateTotal = (sched: ScheduleGrid): number => {
            const tempRC: Record<string, Record<string, number>> = {};
            residents.forEach(r => tempRC[r.id] = { ...baseResidentCounts[r.id] });
            const tempWC: any[] = Array.from({ length: TOTAL_WEEKS }, () => ({ interns: {}, seniors: {} }));
            residents.forEach(r => {
                for (let w = 0; w < TOTAL_WEEKS; w++) {
                    const a = sched[r.id][w]?.assignment;
                    if (a) {
                        if (r.level === 1) tempWC[w].interns[a] = (tempWC[w].interns[a] || 0) + 1; else tempWC[w].seniors[a] = (tempWC[w].seniors[a] || 0) + 1;
                        if (!existingSchedule?.[r.id]?.[w]?.locked) typeFulfillment[a]?.forEach(t => tempRC[r.id][t] = (tempRC[r.id][t] || 0) + 1);
                    }
                }
            });
            let total = 0; for (let w = 0; w < TOTAL_WEEKS; w++) total += getWeekPenalty(w, tempWC[w]);
            residents.forEach(r => { total += getResPenalty(r.id, tempRC[r.id]); for (let c = 0; c < TOTAL_CYCLES; c++) total += getCycleCont(r.id, sched, c); });
            return total;
        };

        // --- Seed Selection (50 attempts) ---
        let currentSchedule: ScheduleGrid = {}, bestP = Infinity;
        for (let s = 0; s < 50; s++) {
            const cand = WeekByWeekGenerator.generate(residents, existingSchedule, attemptIndex + s, historicalSchedules, validCohortAssignments);
            const p = calculateTotal(cand); if (p < bestP) { bestP = p; currentSchedule = cand; }
        }

        // --- Incremental State Tracking ---
        const weekCounts: any[] = Array.from({ length: TOTAL_WEEKS }, () => ({ interns: {}, seniors: {} }));
        const resCounts: Record<string, any> = {};
        const resContCache: Record<string, number[]> = {};

        const syncState = () => {
            for (let w = 0; w < TOTAL_WEEKS; w++) { weekCounts[w].interns = {}; weekCounts[w].seniors = {}; }
            residents.forEach(r => {
                resCounts[r.id] = { ...baseResidentCounts[r.id] }; resContCache[r.id] = [];
                for (let w = 0; w < TOTAL_WEEKS; w++) {
                    const a = currentSchedule[r.id][w]?.assignment;
                    if (a) {
                        if (r.level === 1) weekCounts[w].interns[a] = (weekCounts[w].interns[a] || 0) + 1; else weekCounts[w].seniors[a] = (weekCounts[w].seniors[a] || 0) + 1;
                        if (!existingSchedule?.[r.id]?.[w]?.locked) typeFulfillment[a]?.forEach(t => resCounts[r.id][t] = (resCounts[r.id][t] || 0) + 1);
                    }
                }
                for (let c = 0; c < TOTAL_CYCLES; c++) resContCache[r.id][c] = getCycleCont(r.id, currentSchedule, c);
            });
        };
        syncState();

        // --- Staffing Sweep (Deterministic Fail-Safe) ---
        const staffingSweep = (aggressive: boolean = false) => {
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                constrainedTypes.forEach(t => {
                    const m = ROTATION_METADATA[t]!;
                    while ((weekCounts[w].interns[t] || 0) < m.minInterns) {
                        const pool = residents.filter(res => res.level === 1 && isFlexible[res.id][w] && (aggressive ? !superCriticalTypes.includes(currentSchedule[res.id][w].assignment!) : !constrainedTypes.includes(currentSchedule[res.id][w].assignment!)));
                        if (pool.length === 0) break;
                        const oldA = currentSchedule[pool[0].id][w].assignment!;
                        currentSchedule[pool[0].id][w].assignment = t;
                        weekCounts[w].interns[oldA] = (weekCounts[w].interns[oldA] || 0) - 1;
                        weekCounts[w].interns[t] = (weekCounts[w].interns[t] || 0) + 1;
                    }
                    while ((weekCounts[w].seniors[t] || 0) < m.minSeniors) {
                        const pool = residents.filter(res => res.level >= 2 && isFlexible[res.id][w] && (aggressive ? !superCriticalTypes.includes(currentSchedule[res.id][w].assignment!) : !constrainedTypes.includes(currentSchedule[res.id][w].assignment!)));
                        if (pool.length === 0) break;
                        const oldA = currentSchedule[pool[0].id][w].assignment!;
                        currentSchedule[pool[0].id][w].assignment = t;
                        weekCounts[w].seniors[oldA] = (weekCounts[w].seniors[oldA] || 0) - 1;
                        weekCounts[w].seniors[t] = (weekCounts[w].seniors[t] || 0) + 1;
                    }
                    while ((weekCounts[w].interns[t] || 0) > m.maxInterns) {
                        const pool = residents.filter(res => res.level === 1 && isFlexible[res.id][w] && currentSchedule[res.id][w].assignment === t);
                        if (pool.length === 0) break;
                        currentSchedule[pool[0].id][w].assignment = AssignmentType.ELECTIVE;
                        weekCounts[w].interns[t] = (weekCounts[w].interns[t] || 0) - 1;
                        weekCounts[w].interns[AssignmentType.ELECTIVE] = (weekCounts[w].interns[AssignmentType.ELECTIVE] || 0) + 1;
                    }
                    while ((weekCounts[w].seniors[t] || 0) > m.maxSeniors) {
                        const pool = residents.filter(res => res.level >= 2 && isFlexible[res.id][w] && currentSchedule[res.id][w].assignment === t);
                        if (pool.length === 0) break;
                        currentSchedule[pool[0].id][w].assignment = AssignmentType.ELECTIVE;
                        weekCounts[w].seniors[t] = (weekCounts[w].seniors[t] || 0) - 1;
                        weekCounts[w].seniors[AssignmentType.ELECTIVE] = (weekCounts[w].seniors[AssignmentType.ELECTIVE] || 0) + 1;
                    }
                });
            }
            syncState();
        };

        staffingSweep(true);
        const weekPenaltyCache: number[] = weekCounts.map((wc, w) => getWeekPenalty(w, wc));
        const resReqPenaltyCache: Record<string, number> = {};
        residents.forEach(r => resReqPenaltyCache[r.id] = getResPenalty(r.id, resCounts[r.id]));
        let currentPenalty = 0; weekPenaltyCache.forEach(p => currentPenalty += p);
        residents.forEach(r => { currentPenalty += resReqPenaltyCache[r.id]; resContCache[r.id].forEach(p => currentPenalty += p); });

        if (currentPenalty === 0) return currentSchedule;

        // --- Simulated Annealing Loop ---
        // Temperature schedule: geometric cooling from T0 to Tf over maxSteps
        const maxSteps = 1_000_000;
        const T0 = 5000;   // Initial temperature — allows ~14% acceptance of continuity-level increases
        const Tf = 1;       // Final temperature — effectively greedy at the end
        // Move type probabilities: cross-resident 50%, intra-resident swap 30%, single-cell 20%
        const P_CROSS = 0.50;
        const P_INTRA = 0.80; // cumulative: 0.50-0.80 = intra-resident, 0.80-1.00 = single-cell

        // Helper: safe increment/decrement for weekCounts
        const incWC = (w: number, level: number, type: AssignmentType, delta: number) => {
            const bucket = level === 1 ? weekCounts[w].interns : weekCounts[w].seniors;
            bucket[type] = (bucket[type] || 0) + delta;
        };

        // Helper: safe increment/decrement for resCounts
        const incRC = (rId: string, types: AssignmentType[] | undefined, delta: number) => {
            types?.forEach(t => { resCounts[rId][t] = (resCounts[rId][t] || 0) + delta; });
        };

        for (let step = 0; step < maxSteps; step++) {
            if (step % 10000 === 0 && checkInterrupt()) break;

            const moveRoll = rng.next();
            const temp = T0 * Math.pow(Tf / T0, step / maxSteps);

            if (moveRoll < P_CROSS) {
                // === MOVE TYPE 1: Cross-Resident Swap (50%) ===
                // Swap assignments between two same-level residents for the same week.
                // Staffing-neutral — only affects requirement and continuity penalties.
                const r1 = residents[Math.floor(rng.next() * residents.length)];
                const weeks1 = flexibleWeeks[r1.id];
                if (weeks1.length === 0) continue;
                const w = weeks1[Math.floor(rng.next() * weeks1.length)];

                // Find a partner of the same level who is also flexible this week
                const sameLevel = residentsByLevel[r1.level];
                if (sameLevel.length < 2) continue;
                const r2idx = Math.floor(rng.next() * sameLevel.length);
                const r2 = sameLevel[r2idx];
                if (r2.id === r1.id || !isFlexible[r2.id][w]) continue;

                const a1 = currentSchedule[r1.id][w].assignment!;
                const a2 = currentSchedule[r2.id][w].assignment!;
                if (a1 === a2) continue;

                const cycle = Math.floor(w / COHORT_COUNT);
                const oldRP1 = resReqPenaltyCache[r1.id], oldRP2 = resReqPenaltyCache[r2.id];
                const oldCP1 = resContCache[r1.id][cycle], oldCP2 = resContCache[r2.id][cycle];

                // Apply swap (weekCounts unchanged — staffing-neutral)
                incRC(r1.id, typeFulfillment[a1], -1); incRC(r1.id, typeFulfillment[a2], 1);
                incRC(r2.id, typeFulfillment[a2], -1); incRC(r2.id, typeFulfillment[a1], 1);
                currentSchedule[r1.id][w].assignment = a2;
                currentSchedule[r2.id][w].assignment = a1;

                const newRP1 = getResPenalty(r1.id, resCounts[r1.id]), newRP2 = getResPenalty(r2.id, resCounts[r2.id]);
                const newCP1 = getCycleCont(r1.id, currentSchedule, cycle), newCP2 = getCycleCont(r2.id, currentSchedule, cycle);
                const delta = (newRP1 + newRP2 + newCP1 + newCP2) - (oldRP1 + oldRP2 + oldCP1 + oldCP2);

                if (delta < 0 || rng.next() < Math.exp(-delta / temp)) {
                    // Accept
                    currentPenalty += delta;
                    resReqPenaltyCache[r1.id] = newRP1; resReqPenaltyCache[r2.id] = newRP2;
                    resContCache[r1.id][cycle] = newCP1; resContCache[r2.id][cycle] = newCP2;
                    if (currentPenalty === 0) break;
                } else {
                    // Revert
                    incRC(r1.id, typeFulfillment[a2], -1); incRC(r1.id, typeFulfillment[a1], 1);
                    incRC(r2.id, typeFulfillment[a1], -1); incRC(r2.id, typeFulfillment[a2], 1);
                    currentSchedule[r1.id][w].assignment = a1;
                    currentSchedule[r2.id][w].assignment = a2;
                }

            } else if (moveRoll < P_INTRA) {
                // === MOVE TYPE 2: Intra-Resident Swap (30%) ===
                // Swap assignments between two weeks within the same resident.
                // Requirement-neutral — only affects staffing and continuity penalties.
                const r = residents[Math.floor(rng.next() * residents.length)];
                const weeks = flexibleWeeks[r.id];
                if (weeks.length < 2) continue;
                const wi1 = Math.floor(rng.next() * weeks.length);
                let wi2 = Math.floor(rng.next() * (weeks.length - 1));
                if (wi2 >= wi1) wi2++;
                const w1 = weeks[wi1], w2 = weeks[wi2];

                const a1 = currentSchedule[r.id][w1].assignment!;
                const a2 = currentSchedule[r.id][w2].assignment!;
                if (a1 === a2) continue;

                const cycle1 = Math.floor(w1 / COHORT_COUNT), cycle2 = Math.floor(w2 / COHORT_COUNT);
                const oldWP1 = weekPenaltyCache[w1], oldWP2 = weekPenaltyCache[w2];
                const oldCP1 = resContCache[r.id][cycle1];
                const oldCP2 = cycle1 !== cycle2 ? resContCache[r.id][cycle2] : oldCP1;

                // Apply swap — resCounts unchanged (same resident, same total)
                incWC(w1, r.level, a1, -1); incWC(w1, r.level, a2, 1);
                incWC(w2, r.level, a2, -1); incWC(w2, r.level, a1, 1);
                currentSchedule[r.id][w1].assignment = a2;
                currentSchedule[r.id][w2].assignment = a1;

                const newWP1 = getWeekPenalty(w1, weekCounts[w1]), newWP2 = getWeekPenalty(w2, weekCounts[w2]);
                const newCP1 = getCycleCont(r.id, currentSchedule, cycle1);
                const newCP2 = cycle1 !== cycle2 ? getCycleCont(r.id, currentSchedule, cycle2) : newCP1;
                const delta = (newWP1 + newWP2 + newCP1 + (cycle1 !== cycle2 ? newCP2 : 0))
                            - (oldWP1 + oldWP2 + oldCP1 + (cycle1 !== cycle2 ? oldCP2 : 0));

                if (delta < 0 || rng.next() < Math.exp(-delta / temp)) {
                    // Accept
                    currentPenalty += delta;
                    weekPenaltyCache[w1] = newWP1; weekPenaltyCache[w2] = newWP2;
                    resContCache[r.id][cycle1] = newCP1;
                    if (cycle1 !== cycle2) resContCache[r.id][cycle2] = newCP2;
                    if (currentPenalty === 0) break;
                } else {
                    // Revert
                    incWC(w1, r.level, a2, -1); incWC(w1, r.level, a1, 1);
                    incWC(w2, r.level, a1, -1); incWC(w2, r.level, a2, 1);
                    currentSchedule[r.id][w1].assignment = a1;
                    currentSchedule[r.id][w2].assignment = a2;
                }

            } else {
                // === MOVE TYPE 3: Single-Cell Mutation (20%) ===
                // Randomly reassign one resident-week to a different valid rotation.
                // Affects all penalty components.
                const r = residents[Math.floor(rng.next() * residents.length)], weeks = flexibleWeeks[r.id];
                if (weeks.length === 0) continue;
                const w = weeks[Math.floor(rng.next() * weeks.length)];
                const a1 = currentSchedule[r.id][w].assignment!;
                const a2 = assignmentsByLevel[r.level][Math.floor(rng.next() * assignmentsByLevel[r.level].length)];
                if (a1 === a2) continue;

                const cycle = Math.floor(w / COHORT_COUNT), oldWP = weekPenaltyCache[w], oldRP = resReqPenaltyCache[r.id], oldCP = resContCache[r.id][cycle];
                incWC(w, r.level, a1, -1); incWC(w, r.level, a2, 1);
                incRC(r.id, typeFulfillment[a1], -1); incRC(r.id, typeFulfillment[a2], 1);
                currentSchedule[r.id][w].assignment = a2;
                const newWP = getWeekPenalty(w, weekCounts[w]), newRP = getResPenalty(r.id, resCounts[r.id]), newCP = getCycleCont(r.id, currentSchedule, cycle);
                const delta = (newWP + newRP + newCP) - (oldWP + oldRP + oldCP);

                if (delta < 0 || rng.next() < Math.exp(-delta / temp)) {
                    // Accept
                    currentPenalty += delta; weekPenaltyCache[w] = newWP; resReqPenaltyCache[r.id] = newRP; resContCache[r.id][cycle] = newCP;
                    if (currentPenalty === 0) break;
                } else {
                    // Revert
                    incWC(w, r.level, a2, -1); incWC(w, r.level, a1, 1);
                    incRC(r.id, typeFulfillment[a2], -1); incRC(r.id, typeFulfillment[a1], 1);
                    currentSchedule[r.id][w].assignment = a1;
                }
            }
        }

        staffingSweep(true);
        return currentSchedule;
    }
}
