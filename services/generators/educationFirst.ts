import { Resident, ScheduleGrid, AssignmentType, ScheduleGenerator } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement, COHORT_COUNT } from '../../constants';

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
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number>): ScheduleGrid => {
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

        let validCohortAssignments = { ...(cohortAssignments || {}) };
        if (Object.keys(validCohortAssignments).length === 0) {
            validCohortAssignments = getStandardCohortMap(residents);
        }

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
                if (w % COHORT_COUNT === cohort) {
                    if (row[w].locked) continue;
                    const pgy = Math.min(3, r.level + Math.floor(w / 52));
                    const weeklyClinicType = (r.startYear === 2025) ? AssignmentType.NIMA_CLINIC : AssignmentType.CLINIC;
                    newSchedule[r.id][w] = { assignment: weeklyClinicType, locked: true };
                }
            }
        });


        // 2. Education First Placement (Aggregation Aware)
        for (let yIdx = 0; yIdx < numYears; yIdx++) {
            const yearStart = yIdx * 52;
            const yearEnd = (yIdx + 1) * 52;

            const allLevels = [1, 2, 3];
            allLevels.forEach(level => {
                const reqs = seededShuffle(REQUIREMENTS[level as 1|2|3] || []);
                // Sort by duration descending, then by capacity ascending (harder rotations first)
                const criticalPriority: AssignmentType[] = [
                    AssignmentType.MICU,
                    AssignmentType.WARDS_RED,
                    AssignmentType.WARDS_BLUE,
                    AssignmentType.WARDS_METRO,
                    AssignmentType.GERI,
                    AssignmentType.EM,
                    AssignmentType.JR_HOSPITALIST,
                    AssignmentType.PALLIATIVE,
                    AssignmentType.ADD_MED,
                    AssignmentType.NIMA_BLOCK,
                    AssignmentType.CARDS,
                    AssignmentType.ID,
                    AssignmentType.NEPH,
                    AssignmentType.PULM,
                    AssignmentType.ONC,
                    AssignmentType.NEURO,
                    AssignmentType.RHEUM,
                    AssignmentType.GI,
                    AssignmentType.ENDO
                ];

                reqs.sort((a, b) => {
                    const idxA = criticalPriority.indexOf(a.type);
                    const idxB = criticalPriority.indexOf(b.type);
                    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                    if (idxA !== -1) return -1;
                    if (idxB !== -1) return 1;

                    const metaA = ROTATION_METADATA[a.type];
                    const metaB = ROTATION_METADATA[b.type];
                    const durA = metaA?.duration || 4;
                    const durB = metaB?.duration || 4;
                    if (durA !== durB) return durB - durA;
                    
                    const maxA = (level === 1 ? metaA?.maxInterns : metaA?.maxSeniors) || 99;
                    const maxB = (level === 1 ? metaB?.maxInterns : metaB?.maxSeniors) || 99;
                    return maxA - maxB;
                });

                reqs.forEach(req => {
                    const compatibleTypes = Object.values(AssignmentType).filter(t => fulfillsRequirement(t, req.type));
                    
                    seededShuffle(residents.filter(r => {
                        const currentLevel = r.level + yIdx;
                        const start = r.activeWeekStart ?? 0;
                        const end = r.activeWeekEnd ?? totalWeeks;
                        return currentLevel === level && start < yearEnd && end > yearStart;
                    })).sort((a, b) => {
                        const countA = getYearRequirementCount(newSchedule[a.id], req.type, 0, yearEnd) + getPriorRequirementCount(priorRequirementCounts?.[a.id] || {}, req.type);
                        const countB = getYearRequirementCount(newSchedule[b.id], req.type, 0, yearEnd) + getPriorRequirementCount(priorRequirementCounts?.[b.id] || {}, req.type);
                        return countA - countB;
                    }).forEach(res => {
                        const start = res.activeWeekStart ?? 0;
                        const end = res.activeWeekEnd ?? totalWeeks;
                        const rYearStart = Math.max(yearStart, start);
                        const rYearEnd = Math.min(yearEnd, end);
                        const cohort = getCohortAtWeek(res, rYearStart, validCohortAssignments);

                        let safety = 0;
                        while (getYearRequirementCount(newSchedule[res.id], req.type, yearStart, yearEnd) < req.minWeeks && safety < 100) {
                            safety++;
                            let bestW = -1, bestType = compatibleTypes[0], bestScore = Infinity;
                            const dur = ROTATION_METADATA[req.type]?.duration || 4;
                            const possibleWeeks = seededShuffle(Array.from({length: Math.max(0, rYearEnd - rYearStart - dur + 1)}, (_, i) => rYearStart + i));


                            for (const w of possibleWeeks) {
                                if (!isAligned(w, cohort, dur)) continue;
                                if (!canFitBlock(newSchedule, res.id, w, dur)) continue;

                                // Try all compatible types for this week
                                for (const type of compatibleTypes) {
                                    const meta = ROTATION_METADATA[type];
                                    let score = 0;
                                    let possible = true;

                                    for (let i = 0; i < dur; i++) {
                                        const cI = getAssignedCount(newSchedule, residents, w + i, type, 1);
                                        const cS = getAssignedCount(newSchedule, residents, w + i, type, 2);

                                        const maxI = meta?.maxInterns || 99;
                                        const maxS = meta?.maxSeniors || 99;

                                        if (level === 1 && cI >= maxI) { possible = false; break; }
                                        if (level > 1 && cS >= maxS) { possible = false; break; }
                                        
                                        // Spreading score: prefer weeks with less staff (with random tiebreaker)
                                        score += (cI + cS) + rng.next() * 0.1;
                                    }

                                    if (possible && score < bestScore) {
                                        bestScore = score;
                                        bestW = w;
                                        bestType = type;
                                    }
                                }
                            }

                            if (bestW === -1) break; // Cannot fit anymore
                            placeBlock(newSchedule, res.id, bestW, dur, bestType);
                        }
                    });
                });
            });
        }

        // 3. Staffing Sweep (Foundation) - Mandatory Minima
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

        for (let w = 0; w < totalWeeks; w++) {
            criticalTypes.forEach(type => {
                const meta = ROTATION_METADATA[type];
                if (!meta) return;
                const dur = meta.duration || 4;

                // Interns
                let safetyI = 0;
                while (getAssignedCount(newSchedule, residents, w, type, 1) < (meta.minInterns || 0) && safetyI < 10) {
                    safetyI++;
                    const pool = seededShuffle(residents.filter(r => {
                        const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                        const currentLevel = r.level + Math.floor(w / 52);
                        const start = r.activeWeekStart ?? 0;
                        const end = r.activeWeekEnd ?? totalWeeks;

                        return currentLevel === 1 && 
                               w >= start && w + dur <= end &&
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur) &&
                               getAssignedCount(newSchedule, residents, w, type, 1) < (meta.maxInterns || 99);
                    })).sort((a, b) => (getYearRequirementCount(newSchedule[a.id], type, 0, w) + getPriorRequirementCount(priorRequirementCounts?.[a.id] || {}, type)) - 
                                     (getYearRequirementCount(newSchedule[b.id], type, 0, w) + getPriorRequirementCount(priorRequirementCounts?.[b.id] || {}, type)));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                }

                // Seniors
                let safetyS = 0;
                while (getAssignedCount(newSchedule, residents, w, type, 2) < (meta.minSeniors || 0) && safetyS < 10) {
                    safetyS++;
                    const pool = seededShuffle(residents.filter(r => {
                        const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                        const currentLevel = r.level + Math.floor(w / 52);
                        const start = r.activeWeekStart ?? 0;
                        const end = r.activeWeekEnd ?? totalWeeks;

                        return currentLevel >= 2 && 
                               w >= start && w + dur <= end &&
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur) &&
                               getAssignedCount(newSchedule, residents, w, type, 2) < (meta.maxSeniors || 99);
                    })).sort((a, b) => (getYearRequirementCount(newSchedule[a.id], type, 0, w) + getPriorRequirementCount(priorRequirementCounts?.[a.id] || {}, type)) - 
                                     (getYearRequirementCount(newSchedule[b.id], type, 0, w) + getPriorRequirementCount(priorRequirementCounts?.[b.id] || {}, type)));
                    
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
                    newSchedule[r.id][w] = { assignment: AssignmentType.ELECTIVE, locked: false };
                }
            }
        });

        return newSchedule;
    }
};
