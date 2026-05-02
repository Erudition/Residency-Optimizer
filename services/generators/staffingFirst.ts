import { Resident, ScheduleGrid, AssignmentType, ScheduleHistory, ScheduleGenerator } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement, COHORT_COUNT } from '../../constants';

import { canFitBlock, placeBlock, getCumulativeRequirementCount, isAligned, getAssignedCount, canPlaceWithoutViolation } from './utils';

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
    name: "Experimental (Staffing First)",
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
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (w % COHORT_COUNT === cohort) {
                    newSchedule[r.id][w] = { assignment: clinicType, locked: true };
                }
            }
        });

        // 2. Staffing Sweep (Foundation)
        const criticalTypes = [
            AssignmentType.MICU,
            AssignmentType.WARDS_RED,
            AssignmentType.WARDS_BLUE,
            AssignmentType.NIGHT_FLOAT,
            AssignmentType.EM,
            AssignmentType.WARDS_METRO,
            AssignmentType.JR_HOSPITALIST,
            AssignmentType.PULM,
            AssignmentType.NEPH,
            AssignmentType.ONC
        ];

        // First Pass: Fill MINIMUMS
        // Start from -3 to handle residents who started a 4-week block before week 0
        for (let w = -3; w < TOTAL_WEEKS; w++) {
            seededShuffle(criticalTypes).forEach(type => {
                const meta = ROTATION_METADATA[type];
                if (!meta) return;
                const dur = meta.duration || 4;

                // Interns Min
                let safety = 0;
                while (getAssignedCount(newSchedule, residents, Math.max(0, w), type, 1) < (meta.minInterns || 0) && safety < 20) {
                    const pool = seededShuffle(residents.filter(r => {
                        const cohort = validCohortAssignments[r.id] ?? 0;
                        return r.level === 1 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur) &&
                               canPlaceWithoutViolation(newSchedule, residents, w, dur, type, 1);
                    })).sort((a, b) => getCumulativeRequirementCount(a.id, newSchedule[a.id], type, historicalSchedules) - 
                                     getCumulativeRequirementCount(b.id, newSchedule[b.id], type, historicalSchedules));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                    safety++;
                }
                
                // Seniors Min
                safety = 0;
                while (getAssignedCount(newSchedule, residents, Math.max(0, w), type, 2) < (meta.minSeniors || 0) && safety < 20) {
                    const pool = seededShuffle(residents.filter(r => {
                        const cohort = validCohortAssignments[r.id] ?? 0;
                        return r.level >= 2 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur) &&
                               canPlaceWithoutViolation(newSchedule, residents, w, dur, type, 2);
                    })).sort((a, b) => getCumulativeRequirementCount(a.id, newSchedule[a.id], type, historicalSchedules) - 
                                     getCumulativeRequirementCount(b.id, newSchedule[b.id], type, historicalSchedules));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                    safety++;
                }
            });
        }

        // Second Pass: Fill towards TARGETS or MAX
        criticalTypes.forEach(type => {
            const meta = ROTATION_METADATA[type];
            if (!meta) return;
            const dur = meta.duration || 4;

            for (let w = -3; w < TOTAL_WEEKS; w++) {
                const maxI = meta.maxInterns || 99;
                const maxS = meta.maxSeniors || 99;

                // Interns
                let safety = 0;
                while (getAssignedCount(newSchedule, residents, Math.max(0, w), type, 1) < maxI && safety < 20) {
                    const pool = seededShuffle(residents.filter(r => {
                        const cohort = validCohortAssignments[r.id] ?? 0;
                        const target = meta.targetIntern || 0;
                        return r.level === 1 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur) &&
                               canPlaceWithoutViolation(newSchedule, residents, w, dur, type, 1) &&
                               getCumulativeRequirementCount(r.id, newSchedule[r.id], type, historicalSchedules) < Math.max(target, 4); 
                    })).sort((a, b) => getCumulativeRequirementCount(a.id, newSchedule[a.id], type, historicalSchedules) - 
                                     getCumulativeRequirementCount(b.id, newSchedule[b.id], type, historicalSchedules));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                    safety++;
                }
                
                // Seniors
                safety = 0;
                while (getAssignedCount(newSchedule, residents, Math.max(0, w), type, 2) < maxS && safety < 20) {
                    const pool = seededShuffle(residents.filter(r => {
                        const cohort = validCohortAssignments[r.id] ?? 0;
                        const target = r.level === 2 ? (meta.targetPGY2 || meta.targetSenior || 0) : (meta.targetPGY3 || meta.targetSenior || 0);
                        return r.level >= 2 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, cohort, dur) &&
                               canPlaceWithoutViolation(newSchedule, residents, w, dur, type, 2) &&
                               getCumulativeRequirementCount(r.id, newSchedule[r.id], type, historicalSchedules) < Math.max(target, 4);
                    })).sort((a, b) => getCumulativeRequirementCount(a.id, newSchedule[a.id], type, historicalSchedules) - 
                                     getCumulativeRequirementCount(b.id, newSchedule[b.id], type, historicalSchedules));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                    safety++;
                }
            }
        });

        // 3. Education Fill (Same logic as others)
        const allResidents = seededShuffle(residents);
        allResidents.forEach(res => {
            const level = res.level as 1|2|3;
            const reqs = seededShuffle(REQUIREMENTS[level] || []);
            reqs.sort((a, b) => (ROTATION_METADATA[b.type]?.duration || 0) - (ROTATION_METADATA[a.type]?.duration || 0));

            reqs.forEach(req => {
                const compatibleTypes = Object.values(AssignmentType).filter(t => fulfillsRequirement(t, req.type));
                const cohort = validCohortAssignments[res.id] ?? 0;
                const dur = ROTATION_METADATA[req.type]?.duration || 4;

                let safety = 0;
                while (getCumulativeRequirementCount(res.id, newSchedule[res.id], req.type, historicalSchedules) < req.target && safety < 10) {
                    safety++;
                    let found = false;
                    const possibleWeeks = seededShuffle(Array.from({length: TOTAL_WEEKS - dur + 1}, (_, i) => i));

                    for (const w of possibleWeeks) {
                        if (isAligned(w, cohort, dur) && canFitBlock(newSchedule, res.id, w, dur)) {
                            for (const type of compatibleTypes) {
                                const meta = ROTATION_METADATA[type];
                                const max = (res.level === 1) ? (meta?.maxInterns || 99) : (meta?.maxSeniors || 99);
                                if (canPlaceWithoutViolation(newSchedule, residents, w, dur, type, res.level === 1 ? 1 : 2)) {
                                    placeBlock(newSchedule, res.id, w, dur, type);
                                    found = true;
                                    break;
                                }
                            }
                        }
                        if (found) break;
                    }
                    if (!found) break;
                }
            });
        });

        // 4. Elective Fill
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
