import { Resident, ScheduleGrid, AssignmentType, ScheduleGenerator } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement, COHORT_COUNT } from '../../constants';

import { canFitBlock, placeBlock, getYearRequirementCount, getPriorRequirementCount, isAligned, getAssignedCount } from './utils';


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
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number>): ScheduleGrid => {
        const rng = new SeededRNG(42 + attemptIndex);

        const totalWeeks = Object.values(existingSchedule)[0]?.length || TOTAL_WEEKS;

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
        const historicalCounts: Record<string, Record<string, number>> = priorRequirementCounts || {};
        const currentCounts: Record<string, Record<string, number>> = {};
        const weekTypeCounts: { interns: Record<string, number>, seniors: Record<string, number> }[] = [];
        for (let w = 0; w < totalWeeks; w++) {
            weekTypeCounts[w] = { interns: {}, seniors: {} };
        }

        const updateCounts = (rId: string, baseLevel: number, week: number, type: AssignmentType, dur: number) => {
            for (let i = 0; i < dur; i++) {
                const w = week + i;
                if (w >= totalWeeks) continue;
                const currentPgy = Math.min(3, Math.floor(w / 52) + baseLevel);
                if (currentPgy === 1) weekTypeCounts[w].interns[type] = (weekTypeCounts[w].interns[type] || 0) + 1;
                else weekTypeCounts[w].seniors[type] = (weekTypeCounts[w].seniors[type] || 0) + 1;
            }
        };

        residents.forEach(r => {
            currentCounts[r.id] = {};

            // Track existing assignments
            if (existingSchedule[r.id]) {
                existingSchedule[r.id].forEach((cell, w) => {
                    if (cell && cell.assignment) {
                        updateCounts(r.id, r.level, w, cell.assignment, 1);
                    }
                });
            }
        });

        const getReqCountFast = (rId: string, type: AssignmentType, week: number): number => {
            const yearIndex = Math.floor(week / 52);
            const yearStart = yearIndex * 52;
            const yearEnd = yearStart + 52;
            return getYearRequirementCount(newSchedule[rId], type, yearStart, yearEnd);
        };

        const getReqCountCumulative = (rId: string, type: AssignmentType, week: number): number => {
            return getYearRequirementCount(newSchedule[rId], type, 0, week) + getPriorRequirementCount(historicalCounts[rId] || {}, type);
        };


        const isResidentActive = (r: Resident, w: number) => {
            if (r.activeWeekStart !== undefined && w < r.activeWeekStart) return false;
            if (r.activeWeekEnd !== undefined && w > r.activeWeekEnd) return false;
            return true;
        };

        const getPgyAtWeek = (r: Resident, w: number) => {
            return Math.min(3, Math.floor(w / 52) + r.level);
        };

        // 1. Initialize & Clinic Lock
        residents.forEach(r => {
            if (!newSchedule[r.id] || newSchedule[r.id].length !== totalWeeks) {
                newSchedule[r.id] = Array(totalWeeks).fill(null).map(() => ({ assignment: null, locked: false }));
            }
            const cohort = validCohortAssignments[r.id] ?? 0;
            const row = newSchedule[r.id];
            for (let w = 0; w < row.length; w++) {
                if (!isResidentActive(r, w)) continue;
                if (w % COHORT_COUNT === cohort) {
                    if (row[w].locked) continue;
                    if (!row[w].assignment) {
                        const pgy = getPgyAtWeek(r, w);
                        const weeklyClinicType = (pgy === 2) ? AssignmentType.NIMA_CLINIC : AssignmentType.CLINIC;
                        newSchedule[r.id][w] = { assignment: weeklyClinicType, locked: true };
                        updateCounts(r.id, r.level, w, weeklyClinicType, 1);
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

        for (let w = 0; w < totalWeeks; w++) {
            // First: Fill mandatory floors for this specific week
            seededShuffle(criticalStaffingTypes).forEach(type => {
                const meta = ROTATION_METADATA[type];
                if (!meta) return;
                const dur = meta.duration || 4;

                // Interns
                while ((weekTypeCounts[w].interns[type] || 0) < meta.minInterns) {
                    const pool = seededShuffle(residents.filter(r => {
                        const currentPgy = getPgyAtWeek(r, w);
                        return isResidentActive(r, w) &&
                               currentPgy === 1 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, validCohortAssignments[r.id], dur) &&
                               (weekTypeCounts[w].interns[type] || 0) < meta.maxInterns;
                    })).sort((a, b) => getReqCountCumulative(a.id, type, w) - 
                                     getReqCountCumulative(b.id, type, w));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                    updateCounts(pool[0].id, pool[0].level, w, type, dur);
                }

                // Seniors
                while ((weekTypeCounts[w].seniors[type] || 0) < meta.minSeniors) {
                    const pool = seededShuffle(residents.filter(r => {
                        const currentPgy = getPgyAtWeek(r, w);
                        return isResidentActive(r, w) &&
                               currentPgy >= 2 && 
                               canFitBlock(newSchedule, r.id, w, dur) && 
                               isAligned(w, validCohortAssignments[r.id], dur) &&
                               (weekTypeCounts[w].seniors[type] || 0) < meta.maxSeniors;
                    })).sort((a, b) => getReqCountCumulative(a.id, type, w) - 
                                     getReqCountCumulative(b.id, type, w));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                    updateCounts(pool[0].id, pool[0].level, w, type, dur);
                }
            });

            // Second: Fill pending requirements for residents who are free this week
            seededShuffle(residents).forEach(r => {
                if (!isResidentActive(r, w) || (newSchedule[r.id][w]?.assignment)) return; // Inactive or already assigned

                const currentPgy = getPgyAtWeek(r, w);
                const pendingReqs = seededShuffle(REQUIREMENTS[currentPgy] || []).filter(req => {
                    return getReqCountFast(r.id, req.type, w) < req.minWeeks;
                });
                for (const req of pendingReqs) {
                    const dur = ROTATION_METADATA[req.type]?.duration || 4;
                    if (canFitBlock(newSchedule, r.id, w, dur) && isAligned(w, validCohortAssignments[r.id], dur)) {
                        const meta = ROTATION_METADATA[req.type];
                        const cI = weekTypeCounts[w].interns[req.type] || 0;
                        const cS = weekTypeCounts[w].seniors[req.type] || 0;
                        
                        if ((currentPgy === 1 && cI < meta.maxInterns) || (currentPgy > 1 && cS < meta.maxSeniors)) {
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
            const row = newSchedule[r.id];
            for (let w = 0; w < row.length; w++) {
                if (isResidentActive(r, w) && !row[w]?.assignment) {
                    row[w] = { assignment: AssignmentType.ELECTIVE, locked: false };
                }
            }
        });

        return newSchedule;
    }
};
