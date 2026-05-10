import { Resident, ScheduleGrid, AssignmentType, ScheduleGenerator, ScheduleCell } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement, COHORT_COUNT } from '../../constants';

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
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number> | Record<number, Record<string, number>>): ScheduleGrid => {
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
        const gridStartYear = firstRes ? (firstRes.startYear + Number(firstRes.level) - 1) : 2026;
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

        let validCohortAssignments = cohortAssignments;
        if (!validCohortAssignments || Object.keys(validCohortAssignments).length === 0) {
            validCohortAssignments = getStandardCohortMap(residents);
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
                if (w % COHORT_COUNT === getCohortAtWeek(r, w, validCohortAssignments)) {
                    if (row[w].locked) continue;
                    const level = getPgy(r, w);
                    const clinicType = (r.startYear === 2025) ? AssignmentType.NIMA_CLINIC : AssignmentType.CLINIC;
                    newSchedule[r.id][w] = { assignment: clinicType, locked: true };

                }
            }
        });


        // 2. Staffing Sweep FIRST (Foundation) - Mandatory Minima
        const criticalTypes = [
            AssignmentType.MICU,
            AssignmentType.WARDS_RED,
            AssignmentType.WARDS_BLUE,
            AssignmentType.NIGHT_FLOAT,
            AssignmentType.EM,
            AssignmentType.WARDS_METRO,
            AssignmentType.JR_HOSPITALIST,
            AssignmentType.CARDS,
            AssignmentType.NEPH,
            AssignmentType.ID
        ];

        const historicalCounts = priorRequirementCounts || {};

        criticalTypes.forEach(type => {
            const meta = ROTATION_METADATA[type];
            if (!meta) return;
            const dur = meta.duration || 4;

            for (let w = 0; w < totalWeeks; w++) {
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
                               isAligned(w, cohort, dur) &&
                               getAssignedCount(newSchedule, residents, w, type, 1) < (meta.maxInterns || 99);
                    })).sort((a, b) => {
                        const countA = getYearRequirementCount(newSchedule[a.id], type, 0, w) + getPriorRequirementCount(historicalCounts[a.id] || {}, type);
                        const countB = getYearRequirementCount(newSchedule[b.id], type, 0, w) + getPriorRequirementCount(historicalCounts[b.id] || {}, type);
                        return countA - countB;
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
                               isAligned(w, cohort, dur) &&
                               getAssignedCount(newSchedule, residents, w, type, 2) < (meta.maxSeniors || 99);
                    })).sort((a, b) => {
                        const countA = getYearRequirementCount(newSchedule[a.id], type, 0, w) + getPriorRequirementCount(historicalCounts[a.id] || {}, type);
                        const countB = getYearRequirementCount(newSchedule[b.id], type, 0, w) + getPriorRequirementCount(historicalCounts[b.id] || {}, type);
                        return countA - countB;
                    });
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                }
            }
        });


        // 3. Education Placement SECOND (Segmented by Year)
        const yearCount = Math.ceil(totalWeeks / 52);
        for (let yearIdx = 0; yearIdx < yearCount; yearIdx++) {
            const yearStart = yearIdx * 52;
            const yearEnd = Math.min(yearStart + 52, totalWeeks);

            const pgyLevels: (1|2|3)[] = [1, 2, 3];
            pgyLevels.forEach(level => {
                const reqs = seededShuffle(REQUIREMENTS[level] || []);
                reqs.forEach(req => {
                    const compatibleTypes = Object.values(AssignmentType).filter(t => fulfillsRequirement(t, req.type));
                    
                    const eligibleResidents = seededShuffle(residents.filter(r => {
                        return isActive(r, yearStart) && getPgy(r, yearStart) === level;
                    })).sort((a, b) => {
                        const countA = getYearRequirementCount(newSchedule[a.id], req.type, 0, yearEnd) + getPriorRequirementCount(historicalCounts[a.id] || {}, req.type);
                        const countB = getYearRequirementCount(newSchedule[b.id], req.type, 0, yearEnd) + getPriorRequirementCount(historicalCounts[b.id] || {}, req.type);
                        return countA - countB;
                    });


                    eligibleResidents.forEach(res => {

                        const dur = ROTATION_METADATA[req.type]?.duration || 4;

                        let safety = 0;
                        while (getYearRequirementCount(newSchedule[res.id], req.type, yearStart, yearEnd) < req.minWeeks && safety < 100) {
                            safety++;
                            let bestW = -1, bestType = compatibleTypes[0], bestScore = Infinity;

                            const possibleWeeks = seededShuffle(Array.from(
                                { length: yearEnd - yearStart - dur + 1 }, 
                                (_, i) => yearStart + i
                            ));

                            for (const w of possibleWeeks) {
                                const cohort = getCohortAtWeek(res, w, validCohortAssignments);
                                if (!isAligned(w, cohort, dur)) continue;
                                if (!canFitBlock(newSchedule, res.id, w, dur)) continue;
                                if (!isActive(res, w, dur)) continue;

                                for (const type of compatibleTypes) {
                                    const meta = ROTATION_METADATA[type];
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
                                        // Ratio Preference: Interns >= Seniors for core inpatient services
                                        const isInpatientService = [AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE, AssignmentType.WARDS_METRO, AssignmentType.MICU, AssignmentType.METRO_ICU, AssignmentType.NIGHT_FLOAT].includes(type);
                                        const newCI = cI + (currentLevel === 1 ? 1 : 0);
                                        const newCS = cS + (currentLevel > 1 ? 1 : 0);
                                        
                                        if (isInpatientService) {
                                            if (newCI < newCS) {
                                                score += 10; // Penalty for inverted ratio
                                            } else {
                                                score -= 2;  // Reward for preferred ratio
                                            }
                                        }

                                        score += (cI + cS) + rng.next() * 0.1;
                                    }

                                    if (possible && score < bestScore) {
                                        bestScore = score;
                                        bestW = w;
                                        bestType = type;
                                    }
                                }
                            }

                            if (bestW === -1) break;
                            placeBlock(newSchedule, res.id, bestW, dur, bestType);
                        }
                    });
                });
            });
        }

        // 4. Final Elective Fill
        residents.forEach(r => {
            const row = newSchedule[r.id];
            for (let w = 0; w < row.length; w++) {
                if (row[w].locked) continue;
                if (isActive(r, w) && !row[w].assignment) {
                    newSchedule[r.id][w] = { assignment: AssignmentType.ELECTIVE, locked: false };
                }
            }
        });

        return newSchedule;
    }
};
