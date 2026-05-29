import { buildLevelRequirements } from './reqBuilder';
import { RequirementsEngine } from '../requirementsEngine';
import { Resident, ScheduleGrid, AssignmentType, ScheduleGenerator, ScheduleCell } from '../../types';
import type { ProgramData } from '../api/client';
import { TOTAL_WEEKS, CANDIDATE_START_YEAR } from '../../constants';
import { getAllCodenames, isClinicRotation } from '../programDataUtils';

import { canFitBlock, placeBlock, getYearRequirementCount, getPriorRequirementCount, isAligned, getAssignedCount, getCohortAtWeek, getStandardCohortMap } from './utils';


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

export const StaffingFirstGenerator: ScheduleGenerator = {
    name: "Staffing First",
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, programData: ProgramData, attemptIndex: number = 0, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number> | Record<number, Record<string, number>>): ScheduleGrid => {
        const rng = new SeededRNG(42 + attemptIndex);

        // Determine total weeks from existing schedule or default
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

        // Ensure all residents have rows and helper functions for PGY calculation
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

        let validCohortAssignments: Record<string, number> | Record<number, Record<string, number>> = cohortAssignments || programData?.cycleConfig?.assignments;
        if (!validCohortAssignments || Object.keys(validCohortAssignments).length === 0) {
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
                    const clinicType = 'CLINIC';
                    newSchedule[r.id][w] = { assignment: clinicType, locked: true };

                }
            }
        });


        // 2. Staffing Sweep FIRST (Foundation) - Mandatory Minima
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

        const historicalCounts = priorRequirementCounts || {};

        // Staffing sweep: iterate by block-aligned start positions to avoid
        // redundant checks on weeks mid-block.
        staffingTypes.forEach(type => {
            const meta = programData.rotations.get(type);
            if (!meta) return;
            const dur = meta.duration || programData.cycleConfig.X;

            // Iterate by block-aligned positions instead of every single week.
            // For 4-week rotations, check at weeks 0, 4, 8, ... etc.
            // But also check every week for short-duration rotations (dur=1 or 2).
            const step = dur >= 4 ? dur : 1;

            for (let w = 0; w < totalWeeks; w += step) {
                // Interns
                let safetyI = 0;
                while (getAssignedCount(newSchedule, residents, w, type, 1) < (meta.minInterns || 0) && safetyI < 10) {
                    safetyI++;
                    const pool = seededShuffle(residents.filter(r => {
                        const currentPgy = getPgy(r, w);
                        const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                        return isActive(r, w, dur) &&
                               currentPgy === 1 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur, programData) &&
                               getAssignedCount(newSchedule, residents, w, type, 1) < (meta.maxInterns || 99);
                    })).sort((a, b) => {
                        // Prefer residents who need this rotation for education too
                        const needA = getYearRequirementCount(newSchedule[a.id], type, 0, totalWeeks, programData) + getPriorRequirementCount(historicalCounts[a.id] || {}, type);
                        const needB = getYearRequirementCount(newSchedule[b.id], type, 0, totalWeeks, programData) + getPriorRequirementCount(historicalCounts[b.id] || {}, type);
                        return needA - needB;
                    });
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                }

                // Seniors
                let safetyS = 0;
                while (getAssignedCount(newSchedule, residents, w, type, 2) < (meta.minSeniors || 0) && safetyS < 10) {
                    safetyS++;
                    const pool = seededShuffle(residents.filter(r => {
                        const currentPgy = getPgy(r, w);
                        const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                        return isActive(r, w, dur) &&
                               currentPgy >= 2 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur, programData) &&
                               getAssignedCount(newSchedule, residents, w, type, 2) < (meta.maxSeniors || 99);
                    })).sort((a, b) => {
                        const needA = getYearRequirementCount(newSchedule[a.id], type, 0, totalWeeks, programData) + getPriorRequirementCount(historicalCounts[a.id] || {}, type);
                        const needB = getYearRequirementCount(newSchedule[b.id], type, 0, totalWeeks, programData) + getPriorRequirementCount(historicalCounts[b.id] || {}, type);
                        return needA - needB;
                    });
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                }
            }
        });


        // 3. Education Placement SECOND (Segmented by Year)
        // Two-pass approach: first pass places highest-priority (hardest-to-fill) requirements,
        // second pass fills remaining gaps with a more relaxed search.
        const yearCount = Math.ceil(totalWeeks / 52);
        
        for (let pass = 0; pass < 2; pass++) {
            for (let yearIdx = 0; yearIdx < yearCount; yearIdx++) {
                const yearStart = yearIdx * 52;
                const yearEnd = Math.min(yearStart + 52, totalWeeks);

                const pgyLevels: (1|2|3)[] = [1, 2, 3];
                pgyLevels.forEach(level => {
                    let reqs = (buildLevelRequirements(programData, level) || []).filter(r => !isClinicRotation(programData, r.type));
                    
                    // On first pass, sort by difficulty (hardest first).
                    // On second pass, shuffle to explore different orderings.
                    if (pass === 0) {
                        reqs.sort((a, b) => {
                            // More weeks required → harder → do first
                            if (a.minWeeks !== b.minWeeks) return b.minWeeks - a.minWeeks;
                            // Higher staffing minimums → harder → do first
                            const metaA = programData.rotations.get(a.type);
                            const metaB = programData.rotations.get(b.type);
                            const staffA = (metaA?.minInterns || 0) + (metaA?.minSeniors || 0);
                            const staffB = (metaB?.minInterns || 0) + (metaB?.minSeniors || 0);
                            if (staffA !== staffB) return staffB - staffA;
                            // Tighter capacity → harder → do first
                            const maxA = (level === 1 ? metaA?.maxInterns : metaA?.maxSeniors) || 99;
                            const maxB = (level === 1 ? metaB?.maxInterns : metaB?.maxSeniors) || 99;
                            return maxA - maxB;
                        });
                    } else {
                        reqs = seededShuffle(reqs);
                    }

                    reqs.forEach(req => {
                        const compatibleTypes = getAllCodenames(programData).filter(t => RequirementsEngine.fulfills(t, req.type, programData));
                        
                        const eligibleResidents = seededShuffle(residents.filter(r => {
                            return isActive(r, yearStart) && getPgy(r, yearStart) === level;
                        })).sort((a, b) => {
                            // Prioritize residents with the largest remaining deficit for this requirement
                            const deficitA = req.minWeeks - (getYearRequirementCount(newSchedule[a.id], req.type, yearStart, yearEnd, programData) + getPriorRequirementCount(historicalCounts[a.id] || {}, req.type));
                            const deficitB = req.minWeeks - (getYearRequirementCount(newSchedule[b.id], req.type, yearStart, yearEnd, programData) + getPriorRequirementCount(historicalCounts[b.id] || {}, req.type));
                            return deficitB - deficitA; // Largest deficit first
                        });


                        eligibleResidents.forEach(res => {

                            const dur = (programData.rotations.get(req.type)?.duration || programData.cycleConfig.X);

                            let safety = 0;
                            while (getYearRequirementCount(newSchedule[res.id], req.type, yearStart, yearEnd, programData) < req.minWeeks && safety < 100) {
                                safety++;
                                let bestW = -1, bestType = compatibleTypes[0], bestScore = Infinity;

                                // Generate candidate weeks, preferring block-aligned positions first
                                const blockAlignedWeeks: number[] = [];
                                const otherWeeks: number[] = [];
                                for (let i = 0; i <= yearEnd - yearStart - dur; i++) {
                                    const w = yearStart + i;
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
                                    if (!isActive(res, w, dur)) continue;

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
                                            if (currentLevel >= 2 && cS >= maxS) { possible = false; break; }
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

                                if (bestW === -1) break;
                                placeBlock(newSchedule, res.id, bestW, dur, bestType);
                            }
                        });
                    });
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
