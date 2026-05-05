import { Resident, ScheduleGrid, AssignmentType, ScheduleHistory, ScheduleGenerator } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement, COHORT_COUNT } from '../../constants';

import { canFitBlock, placeBlock, getCumulativeRequirementCount, isAligned, getAssignedCount } from './utils';


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
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, historicalSchedules?: ScheduleHistory, cohortAssignments?: Record<string, number>): ScheduleGrid => {
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

        let validCohortAssignments = { ...(cohortAssignments || {}) };
        if (Object.keys(validCohortAssignments).length === 0) {
            const sorted = [...residents].sort((a, b) => {
                if (a.level !== b.level) return a.level - b.level;
                return a.name.localeCompare(b.name);
            });
            sorted.forEach((r, idx) => {
                validCohortAssignments[r.id] = idx % 5;
            });
        }

        // 1. Initialize & Clinic Lock
        residents.forEach(r => {
            if (!newSchedule[r.id] || newSchedule[r.id].length !== TOTAL_WEEKS) {
                newSchedule[r.id] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
            }
            const clinicType = r.clinicType || AssignmentType.CLINIC;
            const cohort = validCohortAssignments[r.id] ?? 0;
            const row = newSchedule[r.id];
            for (let w = 0; w < row.length; w++) {
                if (w % COHORT_COUNT === cohort) {
                    if (row[w].locked) continue;
                    newSchedule[r.id][w] = { assignment: clinicType, locked: true };
                }
            }
        });


        // 2. High-Entropy Placement (Pure Random Order)
        const allLevels = [1, 2, 3];
        allLevels.forEach(level => {
            // SHUFFLE REQUIREMENTS COMPLETELY - No priority sorting
            const reqs = seededShuffle(REQUIREMENTS[level as 1|2|3] || []);

            reqs.forEach(req => {
                const compatibleTypes = Object.values(AssignmentType).filter(t => fulfillsRequirement(t, req.type));
                
                seededShuffle(residents.filter(r => r.level === level)).forEach(res => {
                    const cohort = validCohortAssignments[res.id];

                    let safety = 0;
                    while (getCumulativeRequirementCount(res.id, newSchedule[res.id], req.type, historicalSchedules) < req.target && safety < 10) {
                        safety++;
                        let bestW = -1, bestType = compatibleTypes[0], bestScore = Infinity;
                        const dur = ROTATION_METADATA[req.type]?.duration || 4;

                        const possibleWeeks = seededShuffle(Array.from({length: TOTAL_WEEKS - dur + 1}, (_, i) => i));

                        for (const w of possibleWeeks) {
                            if (!isAligned(w, cohort, dur)) continue;
                            if (!canFitBlock(newSchedule, res.id, w, dur)) continue;

                            for (const type of compatibleTypes) {
                                const meta = ROTATION_METADATA[type];
                                let score = 0;
                                let possible = true;

                                for (let i = 0; i < dur; i++) {
                                    const cI = getAssignedCount(newSchedule, residents, w + i, type, 1);
                                    const cS = getAssignedCount(newSchedule, residents, w + i, type, 2);
                                    const maxI = meta?.maxInterns || 99;
                                    const maxS = meta?.maxSeniors || 99;

                                    if (res.level === 1 && cI >= maxI) { possible = false; break; }
                                    if (res.level > 1 && cS >= maxS) { possible = false; break; }
                                    
                                    // Heavy randomization of scores to explore different paths
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
        });

        // 3. Staffing Sweep
        const criticalTypes = Object.values(AssignmentType).filter(t => {
            const m = ROTATION_METADATA[t];
            return m && (m.minInterns > 0 || m.minSeniors > 0);
        });

        criticalTypes.forEach(type => {
            const meta = ROTATION_METADATA[type];
            if (!meta) return;
            const dur = meta.duration || 4;

            for (let w = 0; w < TOTAL_WEEKS; w++) {
                // Interns
                let safetyI = 0;
                while (getAssignedCount(newSchedule, residents, w, type, 1) < (meta.minInterns || 0) && safetyI < 10) {
                    safetyI++;
                    const pool = seededShuffle(residents.filter(r => {
                        const cohort = validCohortAssignments[r.id];
                        return r.level === 1 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur) &&
                               getAssignedCount(newSchedule, residents, w, type, 1) < (meta.maxInterns || 99);
                    }));
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                }

                // Seniors
                let safetyS = 0;
                while (getAssignedCount(newSchedule, residents, w, type, 2) < (meta.minSeniors || 0) && safetyS < 10) {
                    safetyS++;
                    const pool = seededShuffle(residents.filter(r => {
                        const cohort = validCohortAssignments[r.id];
                        return r.level >= 2 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur) &&
                               getAssignedCount(newSchedule, residents, w, type, 2) < (meta.maxSeniors || 99);
                    }));
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                }
            }
        });

        // 4. Final Elective Fill
        residents.forEach(r => {
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (!newSchedule[r.id][w]?.assignment) {
                    newSchedule[r.id][w] = { assignment: AssignmentType.ELECTIVE, locked: false };
                }
            }
        });

        return newSchedule;
    }
};
