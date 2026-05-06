import { Resident, ScheduleGrid, AssignmentType } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement, COHORT_COUNT, ELECTIVE_TYPES, ACGME_TYPES } from '../../constants';
import { getStandardCohortMap } from '../generators/utils';
import { HealerSolver } from '../healerSolver';

class SeededRNG {
    private seed: number;
    constructor(seed: number) { this.seed = seed; }
    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

export const structuredHealer: HealerSolver = {
    name: "Structured Swapping Healer",
    solve: async (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number>, onProgress?: (step: number, maxSteps: number, currentPenalty: number) => void): Promise<ScheduleGrid> => {
        const existingRows = Object.values(existingSchedule);
        const totalWeeks = existingRows.length > 0 ? existingRows[0].length : TOTAL_WEEKS;
        const rng = new SeededRNG(42 + attemptIndex);
        
        const validCohortAssignments: Record<string, number> = { ...cohortAssignments };
        if (Object.keys(validCohortAssignments).length === 0) {
            const sorted = [...residents].sort((a, b) => (a.level !== b.level) ? a.level - b.level : a.name.localeCompare(b.name));
            sorted.forEach((r, idx) => { validCohortAssignments[r.id] = idx % COHORT_COUNT; });
        }

        const relevantReqTypesSet = new Set<AssignmentType>();
        [1, 2, 3].forEach(l => (REQUIREMENTS[l as 1|2|3] || []).forEach(r => relevantReqTypesSet.add(r.type)));
        const relevantReqTypes = Array.from(relevantReqTypesSet);
        
        const typeFulfillment: Record<string, AssignmentType[]> = {};
        Object.values(AssignmentType).forEach(type => { typeFulfillment[type] = relevantReqTypes.filter(req => fulfillsRequirement(type, req)); });
        
        const assignmentsByLevel: Record<number, AssignmentType[]> = {
            1: Object.values(AssignmentType).filter(t => t !== AssignmentType.CLINIC && t !== AssignmentType.NIMA_CLINIC && t !== AssignmentType.VACATION && (ROTATION_METADATA[t]?.maxInterns || 0) > 0),
            2: Object.values(AssignmentType).filter(t => t !== AssignmentType.CLINIC && t !== AssignmentType.NIMA_CLINIC && t !== AssignmentType.VACATION && (ROTATION_METADATA[t]?.maxSeniors || 0) > 0),
            3: Object.values(AssignmentType).filter(t => t !== AssignmentType.CLINIC && t !== AssignmentType.NIMA_CLINIC && t !== AssignmentType.VACATION && (ROTATION_METADATA[t]?.maxSeniors || 0) > 0),
        };
        
        const constrainedTypes = Object.values(AssignmentType).filter(type => {
            const m = ROTATION_METADATA[type];
            return m && (m.minInterns > 0 || m.maxInterns < 10 || m.minSeniors > 0 || m.maxSeniors < 10);
        });

        const residentMap = new Map(residents.map(r => [r.id, r]));
        
        // Build list of flexible weeks per resident
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

        const W_STAFFING = 10000000, W_JEOPARDY = 5000000, W_REQUIREMENT = 25000, W_CONTINUITY = 1000;
        const TOTAL_CYCLES = Math.floor((totalWeeks - 1) / COHORT_COUNT) + 1;

        const getLevel = (startLvl: number, week: number): number => Math.min(3, startLvl + Math.floor(week / 52));

        const getTypeStaffingPenalty = (type: AssignmentType, interns: number, seniors: number): number => {
            const m = ROTATION_METADATA[type]!; let c = 0;
            if (interns < m.minInterns) c += (m.minInterns - interns) * W_STAFFING;
            if (interns > m.maxInterns) c += (interns - m.maxInterns) * W_STAFFING;
            if (seniors < m.minSeniors) c += (m.minSeniors - seniors) * W_STAFFING;
            if (seniors > m.maxSeniors) c += (seniors - m.maxSeniors) * W_STAFFING;
            return c;
        };

        const flexibleAssigns = [...ELECTIVE_TYPES, AssignmentType.AMCS_CONSULTS];
        const getWeekPenalty = (w: number, wc: any, sched: ScheduleGrid): number => {
            let total = 0; 
            constrainedTypes.forEach(t => total += getTypeStaffingPenalty(t, wc.interns[t] || 0, wc.seniors[t] || 0));
            let pgy2Flexible = 0, pgy3Flexible = 0;
            residents.forEach(r => {
                const pgy = getLevel(Number(r.level) || 1, w);
                const a = sched[r.id][w]?.assignment;
                if (a && flexibleAssigns.includes(a)) {
                    if (pgy === 2) pgy2Flexible++;
                    if (pgy === 3) pgy3Flexible++;
                }
            });
            if (pgy2Flexible < 1) total += W_JEOPARDY;
            if (pgy3Flexible < 1) total += W_JEOPARDY;
            return total;
        };

        const getResPenalty = (rId: string, rcByLvl: Record<number, Record<string, number>>): number => {
            const r = residentMap.get(rId)!;
            const startLvl = Math.max(1, Math.min(3, Number(r.level) || 1));
            const activeLevels = new Set<number>();
            for (let w = 0; w < totalWeeks; w++) activeLevels.add(getLevel(startLvl, w));
            let p = 0;
            activeLevels.forEach(lvl => {
                (REQUIREMENTS[lvl as 1|2|3] || []).forEach(req => {
                    if (ACGME_TYPES.includes(req.type)) {
                        let cumulativeRequired = 0;
                        for (let l = 1; l <= lvl; l++) {
                            const levelReqs = REQUIREMENTS[l] || [];
                            const reqObj = levelReqs.find(rq => rq.type === req.type);
                            cumulativeRequired += reqObj ? reqObj.minWeeks : 0;
                        }
                        let cumulativeActual = priorRequirementCounts?.[rId]?.[req.type] || 0;
                        for (let l = startLvl; l <= lvl; l++) cumulativeActual += rcByLvl[l]?.[req.type] || 0;
                        if (cumulativeActual < cumulativeRequired) p += (cumulativeRequired - cumulativeActual) * W_REQUIREMENT;
                    } else {
                        const c = rcByLvl[lvl][req.type] || 0;
                        if (c < req.minWeeks) p += (req.minWeeks - c) * W_REQUIREMENT;
                    }
                });
            });
            return p;
        };

        const getCycleCont = (rId: string, sched: ScheduleGrid, cycle: number): number => {
            const start = cycle * COHORT_COUNT;
            let lastA: string | null = null, changes = 0;
            for (let i = 0; i < COHORT_COUNT; i++) {
                const w = start + i;
                if (w >= totalWeeks) continue;
                const a = sched[rId][w]?.assignment;
                if (a && a !== lastA) { changes++; lastA = a; }
            }
            return changes * W_CONTINUITY;
        };

        const currentSchedule: ScheduleGrid = JSON.parse(JSON.stringify(existingSchedule));
        const weekCounts: any[] = Array.from({ length: totalWeeks }, () => ({ interns: {}, seniors: {} }));
        const resCounts: Record<string, Record<number, Record<string, number>>> = {};
        const resContCache: Record<string, number[]> = {};

        const syncState = () => {
            residents.forEach(r => {
                resCounts[r.id] = { 1: {}, 2: {}, 3: {} };
                resContCache[r.id] = Array(TOTAL_CYCLES).fill(0);
                const startLvl = Math.max(1, Math.min(3, Number(r.level) || 1));
                for (let w = 0; w < totalWeeks; w++) {
                    const a = currentSchedule[r.id]?.[w]?.assignment;
                    if (a) {
                        const level = getLevel(startLvl, w);
                        if (level === 1) weekCounts[w].interns[a] = (weekCounts[w].interns[a] || 0) + 1;
                        else weekCounts[w].seniors[a] = (weekCounts[w].seniors[a] || 0) + 1;
                        if (!existingSchedule?.[r.id]?.[w]?.locked) {
                            typeFulfillment[a]?.forEach(t => resCounts[r.id][level][t] = (resCounts[r.id][level][t] || 0) + 1);
                        }
                    }
                }
                for (let c = 0; c < TOTAL_CYCLES; c++) resContCache[r.id][c] = getCycleCont(r.id, currentSchedule, c);
            });
        };
        syncState();

        const weekPenaltyCache: number[] = weekCounts.map((wc, w) => getWeekPenalty(w, wc, currentSchedule));
        const resReqPenaltyCache: Record<string, number> = {};
        residents.forEach(r => resReqPenaltyCache[r.id] = getResPenalty(r.id, resCounts[r.id]));
        
        let currentPenalty = 0; 
        weekPenaltyCache.forEach(p => currentPenalty += p);
        residents.forEach(r => { 
            currentPenalty += resReqPenaltyCache[r.id]; 
            resContCache[r.id].forEach(p => currentPenalty += p); 
        });

        let bestSchedule = JSON.parse(JSON.stringify(currentSchedule));
        let bestPenalty = currentPenalty;

        if (currentPenalty === 0) return currentSchedule;

        const maxSteps = 1000000;
        let temp = 1.0;
        const coolRate = 0.99999;

        for (let step = 0; step < maxSteps; step++) {
            if (step % 10000 === 0) {
                if (typeof (globalThis as any).checkInterrupt !== 'undefined' && (globalThis as any).checkInterrupt()) break;
                const reqV = Object.values(resReqPenaltyCache).reduce((sum, p) => sum + Math.floor(p / W_REQUIREMENT), 0);
                const staffV = weekPenaltyCache.reduce((sum, p) => sum + Math.floor(p / W_STAFFING), 0);
                if (onProgress) onProgress(step, maxSteps, reqV + staffV);
                await new Promise(resolve => setTimeout(resolve, 0));
                if (step % 50000 === 0) {
                    console.log(`[Healer Step ${step}] Penalty: ${currentPenalty.toLocaleString()} | Staff: ${staffV} | Req: ${reqV} | Temp: ${temp.toFixed(4)}`);
                }
            }

            const moveType = rng.next();
            // 60% Cross-Resident Swap, 30% Intra-Resident Swap, 10% Mutation
            if (moveType < 0.6) {
                // --- CROSS-RESIDENT SWAP ---
                const w = Math.floor(rng.next() * totalWeeks);
                const r1 = residents[Math.floor(rng.next() * residents.length)];
                const r2 = residents[Math.floor(rng.next() * residents.length)];
                if (r1.id === r2.id || !isFlexible[r1.id][w] || !isFlexible[r2.id][w]) continue;

                const a1 = currentSchedule[r1.id][w].assignment!;
                const a2 = currentSchedule[r2.id][w].assignment!;
                if (a1 === a2) continue;

                const l1 = getLevel(Math.max(1, Math.min(3, Number(r1.level) || 1)), w);
                const l2 = getLevel(Math.max(1, Math.min(3, Number(r2.level) || 1)), w);
                
                // Apply swap
                if (l1 === 1) weekCounts[w].interns[a1]--; else weekCounts[w].seniors[a1]--;
                if (l1 === 1) weekCounts[w].interns[a2]++; else weekCounts[w].seniors[a2]++;
                if (l2 === 1) weekCounts[w].interns[a2]--; else weekCounts[w].seniors[a2]--;
                if (l2 === 1) weekCounts[w].interns[a1]++; else weekCounts[w].seniors[a1]++;

                typeFulfillment[a1]?.forEach(t => resCounts[r1.id][l1][t]--);
                typeFulfillment[a2]?.forEach(t => resCounts[r1.id][l1][t] = (resCounts[r1.id][l1][t] || 0) + 1);
                typeFulfillment[a2]?.forEach(t => resCounts[r2.id][l2][t]--);
                typeFulfillment[a1]?.forEach(t => resCounts[r2.id][l2][t] = (resCounts[r2.id][l2][t] || 0) + 1);

                currentSchedule[r1.id][w].assignment = a2;
                currentSchedule[r2.id][w].assignment = a1;

                const cycle = Math.floor(w / COHORT_COUNT);
                const newWp = getWeekPenalty(w, weekCounts[w], currentSchedule);
                const newRp1 = getResPenalty(r1.id, resCounts[r1.id]);
                const newRp2 = getResPenalty(r2.id, resCounts[r2.id]);
                const newCp1 = getCycleCont(r1.id, currentSchedule, cycle);
                const newCp2 = getCycleCont(r2.id, currentSchedule, cycle);

                const delta = (newWp + newRp1 + newRp2 + newCp1 + newCp2) - 
                              (weekPenaltyCache[w] + resReqPenaltyCache[r1.id] + resReqPenaltyCache[r2.id] + resContCache[r1.id][cycle] + resContCache[r2.id][cycle]);

                if (delta <= 0 || Math.exp(-delta / (temp * 25000)) > rng.next()) {
                    currentPenalty += delta;
                    weekPenaltyCache[w] = newWp;
                    resReqPenaltyCache[r1.id] = newRp1;
                    resReqPenaltyCache[r2.id] = newRp2;
                    resContCache[r1.id][cycle] = newCp1;
                    resContCache[r2.id][cycle] = newCp2;
                    if (currentPenalty < bestPenalty) {
                        bestPenalty = currentPenalty;
                        bestSchedule = JSON.parse(JSON.stringify(currentSchedule));
                    }
                    if (currentPenalty === 0) break;
                } else {
                    // Revert
                    if (l1 === 1) weekCounts[w].interns[a1]++; else weekCounts[w].seniors[a1]++;
                    if (l1 === 1) weekCounts[w].interns[a2]--; else weekCounts[w].seniors[a2]--;
                    if (l2 === 1) weekCounts[w].interns[a2]++; else weekCounts[w].seniors[a2]++;
                    if (l2 === 1) weekCounts[w].interns[a1]--; else weekCounts[w].seniors[a1]--;
                    typeFulfillment[a1]?.forEach(t => resCounts[r1.id][l1][t]++);
                    typeFulfillment[a2]?.forEach(t => resCounts[r1.id][l1][t]--);
                    typeFulfillment[a2]?.forEach(t => resCounts[r2.id][l2][t]++);
                    typeFulfillment[a1]?.forEach(t => resCounts[r2.id][l2][t]--);
                    currentSchedule[r1.id][w].assignment = a1;
                    currentSchedule[r2.id][w].assignment = a2;
                }

            } else if (moveType < 0.9) {
                // --- INTRA-RESIDENT SWAP ---
                const r = residents[Math.floor(rng.next() * residents.length)];
                const weeks = flexibleWeeks[r.id];
                if (weeks.length < 2) continue;
                
                const w1 = weeks[Math.floor(rng.next() * weeks.length)];
                const w2 = weeks[Math.floor(rng.next() * weeks.length)];
                if (w1 === w2) continue;

                const a1 = currentSchedule[r.id][w1].assignment!;
                const a2 = currentSchedule[r.id][w2].assignment!;
                if (a1 === a2) continue;

                const startLvl = Math.max(1, Math.min(3, Number(r.level) || 1));
                const l1 = getLevel(startLvl, w1);
                const l2 = getLevel(startLvl, w2);

                // Apply
                if (l1 === 1) weekCounts[w1].interns[a1]--; else weekCounts[w1].seniors[a1]--;
                if (l1 === 1) weekCounts[w1].interns[a2]++; else weekCounts[w1].seniors[a2]++;
                if (l2 === 1) weekCounts[w2].interns[a2]--; else weekCounts[w2].seniors[a2]--;
                if (l2 === 1) weekCounts[w2].interns[a1]++; else weekCounts[w2].seniors[a1]++;

                typeFulfillment[a1]?.forEach(t => resCounts[r.id][l1][t]--);
                typeFulfillment[a2]?.forEach(t => resCounts[r.id][l1][t] = (resCounts[r.id][l1][t] || 0) + 1);
                typeFulfillment[a2]?.forEach(t => resCounts[r.id][l2][t]--);
                typeFulfillment[a1]?.forEach(t => resCounts[r.id][l2][t] = (resCounts[r.id][l2][t] || 0) + 1);

                currentSchedule[r.id][w1].assignment = a2;
                currentSchedule[r.id][w2].assignment = a1;

                const c1 = Math.floor(w1 / COHORT_COUNT);
                const c2 = Math.floor(w2 / COHORT_COUNT);

                const newWp1 = getWeekPenalty(w1, weekCounts[w1], currentSchedule);
                const newWp2 = getWeekPenalty(w2, weekCounts[w2], currentSchedule);
                const newRp = getResPenalty(r.id, resCounts[r.id]);
                const newCp1 = getCycleCont(r.id, currentSchedule, c1);
                const newCp2 = c1 === c2 ? newCp1 : getCycleCont(r.id, currentSchedule, c2);

                const delta = (newWp1 + newWp2 + newRp + newCp1 + (c1 === c2 ? 0 : newCp2)) - 
                              (weekPenaltyCache[w1] + weekPenaltyCache[w2] + resReqPenaltyCache[r.id] + resContCache[r.id][c1] + (c1 === c2 ? 0 : resContCache[r.id][c2]));

                if (delta <= 0 || Math.exp(-delta / (temp * 25000)) > rng.next()) {
                    currentPenalty += delta;
                    weekPenaltyCache[w1] = newWp1;
                    weekPenaltyCache[w2] = newWp2;
                    resReqPenaltyCache[r.id] = newRp;
                    resContCache[r.id][c1] = newCp1;
                    if (c1 !== c2) resContCache[r.id][c2] = newCp2;
                    if (currentPenalty < bestPenalty) {
                        bestPenalty = currentPenalty;
                        bestSchedule = JSON.parse(JSON.stringify(currentSchedule));
                    }
                    if (currentPenalty === 0) break;
                } else {
                    // Revert
                    if (l1 === 1) weekCounts[w1].interns[a1]++; else weekCounts[w1].seniors[a1]++;
                    if (l1 === 1) weekCounts[w1].interns[a2]--; else weekCounts[w1].seniors[a2]--;
                    if (l2 === 1) weekCounts[w2].interns[a2]++; else weekCounts[w2].seniors[a2]++;
                    if (l2 === 1) weekCounts[w2].interns[a1]--; else weekCounts[w2].seniors[a1]--;
                    typeFulfillment[a1]?.forEach(t => resCounts[r.id][l1][t]++);
                    typeFulfillment[a2]?.forEach(t => resCounts[r.id][l1][t]--);
                    typeFulfillment[a2]?.forEach(t => resCounts[r.id][l2][t]++);
                    typeFulfillment[a1]?.forEach(t => resCounts[r.id][l2][t]--);
                    currentSchedule[r.id][w1].assignment = a1;
                    currentSchedule[r.id][w2].assignment = a2;
                }
            } else {
                // --- MUTATION ---
                const r = residents[Math.floor(rng.next() * residents.length)];
                const weeks = flexibleWeeks[r.id];
                if (weeks.length === 0) continue;
                const w = weeks[Math.floor(rng.next() * weeks.length)];
                const startLvl = Math.max(1, Math.min(3, Number(r.level) || 1));
                const level = getLevel(startLvl, w);
                
                const a1 = currentSchedule[r.id][w].assignment!;
                const possibleAssigns = assignmentsByLevel[level];
                const a2 = possibleAssigns[Math.floor(rng.next() * possibleAssigns.length)];
                if (a1 === a2) continue;

                if (level === 1) {
                    weekCounts[w].interns[a1]--;
                    weekCounts[w].interns[a2] = (weekCounts[w].interns[a2] || 0) + 1;
                } else {
                    weekCounts[w].seniors[a1]--;
                    weekCounts[w].seniors[a2] = (weekCounts[w].seniors[a2] || 0) + 1;
                }
                typeFulfillment[a1]?.forEach(t => resCounts[r.id][level][t]--);
                typeFulfillment[a2]?.forEach(t => resCounts[r.id][level][t] = (resCounts[r.id][level][t] || 0) + 1);
                currentSchedule[r.id][w].assignment = a2;

                const c = Math.floor(w / COHORT_COUNT);
                const newWp = getWeekPenalty(w, weekCounts[w], currentSchedule);
                const newRp = getResPenalty(r.id, resCounts[r.id]);
                const newCp = getCycleCont(r.id, currentSchedule, c);

                const delta = (newWp + newRp + newCp) - (weekPenaltyCache[w] + resReqPenaltyCache[r.id] + resContCache[r.id][c]);

                if (delta <= 0 || Math.exp(-delta / (temp * 25000)) > rng.next()) {
                    currentPenalty += delta;
                    weekPenaltyCache[w] = newWp;
                    resReqPenaltyCache[r.id] = newRp;
                    resContCache[r.id][c] = newCp;
                    if (currentPenalty < bestPenalty) {
                        bestPenalty = currentPenalty;
                        bestSchedule = JSON.parse(JSON.stringify(currentSchedule));
                    }
                    if (currentPenalty === 0) break;
                } else {
                    if (level === 1) {
                        weekCounts[w].interns[a1]++;
                        weekCounts[w].interns[a2]--;
                    } else {
                        weekCounts[w].seniors[a1]++;
                        weekCounts[w].seniors[a2]--;
                    }
                    typeFulfillment[a1]?.forEach(t => resCounts[r.id][level][t]++);
                    typeFulfillment[a2]?.forEach(t => resCounts[r.id][level][t]--);
                    currentSchedule[r.id][w].assignment = a1;
                }
            }
            temp *= coolRate;
        }

        console.log(`[Healer End] final penalty: ${bestPenalty}`);
        return bestSchedule;
    }
};
