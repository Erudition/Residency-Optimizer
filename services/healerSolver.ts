import { Resident, ScheduleGrid, AssignmentType } from '../types';
import { RequirementsEngine } from './requirementsEngine';
import { ProgramData } from './api/client';
import { ACTIVE_START_YEAR } from '../constants';
import { getAllCodenames, isClinicRotation } from './programDataUtils';
import { getStandardCohortMap, getCohortAtWeek } from './generators/utils';
import { buildLevelRequirements } from './generators/reqBuilder';
import { StaffingFirstGenerator } from './generators/staffingFirst';

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
        priorRequirementCounts?: Record<string, Record<string, number>>,
        cohortAssignments?: Record<string, number>,
        onProgress?: (step: number, maxSteps: number, currentPenalty: number) => void
    ) => Promise<ScheduleGrid>;
}

export const healer: HealerSolver = {
    name: "Annealing Healer Solver",
    solve: async (residents: Resident[], existingSchedule: ScheduleGrid, programData: ProgramData, attemptIndex: number = 0, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number>, onProgress?: (step: number, maxSteps: number, currentPenalty: number) => void): Promise<ScheduleGrid> => {
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
        const superCriticalTypes = [
            'ICU', 'W-RED', 'W-BLUE',
            'NF', 'EM', 'W-MET'
        ];

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
            const m = programData.rotations.get(type); if (!m) return 0; let c = 0;
            if (interns < m.minInterns) c += (m.minInterns - interns) * W_STAFFING;
            if (interns > m.maxInterns) c += (interns - m.maxInterns) * W_STAFFING;
            if (seniors < m.minSeniors) c += (m.minSeniors - seniors) * W_STAFFING;
            if (seniors > m.maxSeniors) c += (seniors - m.maxSeniors) * W_STAFFING;
            return c;
        };

        const flexibleAssigns = Array.from(programData.flexibleCodenames);
        const getWeekPenalty = (w: number, wc: any, sched: ScheduleGrid): number => {
            let total = 0; 
            constrainedTypes.forEach(t => total += getTypeStaffingPenalty(t, wc.interns[t] || 0, wc.seniors[t] || 0));
            
            let pgy2Flexible = 0, pgy3Flexible = 0;
            residents.forEach(r => {
                const pgy = getPgyAtWeek(r, w);
                const a = sched[r.id]?.[w]?.assignment;
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
            const startLvl = getPgyAtWeek(r, 0);
            const activeLevels = new Set<number>();
            for (let w = 0; w < totalWeeks; w++) activeLevels.add(getPgyAtWeek(r, w));
            let p = 0;
            activeLevels.forEach(lvl => {
                (buildLevelRequirements(programData, lvl) || []).forEach(req => {
                    if (req.source === 'ACGME') {
                        let cumulativeRequired = 0;
                        for (let l = 1; l <= lvl; l++) {
                            const levelReqs = buildLevelRequirements(programData, l) || [];
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
            const start = cycle * programData.cycleConfig.Z;
            let lastA: string | null = null, changes = 0;
            for (let i = 0; i < programData.cycleConfig.Z; i++) {
                const w = start + i;
                if (w >= totalWeeks) continue;
                const a = sched[rId]?.[w]?.assignment;
                if (a && a !== lastA) { changes++; lastA = a; }
            }
            return changes * W_CONTINUITY;
        };

        const currentSchedule: ScheduleGrid = JSON.parse(JSON.stringify(existingSchedule));
        residents.forEach(r => {
            if (!currentSchedule[r.id]) {
                currentSchedule[r.id] = Array.from({ length: totalWeeks }, () => ({ assignment: null as any, locked: false }));
            }
            for (let w = 0; w < totalWeeks; w++) {
                if (!currentSchedule[r.id][w] || currentSchedule[r.id][w].assignment === null) {
                    const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                    const { Y, Z } = programData.cycleConfig;
                    const isClinic = Math.floor((w % Z) / Y) === cohort;
                    if (isClinic) {
                        const clinicType = 'CLINIC';
                        currentSchedule[r.id][w] = { assignment: clinicType, locked: true };
                    } else {
                        currentSchedule[r.id][w] = { assignment: 'ELEC', locked: false };
                    }
                }
            }
        });
        const weekCounts: any[] = Array.from({ length: totalWeeks }, () => ({ interns: {}, seniors: {} }));
        const resCounts: Record<string, Record<number, Record<string, number>>> = {};
        const resContCache: Record<string, number[]> = {};

        const syncState = () => {
            residents.forEach(r => {
                resCounts[r.id] = { 1: {}, 2: {}, 3: {} };
                resContCache[r.id] = Array(TOTAL_CYCLES).fill(0);
                for (let w = 0; w < totalWeeks; w++) {
                    const a = currentSchedule[r.id]?.[w]?.assignment;
                    if (a) {
                        const level = getPgyAtWeek(r, w);
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

        if (currentPenalty === 0) {
            if (onProgress) onProgress(200000, 200000, currentPenalty);
            return currentSchedule;
        }

        const maxSteps = 200000;
        let temp = 1.0;
        const coolRate = 0.99998;

        for (let step = 0; step < maxSteps; step++) {
            if (step % 2000 === 0) {
                if (typeof (globalThis as any).checkInterrupt !== 'undefined' && (globalThis as any).checkInterrupt()) break;
                const reqV = Object.values(resReqPenaltyCache).reduce((sum, p) => sum + Math.floor(p / W_REQUIREMENT), 0);
                const staffV = weekPenaltyCache.reduce((sum, p) => sum + Math.floor(p / W_STAFFING), 0);
                if (onProgress) onProgress(step, maxSteps, reqV + staffV);
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            if (step % 50000 === 0) {
                const staffV = weekPenaltyCache.reduce((sum, p) => sum + Math.floor(p / W_STAFFING), 0);
                const jeopardyV = weekPenaltyCache.reduce((sum, p) => sum + (Math.floor(p % W_STAFFING) / W_JEOPARDY), 0);
                const reqV = Object.values(resReqPenaltyCache).reduce((sum, p) => sum + Math.floor(p / W_REQUIREMENT), 0);
                console.log(`[Healer Step ${step}] Penalty: ${currentPenalty.toLocaleString()} | Staffing: ${staffV} | Jeopardy: ${jeopardyV} | Req: ${reqV} | Temp: ${temp.toFixed(4)}`);
            }

            const r = residents[Math.floor(rng.next() * residents.length)];
            const weeks = flexibleWeeks[r.id];
            if (weeks.length === 0) continue;

            const phase = step / maxSteps;
            let blockSize = 1;
            const rand = rng.next();
            if (phase < 0.5) {
                if (rand < 0.7) blockSize = 4; else if (rand < 0.9) blockSize = 2; else blockSize = 1;
            } else if (phase < 0.8) {
                if (rand < 0.3) blockSize = 4; else if (rand < 0.7) blockSize = 2; else blockSize = 1;
            } else {
                if (rand < 0.1) blockSize = 4; else if (rand < 0.4) blockSize = 2; else blockSize = 1;
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

            const newWPs = blockWeeks.map(w => getWeekPenalty(w, weekCounts[w], currentSchedule));
            const newRP = getResPenalty(r.id, resCounts[r.id]);
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
            temp *= coolRate;
        }

        console.log(`[Healer End] final penalty: ${bestPenalty} (annealed: ${currentPenalty}), weekly penalty: ${weekPenaltyCache.reduce((sum, p) => sum + p, 0)}, req penalty: ${Object.values(resReqPenaltyCache).reduce((sum, p) => sum + p, 0)}`);
        return bestSchedule;
    }
}
