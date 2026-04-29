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

export const WeekByWeekGenerator: ScheduleGenerator = {
    name: "Week By Week",
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

        // 1. Initial State & Clinic Weeks
        residents.forEach(r => {
            if (!newSchedule[r.id] || newSchedule[r.id].length !== TOTAL_WEEKS) {
                newSchedule[r.id] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
            } else {
                newSchedule[r.id] = newSchedule[r.id].map(cell => (cell && cell.locked) ? cell : { assignment: null, locked: false });
            }

            const cohort = cohortAssignments ? cohortAssignments[r.id] : 0;
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (w % COHORT_COUNT === cohort) {
                    newSchedule[r.id][w] = { assignment: AssignmentType.CLINIC, locked: true };
                }
            }
        });

        const coreStaffingTypes = [
            AssignmentType.MICU, 
            AssignmentType.WARDS_RED, 
            AssignmentType.WARDS_BLUE, 
            AssignmentType.WARDS_METRO,
            AssignmentType.NIGHT_FLOAT, 
            AssignmentType.EM,
            AssignmentType.JR_HOSPITALIST,
            AssignmentType.PULM,
            AssignmentType.NEPH,
            AssignmentType.ONC
        ];

        // 2. Sequential Staffing Pass (Foundation)
        // Start from -3 to handle residents who started a 4-week block before week 0
        for (let w = -3; w < TOTAL_WEEKS; w++) {
            seededShuffle(coreStaffingTypes).forEach(type => {
                const meta = ROTATION_METADATA[type];
                if (!meta) return;
                const duration = meta.duration || 4;

                // Interns
                let safety = 0;
                while (getAssignedCount(newSchedule, residents, Math.max(0, w), type, 1) < meta.minInterns && safety < 20) {
                    const candidate = seededShuffle(residents.filter(r => {
                        const cohort = cohortAssignments?.[r.id] ?? 0;
                        return r.level === 1 && 
                               isAligned(w, cohort, duration) && 
                               canFitBlock(newSchedule, r.id, w, duration) &&
                               canPlaceWithoutViolation(newSchedule, residents, w, duration, type, 1);
                    })).sort((a, b) => getCumulativeRequirementCount(a.id, newSchedule[a.id], type, historicalSchedules) - 
                                     getCumulativeRequirementCount(b.id, newSchedule[b.id], type, historicalSchedules));

                    if (candidate.length > 0) {
                        placeBlock(newSchedule, candidate[0].id, w, duration, type);
                    } else break;
                    safety++;
                }

                // Seniors
                safety = 0;
                while (getAssignedCount(newSchedule, residents, Math.max(0, w), type, 2) < meta.minSeniors && safety < 20) {
                    const candidate = seededShuffle(residents.filter(r => {
                        const cohort = cohortAssignments?.[r.id] ?? 0;
                        return r.level >= 2 && 
                               isAligned(w, cohort, duration) && 
                               canFitBlock(newSchedule, r.id, w, duration) &&
                               canPlaceWithoutViolation(newSchedule, residents, w, duration, type, 2);
                    })).sort((a, b) => getCumulativeRequirementCount(a.id, newSchedule[a.id], type, historicalSchedules) - 
                                     getCumulativeRequirementCount(b.id, newSchedule[b.id], type, historicalSchedules));

                    if (candidate.length > 0) {
                        placeBlock(newSchedule, candidate[0].id, w, duration, type);
                    } else break;
                    safety++;
                }
            });
        }

        // 3. Educational Requirement Fill (Multi-pass)
        residents.forEach(res => {
            const level = res.level as 1|2|3;
            const pgyRequirements = seededShuffle(REQUIREMENTS[level] || []);
            pgyRequirements.sort((a, b) => (ROTATION_METADATA[b.type]?.duration || 0) - (ROTATION_METADATA[a.type]?.duration || 0));

            pgyRequirements.forEach(req => {
                const compatibleTypes = Object.values(AssignmentType).filter(t => fulfillsRequirement(t, req.type));
                const cohort = cohortAssignments?.[res.id] ?? 0;
                const dur = ROTATION_METADATA[req.type]?.duration || 4;

                let safety = 0;
                while (getCumulativeRequirementCount(res.id, newSchedule[res.id], req.type, historicalSchedules) < req.target && safety < 10) {
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
                    safety++;
                }
            });
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
