import { buildLevelRequirements } from './reqBuilder';
import { RequirementsEngine } from '../requirementsEngine';
import { Resident, ScheduleGrid, AssignmentType, ScheduleGenerator } from '../../types';
import type { ProgramData } from '../api/client';
import { TOTAL_WEEKS } from '../../constants';
import { getAllCodenames, isClinicRotation } from '../programDataUtils';

import { canFitBlock, placeBlock, getCumulativeRequirementCount, isAligned, getAssignedCount, getYearRequirementCount, getPriorRequirementCount, getStandardCohortMap, getCohortAtWeek } from './utils';


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
        const totalWeeks = Object.values(existingSchedule)[0]?.length || TOTAL_WEEKS;
        const numYears = Math.floor(totalWeeks / 52);


        const seededShuffle = <T>(array: T[]): T[] => {
            const newArray = [...array];
            for (let i = newArray.length - 1; i > 0; i--) {
                const j = Math.floor(rng.next() * (i + 1));
                [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
            }
            return newArray;
        };

        const newSchedule: ScheduleGrid = JSON.parse(JSON.stringify(existingSchedule));

        let validCohortAssignments: Record<string, number> | Record<number, Record<string, number>> = cohortAssignments || { ...(programData?.cycleConfig?.assignments || {}) };
        if (Object.keys(validCohortAssignments).length === 0) {
            validCohortAssignments = getStandardCohortMap(residents, programData);
        }

        const firstRes = residents.find(res => res.startYear && res.startYear > 0);
        const gridStartYear = firstRes ? (firstRes.startYear + Number(firstRes.level) - 1) : 2026;
        const getPgy = (res: Resident, week: number): number => {
            if (res.startYear && res.startYear > 0) {
                return Math.min(3, gridStartYear + Math.floor(week / 52) - res.startYear + 1);
            }
            return Math.min(3, (Number(res.level) || 1) + Math.floor(week / 52));
        };

        // 1. Initialize & Clinic Lock
        residents.forEach(r => {
            if (!newSchedule[r.id] || newSchedule[r.id].length !== totalWeeks) {
                newSchedule[r.id] = Array(totalWeeks).fill(null).map(() => ({ assignment: null, locked: false }));
            }
            
            // Respect active range
            const start = r.activeWeekStart ?? 0;
            const end = r.activeWeekEnd ?? totalWeeks;

            const row = newSchedule[r.id];
            for (let w = start; w < end; w++) {
                const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                const { Y, Z } = programData.cycleConfig;
                const isClinic = Math.floor((w % Z) / Y) === cohort;
                if (isClinic) {
                    if (row[w].locked) continue;
                    const weeklyClinicType = 'CLINIC';
                    newSchedule[r.id][w] = { assignment: weeklyClinicType, locked: true };
                }
            }
        });


        // 2. Education First Placement (Multi-Pass with Deficit-Priority)
        // Pass 1: Place hardest requirements first, sorted by difficulty
        // Pass 2: Re-attempt any remaining deficits with randomized order
        for (let pass = 0; pass < 2; pass++) {
            for (let yIdx = 0; yIdx < numYears; yIdx++) {
                const yearStart = yIdx * 52;
                const yearEnd = (yIdx + 1) * 52;

                const allLevels = [1, 2, 3];
                allLevels.forEach(level => {
                    let reqs = (buildLevelRequirements(programData, level as 1|2|3) || []).filter(r => !isClinicRotation(programData, r.type));

                    if (pass === 0) {
                        // Sort requirements by difficulty: higher min staffing and longer durations first,
                        // then by capacity (tighter maxima first). This is data-driven from programData.
                        reqs.sort((a, b) => {
                            const metaA = programData.rotations.get(a.type);
                            const metaB = programData.rotations.get(b.type);
                            
                            // More weeks required → harder to place → do first
                            if (a.minWeeks !== b.minWeeks) return b.minWeeks - a.minWeeks;

                            // Higher total staffing minimum → more constrained → do first
                            const staffA = (metaA?.minInterns || 0) + (metaA?.minSeniors || 0);
                            const staffB = (metaB?.minInterns || 0) + (metaB?.minSeniors || 0);
                            if (staffA !== staffB) return staffB - staffA;

                            // Longer duration → harder to fit → do first
                            const durA = metaA?.duration || 4;
                            const durB = metaB?.duration || 4;
                            if (durA !== durB) return durB - durA;
                            
                            // Tighter capacity → harder to fit → do first
                            const maxA = (level === 1 ? metaA?.maxInterns : metaA?.maxSeniors) || 99;
                            const maxB = (level === 1 ? metaB?.maxInterns : metaB?.maxSeniors) || 99;
                            return maxA - maxB;
                        });
                    } else {
                        reqs = seededShuffle(reqs);
                    }

                    reqs.forEach(req => {
                        const compatibleTypes = getAllCodenames(programData).filter(t => RequirementsEngine.fulfills(t, req.type, programData));
                        
                        // Sort eligible residents by deficit (largest deficit first) instead of
                        // cumulative count (least first). This ensures residents furthest from
                        // meeting their requirements get priority.
                        seededShuffle(residents.filter(r => {
                            const currentLevel = getPgy(r, yearStart);
                            const start = r.activeWeekStart ?? 0;
                            const end = r.activeWeekEnd ?? totalWeeks;
                            return currentLevel === level && start < yearEnd && end > yearStart;
                        })).sort((a, b) => {
                            const countA = getYearRequirementCount(newSchedule[a.id], req.type, yearStart, yearEnd, programData) + getPriorRequirementCount(priorRequirementCounts?.[a.id] || {}, req.type);
                            const countB = getYearRequirementCount(newSchedule[b.id], req.type, yearStart, yearEnd, programData) + getPriorRequirementCount(priorRequirementCounts?.[b.id] || {}, req.type);
                            const deficitA = req.minWeeks - countA;
                            const deficitB = req.minWeeks - countB;
                            return deficitB - deficitA; // Largest deficit first
                        }).forEach(res => {
                            const start = res.activeWeekStart ?? 0;
                            const end = res.activeWeekEnd ?? totalWeeks;
                            const rYearStart = Math.max(yearStart, start);
                            const rYearEnd = Math.min(yearEnd, end);

                            let safety = 0;
                            while (getYearRequirementCount(newSchedule[res.id], req.type, yearStart, yearEnd, programData) < req.minWeeks && safety < 100) {
                                safety++;
                                let bestW = -1, bestType = compatibleTypes[0], bestScore = Infinity;
                                const dur = (programData.rotations.get(req.type)?.duration || programData.cycleConfig.X);
                                
                                // Prefer block-aligned positions first for better packing
                                const blockAlignedWeeks: number[] = [];
                                const otherWeeks: number[] = [];
                                for (let i = 0; i <= Math.max(0, rYearEnd - rYearStart - dur); i++) {
                                    const w = rYearStart + i;
                                    const cohort = getCohortAtWeek(res, w, validCohortAssignments);
                                    if (isAligned(w, cohort, dur, programData)) {
                                        blockAlignedWeeks.push(w);
                                    } else {
                                        otherWeeks.push(w);
                                    }
                                }
                                const possibleWeeks = [...seededShuffle(blockAlignedWeeks), ...seededShuffle(otherWeeks)];


                                for (const w of possibleWeeks) {
                                    const cohort = getCohortAtWeek(res, w, validCohortAssignments);
                                    if (!isAligned(w, cohort, dur, programData)) continue;
                                    if (!canFitBlock(newSchedule, res.id, w, dur)) continue;

                                    // Try all compatible types for this week
                                    for (const type of compatibleTypes) {
                                        const meta = programData.rotations.get(type);
                                        let score = 0;
                                        let possible = true;

                                        for (let i = 0; i < dur; i++) {
                                            const currentLevel = getPgy(res, w + i);
                                            const cI = getAssignedCount(newSchedule, residents, w + i, type, 1);
                                            const cS = getAssignedCount(newSchedule, residents, w + i, type, 2);

                                            const maxI = meta?.maxInterns || 99;
                                            const maxS = meta?.maxSeniors || 99;

                                            if (currentLevel === 1 && cI >= maxI) { possible = false; break; }
                                            if (currentLevel > 1 && cS >= maxS) { possible = false; break; }
                                            
                                            // Spreading score: prefer weeks with less staff (with random tiebreaker)
                                            score += (cI + cS) + rng.next() * 0.1;
                                        }

                                        if (possible && score < bestScore) {
                                            bestScore = score;
                                            bestW = w;
                                            bestType = type;
                                        }
                                    }
                                    // Early exit if we found a zero-conflict slot
                                    if (bestScore < 0.2) break;
                                }

                                if (bestW === -1) break; // Cannot fit anymore
                                placeBlock(newSchedule, res.id, bestW, dur, bestType);
                            }
                        });
                    });
                });
            }
        }

        // 3. Staffing Sweep (Foundation) - Mandatory Minima
        // Dynamically determine which rotations have staffing floors from programData
        // instead of using hardcoded codename lists.
        const staffingTypes: string[] = [];
        for (const [codename, config] of programData.rotations.entries()) {
            if (isClinicRotation(programData, codename)) continue;
            if ((config.minInterns && config.minInterns > 0) || (config.minSeniors && config.minSeniors > 0)) {
                staffingTypes.push(codename);
            }
        }
        // Sort by total minimum staffing descending (hardest to fill first)
        staffingTypes.sort((a, b) => {
            const metaA = programData.rotations.get(a)!;
            const metaB = programData.rotations.get(b)!;
            const totalA = (metaA.minInterns || 0) + (metaA.minSeniors || 0);
            const totalB = (metaB.minInterns || 0) + (metaB.minSeniors || 0);
            return totalB - totalA;
        });

        for (let w = 0; w < totalWeeks; w++) {
            staffingTypes.forEach(type => {
                const meta = programData.rotations.get(type);
                if (!meta) return;
                const dur = meta.duration || programData.cycleConfig.X;

                // Interns
                let safetyI = 0;
                while (getAssignedCount(newSchedule, residents, w, type, 1) < (meta.minInterns || 0) && safetyI < 10) {
                    safetyI++;
                    const pool = seededShuffle(residents.filter(r => {
                        const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                        const currentLevel = getPgy(r, w);
                        const start = r.activeWeekStart ?? 0;
                        const end = r.activeWeekEnd ?? totalWeeks;

                        return currentLevel === 1 && 
                               w >= start && w + dur <= end &&
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur, programData) &&
                               getAssignedCount(newSchedule, residents, w, type, 1) < (meta.maxInterns || 99);
                    })).sort((a, b) => (getYearRequirementCount(newSchedule[a.id], type, 0, w, programData) + getPriorRequirementCount(priorRequirementCounts?.[a.id] || {}, type)) - 
                                     (getYearRequirementCount(newSchedule[b.id], type, 0, w, programData) + getPriorRequirementCount(priorRequirementCounts?.[b.id] || {}, type)));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                }

                // Seniors
                let safetyS = 0;
                while (getAssignedCount(newSchedule, residents, w, type, 2) < (meta.minSeniors || 0) && safetyS < 10) {
                    safetyS++;
                    const pool = seededShuffle(residents.filter(r => {
                        const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                        const currentLevel = getPgy(r, w);
                        const start = r.activeWeekStart ?? 0;
                        const end = r.activeWeekEnd ?? totalWeeks;

                        return currentLevel >= 2 && 
                               w >= start && w + dur <= end &&
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur, programData) &&
                               getAssignedCount(newSchedule, residents, w, type, 2) < (meta.maxSeniors || 99);
                    })).sort((a, b) => (getYearRequirementCount(newSchedule[a.id], type, 0, w, programData) + getPriorRequirementCount(priorRequirementCounts?.[a.id] || {}, type)) - 
                                     (getYearRequirementCount(newSchedule[b.id], type, 0, w, programData) + getPriorRequirementCount(priorRequirementCounts?.[b.id] || {}, type)));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                }
            });
        }

        // 4. Final Elective Fill
        residents.forEach(r => {
            const start = r.activeWeekStart ?? 0;
            const end = r.activeWeekEnd ?? totalWeeks;
            for (let w = start; w < end; w++) {
                if (!newSchedule[r.id][w]?.assignment) {
                    newSchedule[r.id][w] = { assignment: 'ELEC', locked: false };
                }
            }
        });

        return newSchedule;
    }
};
