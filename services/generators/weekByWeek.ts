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

export const WeekByWeekGenerator: ScheduleGenerator = {
    name: "Greedy (Week By Week)",
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

        // 1. PRE-CALCULATE HISTORICAL COUNTS & INITIALIZE TRACKERS
        const historicalCounts: Record<string, Record<string, number>> = {};
        const currentCounts: Record<string, Record<string, number>> = {};
        const weekTypeCounts: { interns: Record<string, number>, seniors: Record<string, number> }[] = [];
        for (let w = 0; w < TOTAL_WEEKS; w++) {
            weekTypeCounts[w] = { interns: {}, seniors: {} };
        }

        const updateCounts = (rId: string, level: number, week: number, type: AssignmentType, dur: number) => {
            for (let i = 0; i < dur; i++) {
                const w = week + i;
                if (w >= TOTAL_WEEKS) continue;
                if (level === 1) weekTypeCounts[w].interns[type] = (weekTypeCounts[w].interns[type] || 0) + 1;
                else weekTypeCounts[w].seniors[type] = (weekTypeCounts[w].seniors[type] || 0) + 1;
            }
            (REQUIREMENTS[level] || []).forEach(req => {
                if (fulfillsRequirement(type, req.type)) {
                    currentCounts[rId][req.type] = (currentCounts[rId][req.type] || 0) + dur;
                }
            });
        };

        residents.forEach(r => {
            historicalCounts[r.id] = {};
            currentCounts[r.id] = {};
            if (historicalSchedules) {
                Object.values(historicalSchedules).forEach(grid => {
                    const row = grid[r.id];
                    if (row) {
                        row.forEach(c => {
                            if (c && c.assignment) {
                                (REQUIREMENTS[r.level] || []).forEach(req => {
                                    if (fulfillsRequirement(c.assignment, req.type)) {
                                        historicalCounts[r.id][req.type] = (historicalCounts[r.id][req.type] || 0) + 1;
                                    }
                                });
                            }
                        });
                    }
                });
            }

            // Track existing assignments
            if (existingSchedule[r.id]) {
                existingSchedule[r.id].forEach((cell, w) => {
                    if (cell && cell.assignment) {
                        updateCounts(r.id, r.level, w, cell.assignment, 1);
                    }
                });
            }
        });

        const getCumulativeReqCountFast = (rId: string, type: AssignmentType): number => {
            return (historicalCounts[rId][type] || 0) + (currentCounts[rId][type] || 0);
        };

        // 1. Initialize & Clinic Lock
        residents.forEach(r => {
            if (!newSchedule[r.id] || newSchedule[r.id].length !== TOTAL_WEEKS) {
                newSchedule[r.id] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
            }
            const clinicType = r.clinicType || AssignmentType.CLINIC;
            const cohort = validCohortAssignments[r.id] ?? 0;
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (w % COHORT_COUNT === cohort) {
                    if (!newSchedule[r.id][w]?.assignment) {
                        newSchedule[r.id][w] = { assignment: clinicType, locked: true };
                        updateCounts(r.id, r.level, w, clinicType, 1);
                    }
                }
            }
        });


        // 2. Sequential Temporal Placement
        const criticalStaffingTypes = [
            AssignmentType.MICU,
            AssignmentType.WARDS_RED,
            AssignmentType.WARDS_BLUE,
            AssignmentType.NIGHT_FLOAT,
            AssignmentType.EM,
            AssignmentType.WARDS_METRO,
            AssignmentType.JR_HOSPITALIST
        ];

        for (let w = 0; w < TOTAL_WEEKS; w++) {
            // First: Fill mandatory floors for this specific week
            seededShuffle(criticalStaffingTypes).forEach(type => {
                const meta = ROTATION_METADATA[type];
                if (!meta) return;
                const dur = meta.duration || 4;

                // Interns
                while ((weekTypeCounts[w].interns[type] || 0) < meta.minInterns) {
                    const pool = seededShuffle(residents.filter(r => {
                        return r.level === 1 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, validCohortAssignments[r.id], dur) &&
                               (weekTypeCounts[w].interns[type] || 0) < meta.maxInterns;
                    })).sort((a, b) => getCumulativeReqCountFast(a.id, type) - 
                                     getCumulativeReqCountFast(b.id, type));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                    updateCounts(pool[0].id, pool[0].level, w, type, dur);
                }

                // Seniors
                while ((weekTypeCounts[w].seniors[type] || 0) < meta.minSeniors) {
                    const pool = seededShuffle(residents.filter(r => {
                        return r.level >= 2 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, validCohortAssignments[r.id], dur) &&
                               (weekTypeCounts[w].seniors[type] || 0) < meta.maxSeniors;
                    })).sort((a, b) => getCumulativeReqCountFast(a.id, type) - 
                                     getCumulativeReqCountFast(b.id, type));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                    updateCounts(pool[0].id, pool[0].level, w, type, dur);
                }
            });

            // Second: Fill pending requirements for residents who are free this week
            seededShuffle(residents).forEach(r => {
                if (newSchedule[r.id][w]?.assignment) return; // Already assigned

                const pendingReqs = seededShuffle(REQUIREMENTS[r.level] || []).filter(req => {
                    return getCumulativeReqCountFast(r.id, req.type) < req.target;
                });

                for (const req of pendingReqs) {
                    const dur = ROTATION_METADATA[req.type]?.duration || 4;
                    if (canFitBlock(newSchedule, r.id, w, dur) && isAligned(w, validCohortAssignments[r.id], dur)) {
                        const meta = ROTATION_METADATA[req.type];
                        const cI = weekTypeCounts[w].interns[req.type] || 0;
                        const cS = weekTypeCounts[w].seniors[req.type] || 0;
                        
                        if ((r.level === 1 && cI < meta.maxInterns) || (r.level > 1 && cS < meta.maxSeniors)) {
                            placeBlock(newSchedule, r.id, w, dur, req.type);
                            updateCounts(r.id, r.level, w, req.type, dur);
                            break;
                        }
                    }
                }
            });
        }

        // 3. Final Elective Fill
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
