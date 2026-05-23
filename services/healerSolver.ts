import { Resident, ScheduleGrid, AssignmentType, ScheduleHistory } from '../types';
import { RequirementsEngine } from './requirementsEngine';
import { ProgramData } from './api/client';
import { ACTIVE_START_YEAR } from '../constants';
import { getAllCodenames, isClinicRotation } from './programDataUtils';
import { getCohortAtWeek, getStandardCohortMap } from './generators/utils';
import { buildLevelRequirements } from './generators/reqBuilder';

class SeededRNG {
    private seed: number;
    constructor(seed: number) { this.seed = seed; }
    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

export interface HealerSolver {
    name: string;
    solve: (
        residents: Resident[],
        existingSchedule: ScheduleGrid,
        programData: ProgramData,
        attemptIndex?: number,
        historicalSchedules?: ScheduleHistory,
        cohortAssignments?: Record<string, number>,
        onProgress?: (step: number, maxSteps: number, currentPenalty: number, currentSchedule?: ScheduleGrid) => void,
        strategy?: string
    ) => Promise<ScheduleGrid>;
}

export const healer: HealerSolver = {
    name: "Annealing Healer Solver",
    solve: async (residents: Resident[], existingSchedule: ScheduleGrid, programData: ProgramData, attemptIndex: number = 0, historicalSchedules?: ScheduleHistory, cohortAssignments?: Record<string, number>, onProgress?: (step: number, maxSteps: number, currentPenalty: number, currentSchedule?: ScheduleGrid) => void, strategy?: string): Promise<ScheduleGrid> => {
        const existingRows = Object.values(existingSchedule);
        const totalWeeks = existingRows.length > 0 ? existingRows[0].length : 52;
        const rng = new SeededRNG(42 + attemptIndex);
        const validCohortAssignments: Record<string, number> = { ...cohortAssignments };
        if (Object.keys(validCohortAssignments).length === 0) {
            const sorted = [...residents].sort((a, b) => (a.level !== b.level) ? a.level - b.level : a.name.localeCompare(b.name));
            sorted.forEach((r, idx) => { validCohortAssignments[r.id] = idx % programData.cycleConfig.cohortCount; });
        }

        const relevantReqTypesSet = new Set<AssignmentType>();
        [1, 2, 3].forEach(l => (buildLevelRequirements(programData, l) || []).forEach(r => relevantReqTypesSet.add(r.type)));
        const relevantReqTypes = Array.from(relevantReqTypesSet);
        const typeFulfillment: Record<string, AssignmentType[]> = {};
        const allCodenames = getAllCodenames(programData);
        allCodenames.forEach(type => { typeFulfillment[type] = relevantReqTypes.filter(req => RequirementsEngine.fulfills(type, req, programData)); });
        const assignmentsByLevel: Record<number, AssignmentType[]> = {
            1: allCodenames.filter(t => !isClinicRotation(programData, t) && t !== 'VAC' && (programData.rotations.get(t)?.maxInterns || 0) > 0),
            2: allCodenames.filter(t => !isClinicRotation(programData, t) && t !== 'VAC' && (programData.rotations.get(t)?.maxSeniors || 0) > 0),
            3: allCodenames.filter(t => !isClinicRotation(programData, t) && t !== 'VAC' && (programData.rotations.get(t)?.maxSeniors || 0) > 0),
        };
        const constrainedTypes = allCodenames.filter(type => {
            const m = programData.rotations.get(type);
            return m && (m.minInterns > 0 || m.maxInterns < 10 || m.minSeniors > 0 || m.maxSeniors < 10);
        });

        const residentMap = new Map(residents.map(r => [r.id, r]));
        const flexibleWeeks: Record<string, number[]> = {};
        const isFlexible: Record<string, boolean[]> = {};
        residents.forEach(r => {
            const start = r.activeWeekStart ?? 0;
            const end = r.activeWeekEnd ?? totalWeeks;
            flexibleWeeks[r.id] = []; isFlexible[r.id] = Array(totalWeeks).fill(false);
            for (let w = 0; w < totalWeeks; w++) {
                const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                const { Y, Z } = programData.cycleConfig;
                const isClinic = Math.floor((w % Z) / Y) === cohort;
                if (w >= start && w < end && !isClinic && !(existingSchedule?.[r.id]?.[w]?.locked)) {
                    flexibleWeeks[r.id].push(w);
                    isFlexible[r.id][w] = true;
                }
            }
        });

        const W_STAFFING = 10000000, W_JEOPARDY = 5000000, W_REQUIREMENT = 25000, W_CONTINUITY = 1000;
        const TOTAL_CYCLES = Math.floor((totalWeeks - 1) / programData.cycleConfig.Z) + 1;

        const firstRes = residents.find(res => res.startYear && res.startYear > 0);
        const gridStartYear = firstRes ? (firstRes.startYear + Number(firstRes.level) - 1) : ACTIVE_START_YEAR;

        const getPgyAtWeek = (res: Resident, week: number): number => {
            return Math.min(3, RequirementsEngine.getPgyAtWeek(res, week, gridStartYear));
        };

        const getTypeStaffingPenalty = (type: AssignmentType, interns: number, seniors: number): number => {
            const defs = RequirementsEngine.getStaffingDeficits(type, interns, seniors, programData);
            if (!defs) return 0;
            return (defs.internMin + defs.internMax + defs.seniorMin + defs.seniorMax) * W_STAFFING;
        };

        let currentSchedule: ScheduleGrid = JSON.parse(JSON.stringify(existingSchedule));
        let bestSchedule = JSON.parse(JSON.stringify(existingSchedule));

        const getResPenalty = (resId: string, counts: Record<number, Record<string, number>>): { p: number, raw: number } => {
            const r = residentMap.get(resId); if (!r) return { p: 0, raw: 0 };
            let totalPen = 0;
            let raw = 0;
            const isUnified = Math.floor(totalWeeks / 52) === 3;
            
            const violations = RequirementsEngine.getResidentViolations(
                r,
                currentSchedule,
                historicalSchedules || {},
                gridStartYear,
                programData,
                isUnified
            );

            violations.forEach(v => {
                const diff = Math.max(0, v.minWeeks - v.actual);
                totalPen += diff * W_REQUIREMENT;
                raw += diff;
            });

            const auditViolations = RequirementsEngine.getResidentAuditViolations(
                r,
                currentSchedule,
                historicalSchedules || {},
                gridStartYear,
                programData,
                isUnified
            );
            
            totalPen += auditViolations * W_REQUIREMENT;
            raw += auditViolations;

            return { p: totalPen, raw };
        };

        const getCycleCont = (resId: string, sched: ScheduleGrid, cycleIdx: number): number => {
            const r = residentMap.get(resId); if (!r) return 0;
            const { Y, Z } = programData.cycleConfig;
            const wStart = cycleIdx * Z;
            let inpChain = 0, maxChain = 0, isChaining = false;
            for (let i = 0; i < Z; i++) {
                const w = wStart + i; if (w >= totalWeeks) break;
                const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                const isClinic = Math.floor((w % Z) / Y) === cohort;
                if (isClinic) {
                    if (isChaining) { if (inpChain > maxChain) maxChain = inpChain; inpChain = 0; isChaining = false; }
                } else {
                    const type = sched[resId]?.[w]?.assignment;
                    if (type && !isClinicRotation(programData, type) && type !== 'VAC') {
                        isChaining = true; inpChain++;
                    } else {
                        if (isChaining) { if (inpChain > maxChain) maxChain = inpChain; inpChain = 0; isChaining = false; }
                    }
                }
            }
            if (isChaining && inpChain > maxChain) maxChain = inpChain;
            let penalty = 0;
            if (maxChain > 4) penalty += (maxChain - 4) * W_CONTINUITY;
            return penalty;
        };

        const getWeekPenalty = (week: number, counts: { interns: Record<string, number>; seniors: Record<string, number> }, sched: ScheduleGrid): { p: number, raw: number } => {
            let p = 0;
            let raw = 0;

            const activeResidentsAtWeek = residents.filter(r => {
                const start = r.activeWeekStart ?? 0;
                const end = r.activeWeekEnd ?? totalWeeks;
                return week >= start && week < end;
            });

            const globalWeek = week;

            const weeklyViolations = RequirementsEngine.getViolationsForWeek(
                week, globalWeek, totalWeeks, sched, residents, activeResidentsAtWeek, programData, gridStartYear, gridStartYear, validCohortAssignments as any, counts
            );

            weeklyViolations.forEach(v => {
                raw += v.instances || 1;
                if (v.issue.includes("Jeopardy Gap")) {
                    p += W_JEOPARDY * (v.instances || 1);
                } else if (v.type === 'CCIM' && v.issue.includes('clinic')) {
                    // Empty clinic weeks are logged under staffing
                    p += W_STAFFING * (v.instances || 1);
                } else {
                    p += W_STAFFING * (v.instances || 1);
                }
            });

            return { p, raw };
        };

        // Cache setup
        const weekCounts: { interns: Record<string, number>; seniors: Record<string, number> }[] = Array(totalWeeks).fill(null).map(() => ({ interns: {}, seniors: {} }));
        const resCounts: Record<string, Record<number, Record<string, number>>> = {};
        const resReqPenaltyCache: Record<string, number> = {};
        const resContCache: Record<string, number[]> = {};
        const weekPenaltyCache: number[] = Array(totalWeeks).fill(0);

        residents.forEach(r => {
            resCounts[r.id] = { 1: {}, 2: {}, 3: {} };
            resContCache[r.id] = Array(TOTAL_CYCLES).fill(0);
        });

        // Initialize cache
        for (let w = 0; w < totalWeeks; w++) {
            residents.forEach(r => {
                const cell = existingSchedule[r.id]?.[w];
                const assignment = cell?.assignment || 'ELEC';
                const start = r.activeWeekStart ?? 0;
                const end = r.activeWeekEnd ?? totalWeeks;
                if (w >= start && w < end) {
                    const lvl = getPgyAtWeek(r, w);
                    if (lvl === 1) {
                        weekCounts[w].interns[assignment] = (weekCounts[w].interns[assignment] || 0) + 1;
                    } else {
                        weekCounts[w].seniors[assignment] = (weekCounts[w].seniors[assignment] || 0) + 1;
                    }
                    typeFulfillment[assignment]?.forEach(t => {
                        resCounts[r.id][lvl][t] = (resCounts[r.id][lvl][t] || 0) + 1;
                    });
                }
            });
        }

        let currentPenalty = 0;

        const getRawTotals = (): number => {
            let r = 0;
            for (let w = 0; w < totalWeeks; w++) r += getWeekPenalty(w, weekCounts[w], currentSchedule).raw;
            residents.forEach(res => r += getResPenalty(res.id, resCounts[res.id]).raw);
            return r;
        };

        for (let w = 0; w < totalWeeks; w++) {
            const { p } = getWeekPenalty(w, weekCounts[w], currentSchedule);
            weekPenaltyCache[w] = p;
            currentPenalty += p;
        }

        residents.forEach(r => {
            const { p: reqP } = getResPenalty(r.id, resCounts[r.id]);
            resReqPenaltyCache[r.id] = reqP;
            currentPenalty += reqP;
            for (let c = 0; c < TOTAL_CYCLES; c++) {
                const contP = getCycleCont(r.id, currentSchedule, c);
                resContCache[r.id][c] = contP;
                currentPenalty += contP;
            }
        });

        let bestPenalty = currentPenalty;
        console.log(`[Healer Start] Initial global penalty: ${currentPenalty.toLocaleString()} (Staffing: ${weekPenaltyCache.reduce((a, b) => a + b, 0).toLocaleString()}, Requirements: ${Object.values(resReqPenaltyCache).reduce((a, b) => a + b, 0).toLocaleString()})`);

        const maxSteps = 200000;
        let temp = 1.0;
        const coolRate = 0.99998;

        for (let step = 0; step < maxSteps; step++) {
            if (step % 2000 === 0) {
                if (typeof (globalThis as any).checkInterrupt !== 'undefined' && (globalThis as any).checkInterrupt()) break;
                if (onProgress) onProgress(step, maxSteps, getRawTotals(), currentSchedule);
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            if (step % 50000 === 0) {
                const staffV = weekPenaltyCache.reduce((sum, p) => sum + Math.floor(p / W_STAFFING), 0);
                const jeopardyV = weekPenaltyCache.reduce((sum, p) => sum + (Math.floor(p % W_STAFFING) / W_JEOPARDY), 0);
                const reqV = Object.values(resReqPenaltyCache).reduce((sum, p) => sum + Math.floor(p / W_REQUIREMENT), 0);
                console.log(`[Healer Step ${step}] Penalty: ${currentPenalty.toLocaleString()} | Staffing: ${staffV} | Jeopardy: ${jeopardyV} | Req: ${reqV} | Temp: ${temp.toFixed(4)}`);
            }

            if (strategy === '2-way') {
                // 2-Resident Swap Strategy (Staffing Neutral)
                const w = Math.floor(rng.next() * totalWeeks);
                const candidates = residents.filter(res => isFlexible[res.id][w]);
                if (candidates.length < 2) continue;

                const r1 = candidates[Math.floor(rng.next() * candidates.length)];
                const lvl = getPgyAtWeek(r1, w);
                const candidatesSameLvl = candidates.filter(res => res.id !== r1.id && getPgyAtWeek(res, w) === lvl);
                if (candidatesSameLvl.length === 0) continue;
                const r2 = candidatesSameLvl[Math.floor(rng.next() * candidatesSameLvl.length)];

                let blockSize = 1;
                const rand = rng.next();
                if (rand < 0.5) blockSize = 4; else if (rand < 0.85) blockSize = 2; else blockSize = 1;

                const blockWeeks: number[] = [];
                let canSwap = true;
                for (let i = 0; i < blockSize; i++) {
                    const wk = w + i;
                    if (wk >= totalWeeks) { canSwap = false; break; }
                    if (!isFlexible[r1.id][wk] || !isFlexible[r2.id][wk]) { canSwap = false; break; }
                    if (getPgyAtWeek(r1, wk) !== lvl || getPgyAtWeek(r2, wk) !== lvl) { canSwap = false; break; }
                    blockWeeks.push(wk);
                }
                if (!canSwap || blockWeeks.length === 0) continue;

                const oldA1 = blockWeeks.map(wk => currentSchedule[r1.id]?.[wk]?.assignment!);
                const oldA2 = blockWeeks.map(wk => currentSchedule[r2.id]?.[wk]?.assignment!);
                if (blockWeeks.every((wk, idx) => oldA1[idx] === oldA2[idx])) continue;

                const oldRP1 = resReqPenaltyCache[r1.id];
                const oldRP2 = resReqPenaltyCache[r2.id];
                const affectedCycles = Array.from(new Set(blockWeeks.map(wk => Math.floor(wk / programData.cycleConfig.Z))));
                const oldCPs1 = affectedCycles.map(c => resContCache[r1.id][c]);
                const oldCPs2 = affectedCycles.map(c => resContCache[r2.id][c]);

                // Swap
                blockWeeks.forEach((wk, idx) => {
                    const a1 = oldA1[idx];
                    const a2 = oldA2[idx];

                    typeFulfillment[a1]?.forEach(t => resCounts[r1.id][lvl][t] = (resCounts[r1.id][lvl][t] || 0) - 1);
                    typeFulfillment[a2]?.forEach(t => resCounts[r1.id][lvl][t] = (resCounts[r1.id][lvl][t] || 0) + 1);

                    typeFulfillment[a2]?.forEach(t => resCounts[r2.id][lvl][t] = (resCounts[r2.id][lvl][t] || 0) - 1);
                    typeFulfillment[a1]?.forEach(t => resCounts[r2.id][lvl][t] = (resCounts[r2.id][lvl][t] || 0) + 1);

                    currentSchedule[r1.id][wk].assignment = a2;
                    currentSchedule[r2.id][wk].assignment = a1;
                });

                const newRP1 = getResPenalty(r1.id, resCounts[r1.id]).p;
                const newRP2 = getResPenalty(r2.id, resCounts[r2.id]).p;
                const newCPs1 = affectedCycles.map(c => getCycleCont(r1.id, currentSchedule, c));
                const newCPs2 = affectedCycles.map(c => getCycleCont(r2.id, currentSchedule, c));

                const delta = (newRP1 + newRP2 + newCPs1.reduce((a, b) => a + b, 0) + newCPs2.reduce((a, b) => a + b, 0)) -
                              (oldRP1 + oldRP2 + oldCPs1.reduce((a, b) => a + b, 0) + oldCPs2.reduce((a, b) => a + b, 0));

                if (delta <= 0 || Math.exp(-delta / (temp * 25000)) > rng.next()) {
                    currentPenalty += delta;
                    resReqPenaltyCache[r1.id] = newRP1;
                    resReqPenaltyCache[r2.id] = newRP2;
                    affectedCycles.forEach((c, idx) => {
                        resContCache[r1.id][c] = newCPs1[idx];
                        resContCache[r2.id][c] = newCPs2[idx];
                    });
                    if (currentPenalty < bestPenalty) {
                        bestPenalty = currentPenalty;
                        bestSchedule = JSON.parse(JSON.stringify(currentSchedule));
                    }
                    if (currentPenalty === 0) break;
                } else {
                    // Revert
                    blockWeeks.forEach((wk, idx) => {
                        const a1 = oldA1[idx];
                        const a2 = oldA2[idx];

                        typeFulfillment[a2]?.forEach(t => resCounts[r1.id][lvl][t] = (resCounts[r1.id][lvl][t] || 0) - 1);
                        typeFulfillment[a1]?.forEach(t => resCounts[r1.id][lvl][t] = (resCounts[r1.id][lvl][t] || 0) + 1);

                        typeFulfillment[a1]?.forEach(t => resCounts[r2.id][lvl][t] = (resCounts[r2.id][lvl][t] || 0) - 1);
                        typeFulfillment[a2]?.forEach(t => resCounts[r2.id][lvl][t] = (resCounts[r2.id][lvl][t] || 0) + 1);

                        currentSchedule[r1.id][wk].assignment = a1;
                        currentSchedule[r2.id][wk].assignment = a2;
                    });
                }
            } else if (strategy === '3-way') {
                // 3-Resident Cyclic Swap Strategy (Staffing Neutral)
                const w = Math.floor(rng.next() * totalWeeks);
                const candidates = residents.filter(res => isFlexible[res.id][w]);
                if (candidates.length < 3) continue;

                const r1 = candidates[Math.floor(rng.next() * candidates.length)];
                const lvl = getPgyAtWeek(r1, w);
                const candidatesSameLvl = candidates.filter(res => res.id !== r1.id && getPgyAtWeek(res, w) === lvl);
                if (candidatesSameLvl.length < 2) continue;

                const r2Idx = Math.floor(rng.next() * candidatesSameLvl.length);
                const r2 = candidatesSameLvl[r2Idx];
                const candidatesRemaining = candidatesSameLvl.filter(res => res.id !== r2.id);
                const r3 = candidatesRemaining[Math.floor(rng.next() * candidatesRemaining.length)];

                let blockSize = 1;
                const rand = rng.next();
                if (rand < 0.5) blockSize = 4; else if (rand < 0.85) blockSize = 2; else blockSize = 1;

                const blockWeeks: number[] = [];
                let canSwap = true;
                for (let i = 0; i < blockSize; i++) {
                    const wk = w + i;
                    if (wk >= totalWeeks) { canSwap = false; break; }
                    if (!isFlexible[r1.id][wk] || !isFlexible[r2.id][wk] || !isFlexible[r3.id][wk]) { canSwap = false; break; }
                    if (getPgyAtWeek(r1, wk) !== lvl || getPgyAtWeek(r2, wk) !== lvl || getPgyAtWeek(r3, wk) !== lvl) { canSwap = false; break; }
                    blockWeeks.push(wk);
                }
                if (!canSwap || blockWeeks.length === 0) continue;

                const oldA1 = blockWeeks.map(wk => currentSchedule[r1.id]?.[wk]?.assignment!);
                const oldA2 = blockWeeks.map(wk => currentSchedule[r2.id]?.[wk]?.assignment!);
                const oldA3 = blockWeeks.map(wk => currentSchedule[r3.id]?.[wk]?.assignment!);

                if (blockWeeks.every((wk, idx) => oldA1[idx] === oldA2[idx] && oldA2[idx] === oldA3[idx])) continue;

                const oldRP1 = resReqPenaltyCache[r1.id];
                const oldRP2 = resReqPenaltyCache[r2.id];
                const oldRP3 = resReqPenaltyCache[r3.id];
                const affectedCycles = Array.from(new Set(blockWeeks.map(wk => Math.floor(wk / programData.cycleConfig.Z))));
                const oldCPs1 = affectedCycles.map(c => resContCache[r1.id][c]);
                const oldCPs2 = affectedCycles.map(c => resContCache[r2.id][c]);
                const oldCPs3 = affectedCycles.map(c => resContCache[r3.id][c]);

                // Cyclic Rotation: r1 gets r2, r2 gets r3, r3 gets r1
                blockWeeks.forEach((wk, idx) => {
                    const a1 = oldA1[idx];
                    const a2 = oldA2[idx];
                    const a3 = oldA3[idx];

                    typeFulfillment[a1]?.forEach(t => resCounts[r1.id][lvl][t] = (resCounts[r1.id][lvl][t] || 0) - 1);
                    typeFulfillment[a2]?.forEach(t => resCounts[r1.id][lvl][t] = (resCounts[r1.id][lvl][t] || 0) + 1);

                    typeFulfillment[a2]?.forEach(t => resCounts[r2.id][lvl][t] = (resCounts[r2.id][lvl][t] || 0) - 1);
                    typeFulfillment[a3]?.forEach(t => resCounts[r2.id][lvl][t] = (resCounts[r2.id][lvl][t] || 0) + 1);

                    typeFulfillment[a3]?.forEach(t => resCounts[r3.id][lvl][t] = (resCounts[r3.id][lvl][t] || 0) - 1);
                    typeFulfillment[a1]?.forEach(t => resCounts[r3.id][lvl][t] = (resCounts[r3.id][lvl][t] || 0) + 1);

                    currentSchedule[r1.id][wk].assignment = a2;
                    currentSchedule[r2.id][wk].assignment = a3;
                    currentSchedule[r3.id][wk].assignment = a1;
                });

                const newRP1 = getResPenalty(r1.id, resCounts[r1.id]).p;
                const newRP2 = getResPenalty(r2.id, resCounts[r2.id]).p;
                const newRP3 = getResPenalty(r3.id, resCounts[r3.id]).p;
                const newCPs1 = affectedCycles.map(c => getCycleCont(r1.id, currentSchedule, c));
                const newCPs2 = affectedCycles.map(c => getCycleCont(r2.id, currentSchedule, c));
                const newCPs3 = affectedCycles.map(c => getCycleCont(r3.id, currentSchedule, c));

                const delta = (newRP1 + newRP2 + newRP3 + newCPs1.reduce((a, b) => a + b, 0) + newCPs2.reduce((a, b) => a + b, 0) + newCPs3.reduce((a, b) => a + b, 0)) -
                              (oldRP1 + oldRP2 + oldRP3 + oldCPs1.reduce((a, b) => a + b, 0) + oldCPs2.reduce((a, b) => a + b, 0) + oldCPs3.reduce((a, b) => a + b, 0));

                if (delta <= 0 || Math.exp(-delta / (temp * 25000)) > rng.next()) {
                    currentPenalty += delta;
                    resReqPenaltyCache[r1.id] = newRP1;
                    resReqPenaltyCache[r2.id] = newRP2;
                    resReqPenaltyCache[r3.id] = newRP3;
                    affectedCycles.forEach((c, idx) => {
                        resContCache[r1.id][c] = newCPs1[idx];
                        resContCache[r2.id][c] = newCPs2[idx];
                        resContCache[r3.id][c] = newCPs3[idx];
                    });
                    if (currentPenalty < bestPenalty) {
                        bestPenalty = currentPenalty;
                        bestSchedule = JSON.parse(JSON.stringify(currentSchedule));
                    }
                    if (currentPenalty === 0) break;
                } else {
                    // Revert
                    blockWeeks.forEach((wk, idx) => {
                        const a1 = oldA1[idx];
                        const a2 = oldA2[idx];
                        const a3 = oldA3[idx];

                        typeFulfillment[a2]?.forEach(t => resCounts[r1.id][lvl][t] = (resCounts[r1.id][lvl][t] || 0) - 1);
                        typeFulfillment[a1]?.forEach(t => resCounts[r1.id][lvl][t] = (resCounts[r1.id][lvl][t] || 0) + 1);

                        typeFulfillment[a3]?.forEach(t => resCounts[r2.id][lvl][t] = (resCounts[r2.id][lvl][t] || 0) - 1);
                        typeFulfillment[a2]?.forEach(t => resCounts[r2.id][lvl][t] = (resCounts[r2.id][lvl][t] || 0) + 1);

                        typeFulfillment[a1]?.forEach(t => resCounts[r3.id][lvl][t] = (resCounts[r3.id][lvl][t] || 0) - 1);
                        typeFulfillment[a3]?.forEach(t => resCounts[r3.id][lvl][t] = (resCounts[r3.id][lvl][t] || 0) + 1);

                        currentSchedule[r1.id][wk].assignment = a1;
                        currentSchedule[r2.id][wk].assignment = a2;
                        currentSchedule[r3.id][wk].assignment = a3;
                    });
                }
            } else {
                // Single resident block swap
                const r = residents[Math.floor(rng.next() * residents.length)];
                const weeks = flexibleWeeks[r.id];
                if (weeks.length === 0) continue;

                let blockSize = 1;
                if (strategy === '4-block') {
                    blockSize = 4;
                } else if (strategy === '2-block') {
                    blockSize = 2;
                } else if (strategy === '1-block') {
                    blockSize = 1;
                } else {
                    const phase = step / maxSteps;
                    const rand = rng.next();
                    if (phase < 0.5) {
                        if (rand < 0.7) blockSize = 4; else if (rand < 0.9) blockSize = 2; else blockSize = 1;
                    } else if (phase < 0.8) {
                        if (rand < 0.3) blockSize = 4; else if (rand < 0.7) blockSize = 2; else blockSize = 1;
                    } else {
                        if (rand < 0.1) blockSize = 4; else if (rand < 0.4) blockSize = 2; else blockSize = 1;
                    }
                }

                const startIdx = Math.floor(rng.next() * weeks.length);
                const blockWeeks: number[] = [];
                for (let i = 0; i < blockSize; i++) {
                    const wIdx = startIdx + i;
                    if (wIdx < weeks.length) {
                        const w = weeks[wIdx];
                        if (i > 0 && w !== blockWeeks[i - 1] + 1) break;
                        if (isFlexible[r.id][w]) blockWeeks.push(w); else break;
                    }
                }
                if (blockWeeks.length === 0) continue;

                const firstW = blockWeeks[0];
                const level = getPgyAtWeek(r, firstW);
                const a2 = assignmentsByLevel[level][Math.floor(rng.next() * assignmentsByLevel[level].length)];

                const oldAssignments: AssignmentType[] = blockWeeks.map(w => currentSchedule[r.id]?.[w]?.assignment!);
                if (oldAssignments.every(a => a === a2)) continue;

                const oldWPs = blockWeeks.map(w => weekPenaltyCache[w]);
                const oldRP = resReqPenaltyCache[r.id];
                const affectedCycles = Array.from(new Set(blockWeeks.map(w => Math.floor(w / programData.cycleConfig.Z))));
                const oldCPs = affectedCycles.map(c => resContCache[r.id][c]);

                blockWeeks.forEach((w, i) => {
                    const a1 = oldAssignments[i];
                    const lvl = getPgyAtWeek(r, w);
                    if (lvl === 1) {
                        weekCounts[w].interns[a1] = (weekCounts[w].interns[a1] || 0) - 1;
                        weekCounts[w].interns[a2] = (weekCounts[w].interns[a2] || 0) + 1;
                    } else {
                        weekCounts[w].seniors[a1] = (weekCounts[w].seniors[a1] || 0) - 1;
                        weekCounts[w].seniors[a2] = (weekCounts[w].seniors[a2] || 0) + 1;
                    }
                    typeFulfillment[a1]?.forEach(t => resCounts[r.id][lvl][t] = (resCounts[r.id][lvl][t] || 0) - 1);
                    typeFulfillment[a2]?.forEach(t => resCounts[r.id][lvl][t] = (resCounts[r.id][lvl][t] || 0) + 1);
                    currentSchedule[r.id][w].assignment = a2;
                });

                const newWPs = blockWeeks.map(w => getWeekPenalty(w, weekCounts[w], currentSchedule).p);
                const { p: newRP } = getResPenalty(r.id, resCounts[r.id]);
                const newCPs = affectedCycles.map(c => getCycleCont(r.id, currentSchedule, c));

                const delta = (newWPs.reduce((a, b) => a + b, 0) + newRP + newCPs.reduce((a, b) => a + b, 0)) -
                    (oldWPs.reduce((a, b) => a + b, 0) + oldRP + oldCPs.reduce((a, b) => a + b, 0));

                if (delta <= 0 || Math.exp(-delta / (temp * 25000)) > rng.next()) {
                    currentPenalty += delta;
                    blockWeeks.forEach((w, i) => weekPenaltyCache[w] = newWPs[i]);
                    resReqPenaltyCache[r.id] = newRP;
                    affectedCycles.forEach((c, i) => {
                        const idx = affectedCycles.indexOf(c);
                        resContCache[r.id][c] = newCPs[idx];
                    });
                    if (currentPenalty < bestPenalty) {
                        bestPenalty = currentPenalty;
                        bestSchedule = JSON.parse(JSON.stringify(currentSchedule));
                    }
                    if (currentPenalty === 0) break;
                } else {
                    blockWeeks.forEach((w, i) => {
                        const a1 = oldAssignments[i];
                        const lvl = getPgyAtWeek(r, w);
                        if (lvl === 1) {
                            weekCounts[w].interns[a2] = (weekCounts[w].interns[a2] || 0) - 1;
                            weekCounts[w].interns[a1] = (weekCounts[w].interns[a1] || 0) + 1;
                        } else {
                            weekCounts[w].seniors[a2] = (weekCounts[w].seniors[a2] || 0) - 1;
                            weekCounts[w].seniors[a1] = (weekCounts[w].seniors[a1] || 0) + 1;
                        }
                        typeFulfillment[a2]?.forEach(t => resCounts[r.id][lvl][t] = (resCounts[r.id][lvl][t] || 0) - 1);
                        typeFulfillment[a1]?.forEach(t => resCounts[r.id][lvl][t] = (resCounts[r.id][lvl][t] || 0) + 1);
                        currentSchedule[r.id][w].assignment = a1;
                    });
                }
            }
            temp *= coolRate;
        }

        console.log(`[Healer End] final penalty: ${bestPenalty} (annealed: ${currentPenalty}), weekly penalty: ${weekPenaltyCache.reduce((sum, p) => sum + p, 0)}, req penalty: ${Object.values(resReqPenaltyCache).reduce((sum, p) => sum + p, 0)}`);
        return bestSchedule;
    }
}
