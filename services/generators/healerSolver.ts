import { Resident, ScheduleGrid, AssignmentType, ScheduleGenerator } from '../../types';
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

export const HealerConstraintGenerator: ScheduleGenerator = {
    name: "Annealing Healer Solver",
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number>, onProgress?: (step: number, maxSteps: number) => void): ScheduleGrid => {
        const rng = new SeededRNG(42 + attemptIndex);

        const totalWeeks = Object.values(existingSchedule)[0]?.length || TOTAL_WEEKS;
        const checkInterrupt = () => (typeof self !== 'undefined' && (self as any).isPromoteTriggered);

        let validCohortAssignments = { ...(cohortAssignments || {}) };
        if (Object.keys(validCohortAssignments).length === 0) {
            const sorted = [...residents].sort((a, b) => (a.level !== b.level) ? a.level - b.level : a.name.localeCompare(b.name));
            sorted.forEach((r, idx) => { validCohortAssignments[r.id] = idx % COHORT_COUNT; }); // BUG FIX: use COHORT_COUNT instead of hardcoded 5
        }

        const relevantReqTypesSet = new Set<AssignmentType>();
        [1, 2, 3].forEach(l => (REQUIREMENTS[l as 1|2|3] || []).forEach(r => relevantReqTypesSet.add(r.type)));
        const relevantReqTypes = Array.from(relevantReqTypesSet);
        const typeFulfillment: Record<string, AssignmentType[]> = {};
        Object.values(AssignmentType).forEach(type => { typeFulfillment[type] = relevantReqTypes.filter(req => fulfillsRequirement(type, req)); });
        const assignmentsByLevel: Record<number, AssignmentType[]> = {
            // BUG FIX: exclude VACATION — engine spec forbids algorithms from scheduling vacation
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

        const residentMap = new Map(residents.map(r => [r.id, r]));
        const flexibleWeeks: Record<string, number[]> = {};
        const isFlexible: Record<string, boolean[]> = {};
        residents.forEach(r => {
            const cohort = validCohortAssignments[r.id] ?? 0;
            const start = r.activeWeekStart ?? 0;
            const end = r.activeWeekEnd ?? totalWeeks;
            flexibleWeeks[r.id] = []; isFlexible[r.id] = Array(totalWeeks).fill(false);
            for (let w = 0; w < totalWeeks; w++) {
                if (w >= start && w < end && w % COHORT_COUNT !== cohort && !(existingSchedule?.[r.id]?.[w]?.locked)) {
                    flexibleWeeks[r.id].push(w);
                    isFlexible[r.id][w] = true;
                }
            }
        });

        const W_STAFFING = 10000000, W_REQUIREMENT = 10000, W_CONTINUITY = 1000;

        // BUG FIX: TOTAL_CYCLES covers all 52 weeks including partial last cycle
        const TOTAL_CYCLES = Math.floor((totalWeeks - 1) / COHORT_COUNT) + 1;

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

        const getResPenalty = (rId: string, rcByLvl: Record<number, Record<string, number>>): number => {
            let p = 0;
            [1, 2, 3].forEach(lvl => {
                (REQUIREMENTS[lvl as 1|2|3] || []).forEach(req => {
                    const c = rcByLvl[lvl][req.type] || 0;
                    if (c < req.minWeeks) p += (req.minWeeks - c) * W_REQUIREMENT;
                });
            });
            return p;
        };

        const getCycleCont = (rId: string, sched: ScheduleGrid, cycle: number): number => {
            const cohort = validCohortAssignments[rId] ?? 0, start = cycle * COHORT_COUNT; // BUG FIX: COHORT_COUNT
            let lastA: string | null = null, changes = 0, coreCount = 0;
            for (let i = 0; i < COHORT_COUNT; i++) { // BUG FIX: COHORT_COUNT
                const w = start + i;
                if (w >= totalWeeks) continue; // BUG FIX: bounds check for partial last cycle
                if (w % COHORT_COUNT !== cohort) { const a = sched[rId][w]?.assignment; if (a) { coreCount++; if (lastA && a !== lastA) changes++; lastA = a; } } // BUG FIX: COHORT_COUNT
            }
            return (coreCount < 2) ? 0 : changes * W_CONTINUITY;
        };

        const getLevel = (startLvl: number, w: number) => Math.max(1, Math.min(3, (startLvl || 1) + Math.floor(w / 52))) || 1;

        const baseResidentCounts: Record<string, Record<number, Record<string, number>>> = {};
        residents.forEach(r => {
            const startLvl = Math.max(1, Math.min(3, Number(r.level) || 1));
            baseResidentCounts[r.id] = {1: {}, 2: {}, 3: {}};
            relevantReqTypes.forEach(t => {
                if (priorRequirementCounts?.[r.id]?.[t]) {
                    baseResidentCounts[r.id][startLvl][t] = priorRequirementCounts[r.id][t];
                } else {
                    baseResidentCounts[r.id][startLvl][t] = 0;
                }
                baseResidentCounts[r.id][1][t] = baseResidentCounts[r.id][1][t] || 0;
                baseResidentCounts[r.id][2][t] = baseResidentCounts[r.id][2][t] || 0;
                baseResidentCounts[r.id][3][t] = baseResidentCounts[r.id][3][t] || 0;
            });
            if (existingSchedule?.[r.id]) {
                existingSchedule[r.id].forEach((c, w) => {
                    if (c?.locked && c.assignment) {
                        const lvl = getLevel(startLvl, w);
                        relevantReqTypes.forEach(t => {
                            if (fulfillsRequirement(c.assignment!, t)) {
                                baseResidentCounts[r.id][lvl][t] = (baseResidentCounts[r.id][lvl][t] || 0) + 1;
                            }
                        });
                    }
                });
            }
        });

        const calculateTotal = (sched: ScheduleGrid): number => {
            const tempRC: Record<string, Record<number, Record<string, number>>> = {};
            residents.forEach(r => {
                tempRC[r.id] = {1: {...baseResidentCounts[r.id][1]}, 2: {...baseResidentCounts[r.id][2]}, 3: {...baseResidentCounts[r.id][3]}};
            });
            const tempWC: any[] = Array.from({ length: totalWeeks }, () => ({ interns: {}, seniors: {} }));
            residents.forEach(r => {
                const startLvl = Math.max(1, Math.min(3, Number(r.level) || 1));
                for (let w = 0; w < totalWeeks; w++) {
                    const a = sched[r.id][w]?.assignment;
                    if (a) {
                        const level = getLevel(startLvl, w);
                        if (!tempWC[w]) tempWC[w] = { interns: {}, seniors: {} };
                        if (level === 1) {
                            if (!tempWC[w].interns) tempWC[w].interns = {};
                            tempWC[w].interns[a] = (tempWC[w].interns[a] || 0) + 1;
                        } else {
                            if (!tempWC[w].seniors) tempWC[w].seniors = {};
                            tempWC[w].seniors[a] = (tempWC[w].seniors[a] || 0) + 1;
                        }
                        if (!tempRC[r.id]) tempRC[r.id] = { 1: {}, 2: {}, 3: {} };
                        if (!tempRC[r.id][level]) tempRC[r.id][level] = {};
                        if (!existingSchedule?.[r.id]?.[w]?.locked) {
                            typeFulfillment[a]?.forEach(t => {
                                tempRC[r.id][level][t] = (tempRC[r.id][level][t] || 0) + 1;
                            });
                        }
                    }
                }
            });
            let total = 0; for (let w = 0; w < totalWeeks; w++) total += getWeekPenalty(w, tempWC[w]);
            residents.forEach(r => { total += getResPenalty(r.id, tempRC[r.id]); for (let c = 0; c < TOTAL_CYCLES; c++) total += getCycleCont(r.id, sched, c); }); // BUG FIX: TOTAL_CYCLES instead of hardcoded 10
            return total;
        };

        let currentSchedule: ScheduleGrid = {}, bestP = Infinity;
        for (let s = 0; s < 50; s++) {
            const cand = WeekByWeekGenerator.generate(residents, existingSchedule, attemptIndex + s, priorRequirementCounts, validCohortAssignments);
            const p = calculateTotal(cand); if (p < bestP) { bestP = p; currentSchedule = cand; }
        }

        const weekCounts: any[] = Array.from({ length: totalWeeks }, () => ({ interns: {}, seniors: {} }));
        const resCounts: Record<string, Record<number, Record<string, number>>> = {};
        const resContCache: Record<string, number[]> = {};

        const syncState = () => {
            for (let w = 0; w < totalWeeks; w++) {
                if (!weekCounts[w]) weekCounts[w] = { interns: {}, seniors: {} };
                weekCounts[w].interns = {};
                weekCounts[w].seniors = {};
            }
            residents.forEach(r => {
                const startLvl = Math.max(1, Math.min(3, Number(r.level) || 1));
                resCounts[r.id] = {
                    1: baseResidentCounts[r.id]?.[1] ? { ...baseResidentCounts[r.id][1] } : {},
                    2: baseResidentCounts[r.id]?.[2] ? { ...baseResidentCounts[r.id][2] } : {},
                    3: baseResidentCounts[r.id]?.[3] ? { ...baseResidentCounts[r.id][3] } : {}
                };
                resContCache[r.id] = [];
                for (let w = 0; w < totalWeeks; w++) {
                    const a = currentSchedule[r.id][w]?.assignment;
                    if (a) {
                        const level = getLevel(startLvl, w);
                        if (!weekCounts[w]) weekCounts[w] = { interns: {}, seniors: {} };
                        if (level === 1) {
                            if (!weekCounts[w].interns) weekCounts[w].interns = {};
                            weekCounts[w].interns[a] = (weekCounts[w].interns[a] || 0) + 1;
                        } else {
                            if (!weekCounts[w].seniors) weekCounts[w].seniors = {};
                            weekCounts[w].seniors[a] = (weekCounts[w].seniors[a] || 0) + 1;
                        }
                        if (!resCounts[r.id]) {
                            resCounts[r.id] = { 1: {}, 2: {}, 3: {} };
                        }
                        if (!resCounts[r.id][level]) {
                            resCounts[r.id][level] = {};
                        }
                        if (!existingSchedule?.[r.id]?.[w]?.locked) {
                            typeFulfillment[a]?.forEach(t => {
                                resCounts[r.id][level][t] = (resCounts[r.id][level][t] || 0) + 1;
                            });
                        }
                    }
                }
                for (let c = 0; c < TOTAL_CYCLES; c++) {
                    resContCache[r.id][c] = getCycleCont(r.id, currentSchedule, c);
                }
            });
        };
        syncState();

        const staffingSweep = (aggressive: boolean = false) => {
            for (let w = 0; w < totalWeeks; w++) {
                constrainedTypes.forEach(t => {
                    const m = ROTATION_METADATA[t]!;
                    while ((weekCounts[w].interns[t] || 0) < m.minInterns) {
                        const pool = residents.filter(res => getLevel(Number(res.level) || 1, w) === 1 && isFlexible[res.id][w] && (aggressive ? !superCriticalTypes.includes(currentSchedule[res.id][w].assignment!) : !constrainedTypes.includes(currentSchedule[res.id][w].assignment!)));
                        if (pool.length === 0) break;
                        const oldA = currentSchedule[pool[0].id][w].assignment!;
                        currentSchedule[pool[0].id][w].assignment = t;
                        weekCounts[w].interns[oldA] = (weekCounts[w].interns[oldA] || 0) - 1; // BUG FIX: NaN guard
                        weekCounts[w].interns[t] = (weekCounts[w].interns[t] || 0) + 1; // BUG FIX: NaN guard
                    }
                    while ((weekCounts[w].seniors[t] || 0) < m.minSeniors) {
                        const pool = residents.filter(res => getLevel(Number(res.level) || 1, w) >= 2 && isFlexible[res.id][w] && (aggressive ? !superCriticalTypes.includes(currentSchedule[res.id][w].assignment!) : !constrainedTypes.includes(currentSchedule[res.id][w].assignment!)));
                        if (pool.length === 0) break;
                        const oldA = currentSchedule[pool[0].id][w].assignment!;
                        currentSchedule[pool[0].id][w].assignment = t;
                        weekCounts[w].seniors[oldA] = (weekCounts[w].seniors[oldA] || 0) - 1; // BUG FIX: NaN guard
                        weekCounts[w].seniors[t] = (weekCounts[w].seniors[t] || 0) + 1; // BUG FIX: NaN guard
                    }
                    while ((weekCounts[w].interns[t] || 0) > m.maxInterns) {
                        const pool = residents.filter(res => getLevel(Number(res.level) || 1, w) === 1 && isFlexible[res.id][w] && currentSchedule[res.id][w].assignment === t);
                        if (pool.length === 0) break;
                        currentSchedule[pool[0].id][w].assignment = AssignmentType.ELECTIVE;
                        weekCounts[w].interns[t] = (weekCounts[w].interns[t] || 0) - 1; // BUG FIX: NaN guard
                        weekCounts[w].interns[AssignmentType.ELECTIVE] = (weekCounts[w].interns[AssignmentType.ELECTIVE] || 0) + 1; // BUG FIX: track elective increment
                    }
                    while ((weekCounts[w].seniors[t] || 0) > m.maxSeniors) {
                        const pool = residents.filter(res => getLevel(Number(res.level) || 1, w) >= 2 && isFlexible[res.id][w] && currentSchedule[res.id][w].assignment === t);
                        if (pool.length === 0) break;
                        currentSchedule[pool[0].id][w].assignment = AssignmentType.ELECTIVE;
                        weekCounts[w].seniors[t] = (weekCounts[w].seniors[t] || 0) - 1; // BUG FIX: NaN guard
                        weekCounts[w].seniors[AssignmentType.ELECTIVE] = (weekCounts[w].seniors[AssignmentType.ELECTIVE] || 0) + 1; // BUG FIX: track elective increment
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

        if (currentPenalty === 0) {
            if (onProgress) onProgress(200000, 200000);
            return currentSchedule;
        }

        const maxSteps = 200000;
        for (let step = 0; step < maxSteps; step++) {
            if (step % 10000 === 0 && checkInterrupt()) break;
            if (step % 2000 === 0 && onProgress) onProgress(step, maxSteps);
            const r = residents[Math.floor(rng.next() * residents.length)], weeks = flexibleWeeks[r.id];
            if (weeks.length === 0) continue;
            const w = weeks[Math.floor(rng.next() * weeks.length)];
            const startLvl = Math.max(1, Math.min(3, Number(r.level) || 1));
            const level = getLevel(startLvl, w);
            const a1 = currentSchedule[r.id][w].assignment!;
            const a2 = assignmentsByLevel[level][Math.floor(rng.next() * assignmentsByLevel[level].length)];
            if (a1 === a2) continue;

            const cycle = Math.floor(w / COHORT_COUNT), oldWP = weekPenaltyCache[w], oldRP = resReqPenaltyCache[r.id], oldCP = resContCache[r.id][cycle]; // BUG FIX: COHORT_COUNT
            if (level === 1) {
                if (!weekCounts[w].interns) weekCounts[w].interns = {};
                weekCounts[w].interns[a1] = (weekCounts[w].interns[a1] || 0) - 1;
                weekCounts[w].interns[a2] = (weekCounts[w].interns[a2] || 0) + 1;
            } else {
                if (!weekCounts[w].seniors) weekCounts[w].seniors = {};
                weekCounts[w].seniors[a1] = (weekCounts[w].seniors[a1] || 0) - 1;
                weekCounts[w].seniors[a2] = (weekCounts[w].seniors[a2] || 0) + 1;
            }
            if (!resCounts[r.id]) resCounts[r.id] = { 1: {}, 2: {}, 3: {} };
            if (!resCounts[r.id][level]) resCounts[r.id][level] = {};
            typeFulfillment[a1]?.forEach(t => resCounts[r.id][level][t] = (resCounts[r.id][level][t] || 0) - 1);
            typeFulfillment[a2]?.forEach(t => resCounts[r.id][level][t] = (resCounts[r.id][level][t] || 0) + 1);
            currentSchedule[r.id][w].assignment = a2;
            const newWP = getWeekPenalty(w, weekCounts[w]), newRP = getResPenalty(r.id, resCounts[r.id]), newCP = getCycleCont(r.id, currentSchedule, cycle);
            const delta = (newWP + newRP + newCP) - (oldWP + oldRP + oldCP);
            if (delta < 0) { currentPenalty += delta; weekPenaltyCache[w] = newWP; resReqPenaltyCache[r.id] = newRP; resContCache[r.id][cycle] = newCP; if (currentPenalty === 0) break; }
            else {
                if (level === 1) {
                    if (!weekCounts[w].interns) weekCounts[w].interns = {};
                    weekCounts[w].interns[a2] = (weekCounts[w].interns[a2] || 0) - 1;
                    weekCounts[w].interns[a1] = (weekCounts[w].interns[a1] || 0) + 1;
                } else {
                    if (!weekCounts[w].seniors) weekCounts[w].seniors = {};
                    weekCounts[w].seniors[a2] = (weekCounts[w].seniors[a2] || 0) - 1;
                    weekCounts[w].seniors[a1] = (weekCounts[w].seniors[a1] || 0) + 1;
                }
                if (!resCounts[r.id]) resCounts[r.id] = { 1: {}, 2: {}, 3: {} };
                if (!resCounts[r.id][level]) resCounts[r.id][level] = {};
                typeFulfillment[a1]?.forEach(t => resCounts[r.id][level][t] = (resCounts[r.id][level][t] || 0) + 1);
                typeFulfillment[a2]?.forEach(t => resCounts[r.id][level][t] = (resCounts[r.id][level][t] || 0) - 1);
                currentSchedule[r.id][w].assignment = a1;
            }
        }

        staffingSweep(true);
        return currentSchedule;
    }
}
