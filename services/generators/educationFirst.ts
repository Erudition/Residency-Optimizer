import { buildLevelRequirements } from './reqBuilder';
import { RequirementsEngine } from '../requirementsEngine';
import { Resident, ScheduleGrid, AssignmentType, ScheduleGenerator, ScheduleCell } from '../../types';
import type { ProgramData } from '../api/client';
import { TOTAL_WEEKS, CANDIDATE_START_YEAR } from '../../constants';
import { getAllCodenames, isClinicRotation, getClinicCodenames } from '../programDataUtils';

import { canFitBlock, placeBlock, getYearRequirementCount, getPriorRequirementCount, isAligned, getAssignedCount, getCohortAtWeek, getStandardCohortMap, getCappedDuration } from './utils';


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

export const EducationFirstGenerator: ScheduleGenerator = {
    name: "Strict (Education First)",
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, programData: ProgramData, attemptIndex: number = 0, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number> | Record<number, Record<string, number>>): ScheduleGrid => {
        const rng = new SeededRNG(42 + attemptIndex);

        const existingRows = Object.values(existingSchedule);
        const totalWeeks = existingRows.length > 0 ? existingRows[0].length : TOTAL_WEEKS;

        const seededShuffle = <T>(array: T[]): T[] => {
            const newArray = [...array];
            for (let i = newArray.length - 1; i > 0; i--) {
                const j = Math.floor(rng.next() * (i + 1));
                [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
            }
            return newArray;
        };

        const newSchedule: ScheduleGrid = JSON.parse(JSON.stringify(existingSchedule));

        const firstRes = residents.find(res => res.startYear && res.startYear > 0);
        const gridStartYear = firstRes ? (firstRes.startYear + Number(firstRes.level) - 1) : CANDIDATE_START_YEAR;
        const getPgy = (res: Resident, week: number): number => {
            if (res.startYear && res.startYear > 0) {
                return Math.min(3, gridStartYear + Math.floor(week / 52) - res.startYear + 1);
            }
            return Math.min(3, (Number(res.level) || 1) + Math.floor(week / 52));
        };
        const isActive = (r: Resident, week: number, duration: number = 1) => {
            const start = r.activeWeekStart ?? 0;
            const end = r.activeWeekEnd ?? Infinity;
            return week >= start && week + duration <= end;
        };

        residents.forEach(r => {
            if (!newSchedule[r.id]) {
                newSchedule[r.id] = Array(totalWeeks).fill(null).map(() => ({ assignment: null, locked: false }));
            } else if (newSchedule[r.id].length < totalWeeks) {
                const currentLen = newSchedule[r.id].length;
                const padding: ScheduleCell[] = Array(totalWeeks - currentLen).fill(null).map(() => ({ assignment: null, locked: false }));
                newSchedule[r.id] = [...newSchedule[r.id], ...padding];
            }
        });

        let validCohortAssignments: Record<string, number> | Record<number, Record<string, number>> = cohortAssignments || { ...(programData?.cycleConfig?.assignments || {}) };
        if (Object.keys(validCohortAssignments).length === 0) {
            validCohortAssignments = getStandardCohortMap(residents, programData);
        }

        // 1. Initialize & Clinic Lock
        residents.forEach(r => {
            const row = newSchedule[r.id];
            for (let w = 0; w < totalWeeks; w++) {
                if (!isActive(r, w)) {
                    if (!row[w].locked) {
                        newSchedule[r.id][w] = { assignment: null, locked: true };
                    }
                    continue;
                }
                const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                const { Y, Z } = programData.cycleConfig;
                const isClinic = Math.floor((w % Z) / Y) === cohort;
                if (isClinic) {
                    if (row[w].locked) continue;
                    const defaultClinicRotation = getClinicCodenames(programData)[0] || 'CLINIC';
                    const weeklyClinicType = (programData.cycleConfig as any).clinicAssignments?.[r.id] || defaultClinicRotation;
                    newSchedule[r.id][w] = { assignment: weeklyClinicType, locked: true };
                }
            }
        });

        const historicalCounts = priorRequirementCounts || {};

        // 2. Staffing Sweep (identical to StaffingFirst — guarantees 0 staffing violations)
        const staffingTypes: string[] = [];
        for (const [codename, config] of programData.rotations.entries()) {
            if (isClinicRotation(programData, codename)) continue;
            if ((config.minInterns && config.minInterns > 0) || (config.minSeniors && config.minSeniors > 0)) {
                staffingTypes.push(codename);
            }
        }
        staffingTypes.sort((a, b) => {
            const metaA = programData.rotations.get(a)!;
            const metaB = programData.rotations.get(b)!;
            return ((metaB.minInterns || 0) + (metaB.minSeniors || 0)) - ((metaA.minInterns || 0) + (metaA.minSeniors || 0));
        });

        for (let w = 0; w < totalWeeks; w++) {
            staffingTypes.forEach(type => {
                const meta = programData.rotations.get(type);
                if (!meta) return;
                const dur = meta.duration || programData.cycleConfig.X;

                let safetyI = 0;
                while (getAssignedCount(newSchedule, residents, w, type, 1) < (meta.minInterns || 0) && safetyI < 10) {
                    safetyI++;
                    const pool = seededShuffle(residents.map(r => {
                        const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                        const residentDur = getCappedDuration(w, cohort, dur, totalWeeks, programData);
                        return { r, cohort, residentDur };
                    }).filter(({ r, cohort, residentDur }) => {
                        const currentPgy = getPgy(r, w);
                        return residentDur > 0 &&
                               isActive(r, w, residentDur) &&
                               currentPgy === 1 && 
                               canFitBlock(newSchedule, r.id, w, residentDur) && 
                               isAligned(w, cohort, residentDur, programData) &&
                               getAssignedCount(newSchedule, residents, w, type, 1) < (meta.maxInterns || 99);
                    })).sort((a, b) => {
                        const needA = getYearRequirementCount(newSchedule[a.r.id], type, 0, totalWeeks, programData) + getPriorRequirementCount(historicalCounts[a.r.id] || {}, type);
                        const needB = getYearRequirementCount(newSchedule[b.r.id], type, 0, totalWeeks, programData) + getPriorRequirementCount(historicalCounts[b.r.id] || {}, type);
                        return needA - needB;
                    });
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].r.id, w, pool[0].residentDur, type);
                }

                let safetyS = 0;
                while (getAssignedCount(newSchedule, residents, w, type, 2) < (meta.minSeniors || 0) && safetyS < 10) {
                    safetyS++;
                    const pool = seededShuffle(residents.map(r => {
                        const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                        const residentDur = getCappedDuration(w, cohort, dur, totalWeeks, programData);
                        return { r, cohort, residentDur };
                    }).filter(({ r, cohort, residentDur }) => {
                        const currentPgy = getPgy(r, w);
                        return residentDur > 0 &&
                               isActive(r, w, residentDur) &&
                               currentPgy >= 2 && 
                               canFitBlock(newSchedule, r.id, w, residentDur) && 
                               isAligned(w, cohort, residentDur, programData) &&
                               getAssignedCount(newSchedule, residents, w, type, 2) < (meta.maxSeniors || 99);
                    })).sort((a, b) => {
                        const needA = getYearRequirementCount(newSchedule[a.r.id], type, 0, totalWeeks, programData) + getPriorRequirementCount(historicalCounts[a.r.id] || {}, type);
                        const needB = getYearRequirementCount(newSchedule[b.r.id], type, 0, totalWeeks, programData) + getPriorRequirementCount(historicalCounts[b.r.id] || {}, type);
                        return needA - needB;
                    });
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].r.id, w, pool[0].residentDur, type);
                }
            });
        }

        // 3. Education Placement (aggressive, multi-pass)
        // Now that staffing is guaranteed, aggressively fill remaining slots
        // with educational requirements. This uses two passes plus a third
        // swap pass that can replace blocks placed during staffing if a
        // different rotation serves both staffing AND an unmet education need.
        const yearCount = Math.ceil(totalWeeks / 52);
        
        for (let pass = 0; pass < 3; pass++) {
            for (let yearIdx = 0; yearIdx < yearCount; yearIdx++) {
                const yearStart = yearIdx * 52;
                const yearEnd = Math.min(yearStart + 52, totalWeeks);

                const pgyLevels: (1|2|3)[] = [1, 2, 3];
                pgyLevels.forEach(level => {
                    let reqs = (buildLevelRequirements(programData, level) || []).filter(r => !isClinicRotation(programData, r.type));
                    
                    if (pass < 2) {
                        if (pass === 0) {
                            // First pass: hardest requirements first
                            reqs.sort((a, b) => {
                                if (a.minWeeks !== b.minWeeks) return b.minWeeks - a.minWeeks;
                                const metaA = programData.rotations.get(a.type);
                                const metaB = programData.rotations.get(b.type);
                                const staffA = (metaA?.minInterns || 0) + (metaA?.minSeniors || 0);
                                const staffB = (metaB?.minInterns || 0) + (metaB?.minSeniors || 0);
                                if (staffA !== staffB) return staffB - staffA;
                                const maxA = (level === 1 ? metaA?.maxInterns : metaA?.maxSeniors) || 99;
                                const maxB = (level === 1 ? metaB?.maxInterns : metaB?.maxSeniors) || 99;
                                return maxA - maxB;
                            });
                        } else {
                            reqs = seededShuffle(reqs);
                        }

                        // Standard placement into empty slots
                        reqs.forEach(req => {
                            const compatibleTypes = getAllCodenames(programData).filter(t => RequirementsEngine.fulfills(t, req.type, programData));
                            
                            const eligibleResidents = seededShuffle(residents.filter(r => {
                                return isActive(r, yearStart) && getPgy(r, yearStart) === level;
                            })).sort((a, b) => {
                                const deficitA = req.minWeeks - (getYearRequirementCount(newSchedule[a.id], req.type, yearStart, yearEnd, programData) + getPriorRequirementCount(historicalCounts[a.id] || {}, req.type));
                                const deficitB = req.minWeeks - (getYearRequirementCount(newSchedule[b.id], req.type, yearStart, yearEnd, programData) + getPriorRequirementCount(historicalCounts[b.id] || {}, req.type));
                                return deficitB - deficitA;
                            });

                            eligibleResidents.forEach(res => {
                                const dur = (programData.rotations.get(req.type)?.duration || programData.cycleConfig.X);

                                let safety = 0;
                                while (getYearRequirementCount(newSchedule[res.id], req.type, yearStart, yearEnd, programData) < req.minWeeks && safety < 100) {
                                    safety++;
                                    let bestW = -1, bestType = compatibleTypes[0], bestScore = Infinity, bestDur = dur;

                                    const blockAlignedWeeks: {w: number, currentDur: number}[] = [];
                                    const otherWeeks: {w: number, currentDur: number}[] = [];
                                    for (let i = 0; i <= yearEnd - yearStart - 1; i++) {
                                        const w = yearStart + i;
                                        const cohort = getCohortAtWeek(res, w, validCohortAssignments);
                                        const currentDur = getCappedDuration(w, cohort, dur, totalWeeks, programData);
                                        if (currentDur <= 0 || w + currentDur > yearEnd) continue;
                                        if (isAligned(w, cohort, currentDur, programData)) {
                                            blockAlignedWeeks.push({w, currentDur});
                                        } else {
                                            otherWeeks.push({w, currentDur});
                                        }
                                    }
                                    const possibleWeeks = [...seededShuffle(blockAlignedWeeks), ...seededShuffle(otherWeeks)];

                                    for (const {w, currentDur} of possibleWeeks) {
                                        const cohort = getCohortAtWeek(res, w, validCohortAssignments);
                                        if (!isAligned(w, cohort, currentDur, programData)) continue;
                                        if (!canFitBlock(newSchedule, res.id, w, currentDur)) continue;
                                        if (!isActive(res, w, currentDur)) continue;

                                        for (const type of compatibleTypes) {
                                            const meta = programData.rotations.get(type);
                                            let score = 0;
                                            let possible = true;

                                            for (let i = 0; i < currentDur; i++) {
                                                const currentLevel = getPgy(res, w + i);
                                                const cI = getAssignedCount(newSchedule, residents, w + i, type, 1);
                                                const cS = getAssignedCount(newSchedule, residents, w + i, type, 2);
                                                const maxI = meta?.maxInterns || 99;
                                                const maxS = meta?.maxSeniors || 99;
                                                if (currentLevel === 1 && cI >= maxI) { possible = false; break; }
                                                if (currentLevel >= 2 && cS >= maxS) { possible = false; break; }
                                                score += (cI + cS) + rng.next() * 0.1;
                                            }

                                            if (possible && score < bestScore) {
                                                bestScore = score;
                                                bestW = w;
                                                bestType = type;
                                                bestDur = currentDur;
                                            }
                                        }
                                        if (bestScore < 0.2) break;
                                    }

                                    if (bestW === -1) break;
                                    placeBlock(newSchedule, res.id, bestW, bestDur, bestType);
                                }
                            });
                        });
                    } else {
                        // Pass 3: Education swap pass — look for staffing-placed blocks
                        // where the resident is on rotation X but needs rotation Y.
                        // If swapping X→Y still satisfies staffing minimums, do it.
                        reqs.forEach(req => {
                            const compatibleTypes = getAllCodenames(programData).filter(t => RequirementsEngine.fulfills(t, req.type, programData));

                            const eligibleResidents = residents.filter(r => {
                                return isActive(r, yearStart) && getPgy(r, yearStart) === level;
                            }).filter(res => {
                                const count = getYearRequirementCount(newSchedule[res.id], req.type, yearStart, yearEnd, programData) + getPriorRequirementCount(historicalCounts[res.id] || {}, req.type);
                                return count < req.minWeeks;
                            });

                            eligibleResidents.forEach(res => {
                                const dur = (programData.rotations.get(req.type)?.duration || programData.cycleConfig.X);

                                // Find blocks this resident is on that DON'T serve any of
                                // their educational needs — candidates for swapping
                                for (let w = yearStart; w < yearEnd; w++) {
                                    if (getYearRequirementCount(newSchedule[res.id], req.type, yearStart, yearEnd, programData) >= req.minWeeks) break;

                                    const cell = newSchedule[res.id][w];
                                    if (!cell || !cell.assignment || cell.locked) continue;
                                    
                                    const currentType = cell.assignment;
                                    // Don't swap clinic rotations
                                    if (isClinicRotation(programData, currentType)) continue;

                                    // Check if the current assignment fulfills this requirement
                                    if (RequirementsEngine.fulfills(currentType, req.type, programData)) continue;

                                    // Find the block extent
                                    let blockEnd = w + 1;
                                    while (blockEnd < yearEnd && newSchedule[res.id][blockEnd]?.assignment === currentType && !newSchedule[res.id][blockEnd]?.locked) {
                                        blockEnd++;
                                    }
                                    const blockLen = blockEnd - w;
                                    
                                    // Only consider full aligned blocks
                                    const cohort = getCohortAtWeek(res, w, validCohortAssignments);
                                    if (!isAligned(w, cohort, blockLen, programData)) continue;

                                    // Try swapping to a compatible type that meets the education need
                                    for (const newType of compatibleTypes) {
                                        const newMeta = programData.rotations.get(newType);
                                        const newDur = newMeta?.duration || programData.cycleConfig.X;
                                        if (newDur !== blockLen) continue; // Must be same length

                                        let canSwap = true;
                                        for (let i = 0; i < blockLen; i++) {
                                            const wk = w + i;
                                            const currentLevel = getPgy(res, wk);
                                            
                                            // Check new type max capacity
                                            const cI = getAssignedCount(newSchedule, residents, wk, newType, 1);
                                            const cS = getAssignedCount(newSchedule, residents, wk, newType, 2);
                                            const maxI = newMeta?.maxInterns || 99;
                                            const maxS = newMeta?.maxSeniors || 99;
                                            if (currentLevel === 1 && cI >= maxI) { canSwap = false; break; }
                                            if (currentLevel >= 2 && cS >= maxS) { canSwap = false; break; }

                                            // Check old type staffing: would removing this resident
                                            // drop below the staffing minimum?
                                            const oldMeta = programData.rotations.get(currentType);
                                            if (oldMeta) {
                                                if (currentLevel === 1 && oldMeta.minInterns) {
                                                    const afterRemoval = getAssignedCount(newSchedule, residents, wk, currentType, 1) - 1;
                                                    if (afterRemoval < oldMeta.minInterns) { canSwap = false; break; }
                                                }
                                                if (currentLevel >= 2 && oldMeta.minSeniors) {
                                                    const afterRemoval = getAssignedCount(newSchedule, residents, wk, currentType, 2) - 1;
                                                    if (afterRemoval < oldMeta.minSeniors) { canSwap = false; break; }
                                                }
                                            }
                                        }

                                        if (canSwap) {
                                            // Perform the swap
                                            for (let i = 0; i < blockLen; i++) {
                                                newSchedule[res.id][w + i] = { assignment: newType, locked: false };
                                            }
                                            break; // Move to next week
                                        }
                                    }
                                    // Skip to end of block
                                    w = blockEnd - 1;
                                }
                            });
                        });
                    }
                });
            }
        }

        // 4. Final Elective Fill
        residents.forEach(r => {
            const row = newSchedule[r.id];
            for (let w = 0; w < row.length; w++) {
                if (row[w].locked) continue;
                if (isActive(r, w) && !row[w].assignment) {
                    newSchedule[r.id][w] = { assignment: 'ELEC', locked: false };
                }
            }
        });

        return newSchedule;
    }
};
