import { Resident, ScheduleGrid, AssignmentType, ScheduleHistory, ScheduleGenerator } from '../../types';
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

export const StochasticGenerator: ScheduleGenerator = {
    name: "Stochastic (Balanced Search)",
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number>): ScheduleGrid => {
        const rng = new SeededRNG(42 + attemptIndex);

        const seededShuffle = <T>(array: T[]): T[] => {
            const newArray = [...array];
            for (let i = newArray.length - 1; i > 0; i--) {
                const j = Math.floor(rng.next() * (i + 1));
                [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
            }
            return newArray;
        };

        const newSchedule: ScheduleGrid = JSON.parse(JSON.stringify(existingSchedule));
        const totalWeeks = Object.values(newSchedule)[0]?.length || 52;
        const numYears = Math.max(1, Math.floor(totalWeeks / 52));

        let validCohortAssignments = { ...(cohortAssignments || {}) };
        if (Object.keys(validCohortAssignments).length === 0) {
            validCohortAssignments = getStandardCohortMap(residents);
        }

        const historicalCounts: Record<string, Record<string, number>> = priorRequirementCounts || {};

        // 1. Initialize & Clinic Lock (Active Weeks Only)
        residents.forEach(r => {
            if (!newSchedule[r.id] || newSchedule[r.id].length !== totalWeeks) {
                newSchedule[r.id] = Array(totalWeeks).fill(null).map(() => ({ assignment: null, locked: false }));
            }
            const row = newSchedule[r.id];
            
            const start = r.activeWeekStart ?? 0;
            const end = r.activeWeekEnd ?? totalWeeks;

            for (let w = start; w < end; w++) {
                const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                if (w % COHORT_COUNT === cohort) {
                    if (row[w].locked) continue;
                    const pgy = Math.min(3, r.level + Math.floor(w / 52));
                    const weeklyClinicType = (r.startYear === 2025) ? AssignmentType.NIMA_CLINIC : AssignmentType.CLINIC;
                    newSchedule[r.id][w] = { assignment: weeklyClinicType, locked: true };
                }
            }
        });

        // 2. High-Entropy Placement (Graduation-Aware)
        for (let yIdx = 0; yIdx < numYears; yIdx++) {
            const yearStart = yIdx * 52;
            const yearEnd = Math.min(totalWeeks, (yIdx + 1) * 52);

            for (let pgyLevel = 1; pgyLevel <= 3; pgyLevel++) {
                const reqs = seededShuffle(REQUIREMENTS[pgyLevel as 1 | 2 | 3] || []);
                
                // Residents who are this level in THIS year
                const activeResidentsAtLevel = residents.filter(r => {
                    const currentLevel = r.level + yIdx;
                    if (currentLevel !== pgyLevel) return false;
                    
                    const start = r.activeWeekStart ?? 0;
                    const end = r.activeWeekEnd ?? totalWeeks;
                    return start < yearEnd && end > yearStart;
                });

                reqs.forEach(req => {
                    const compatibleTypes = Object.values(AssignmentType).filter(t => fulfillsRequirement(t, req.type));
                    
                    const sortedResidents = seededShuffle(activeResidentsAtLevel).sort((a, b) => {
                        const countA = getYearRequirementCount(newSchedule[a.id], req.type, 0, yearEnd) + getPriorRequirementCount(historicalCounts[a.id] || {}, req.type);
                        const countB = getYearRequirementCount(newSchedule[b.id], req.type, 0, yearEnd) + getPriorRequirementCount(historicalCounts[b.id] || {}, req.type);
                        return countA - countB;
                    });
                    sortedResidents.forEach(res => {
                        const resStart = res.activeWeekStart ?? 0;
                        const resEnd = res.activeWeekEnd ?? totalWeeks;
                        const effectiveStart = Math.max(yearStart, resStart);
                        const effectiveEnd = Math.min(yearEnd, resEnd);
                        const cohort = getCohortAtWeek(res, effectiveStart, validCohortAssignments);

                        let safety = 0;
                        while (getYearRequirementCount(newSchedule[res.id], req.type, yearStart, yearEnd) < req.minWeeks && safety < 100) {
                            safety++;
                            let bestW = -1, bestType = compatibleTypes[0], bestScore = Infinity;
                            const dur = ROTATION_METADATA[req.type]?.duration || 4;

                            const possibleWeeks = seededShuffle(Array.from({length: effectiveEnd - effectiveStart - dur + 1}, (_, i) => effectiveStart + i));

                            for (const w of possibleWeeks) {
                                const cohort = getCohortAtWeek(res, w, validCohortAssignments);
                                if (!isAligned(w, cohort, dur)) continue;
                                if (!canFitBlock(newSchedule, res.id, w, dur)) continue;
                                if (w + dur > resEnd) continue;

                                for (const type of compatibleTypes) {
                                    const meta = ROTATION_METADATA[type];
                                    let score = 0;
                                    let possible = true;

                                    for (let i = 0; i < dur; i++) {
                                        const cI = getAssignedCount(newSchedule, residents, w + i, type, 1);
                                        const cS = getAssignedCount(newSchedule, residents, w + i, type, 2);
                                        const maxI = meta?.maxInterns || 99;
                                        const maxS = meta?.maxSeniors || 99;

                                        const currentLevelAtW = res.level + Math.floor(w / 52);
                                        if (currentLevelAtW === 1 && cI >= maxI) { possible = false; break; }
                                        if (currentLevelAtW > 1 && cS >= maxS) { possible = false; break; }
                                        
                                        score += (cI + cS) + rng.next() * 5.0;
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
            }
        }

        // 3. Staffing Sweep (Graduation-Aware)
        const criticalTypes = Object.values(AssignmentType).filter(t => {
            const m = ROTATION_METADATA[t];
            return m && (m.minInterns > 0 || m.minSeniors > 0);
        });

        criticalTypes.forEach(type => {
            const meta = ROTATION_METADATA[type];
            if (!meta) return;
            const dur = meta.duration || 4;

            for (let w = 0; w < totalWeeks; w++) {
                const yIdx = Math.floor(w / 52);
                const yearStart = yIdx * 52;
                const yearEnd = (yIdx + 1) * 52;

                // Interns
                let safetyI = 0;
                while (getAssignedCount(newSchedule, residents, w, type, 1) < (meta.minInterns || 0) && safetyI < 10) {
                    safetyI++;
                    const pool = seededShuffle(residents.filter(r => {
                        const level = r.level + Math.floor(w / 52);
                        const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                        const start = r.activeWeekStart ?? 0;
                        const end = r.activeWeekEnd ?? totalWeeks;
                        return w >= start && w + dur <= end &&
                               level === 1 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur) &&
                               getAssignedCount(newSchedule, residents, w, type, 1) < (meta.maxInterns || 99);
                    })).sort((a, b) => (getYearRequirementCount(newSchedule[a.id], type, 0, w) + getPriorRequirementCount(historicalCounts[a.id] || {}, type)) - 
                                     (getYearRequirementCount(newSchedule[b.id], type, 0, w) + getPriorRequirementCount(historicalCounts[b.id] || {}, type)));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                }

                // Seniors
                let safetyS = 0;
                while (getAssignedCount(newSchedule, residents, w, type, 2) < (meta.minSeniors || 0) && safetyS < 10) {
                    safetyS++;
                    const pool = seededShuffle(residents.filter(r => {
                        const level = r.level + Math.floor(w / 52);
                        const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                        const start = r.activeWeekStart ?? 0;
                        const end = r.activeWeekEnd ?? totalWeeks;
                        return w >= start && w + dur <= end &&
                               level >= 2 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur) &&
                               getAssignedCount(newSchedule, residents, w, type, 2) < (meta.maxSeniors || 99);
                    })).sort((a, b) => (getYearRequirementCount(newSchedule[a.id], type, 0, w) + getPriorRequirementCount(historicalCounts[a.id] || {}, type)) - 
                                     (getYearRequirementCount(newSchedule[b.id], type, 0, w) + getPriorRequirementCount(historicalCounts[b.id] || {}, type)));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                }
            }
        });

        // 4. Final Elective Fill
        residents.forEach(r => {
            const start = r.activeWeekStart ?? 0;
            const end = r.activeWeekEnd ?? totalWeeks;
            for (let w = start; w < end; w++) {
                if (!newSchedule[r.id][w]?.assignment) {
                    newSchedule[r.id][w] = { assignment: AssignmentType.ELECTIVE, locked: false };
                }
            }
        });

        return newSchedule;
    }
};
