import { buildLevelRequirements } from './reqBuilder';
import { RequirementsEngine } from '../requirementsEngine';
import { Resident, ScheduleGrid, AssignmentType, ScheduleGenerator } from '../../types';
import type { ProgramData } from '../api/client';
import { TOTAL_WEEKS } from '../../constants';

import { canFitBlock, placeBlock, getYearRequirementCount, getPriorRequirementCount, isAligned, getAssignedCount, getCohortAtWeek, getStandardCohortMap, getCappedDuration, getPgy } from './utils';
import { isClinicRotation, getClinicCodenames } from '../programDataUtils';


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
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, programData: ProgramData, attemptIndex: number = 0, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number> | Record<number, Record<string, number>>): ScheduleGrid => {
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

        let validCohortAssignments: any = cohortAssignments || programData?.cycleConfig?.assignments || {};
        if (!validCohortAssignments || Object.keys(validCohortAssignments).length === 0) {
            validCohortAssignments = getStandardCohortMap(residents, programData);
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
                if (!weekTypeCounts[w]) weekTypeCounts[w] = { interns: {}, seniors: {} };
                const rObj = residents.find(res => res.id === rId);
                const currentPgy = rObj ? getPgy(rObj, w, residents) : Math.min(3, Math.floor(w / 52) + baseLevel);
                if (currentPgy === 1) {
                    if (!weekTypeCounts[w].interns) weekTypeCounts[w].interns = {};
                    weekTypeCounts[w].interns[type] = (weekTypeCounts[w].interns[type] || 0) + 1;
                } else {
                    if (!weekTypeCounts[w].seniors) weekTypeCounts[w].seniors = {};
                    weekTypeCounts[w].seniors[type] = (weekTypeCounts[w].seniors[type] || 0) + 1;
                }
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
            return getYearRequirementCount(newSchedule[rId], type, yearStart, yearEnd, programData);
        };

        const getReqCountCumulative = (rId: string, type: AssignmentType, week: number): number => {
            return getYearRequirementCount(newSchedule[rId], type, 0, week, programData) + getPriorRequirementCount(historicalCounts[rId] || {}, type);
        };


        const isResidentActive = (r: Resident, w: number) => {
            if (r.activeWeekStart !== undefined && w < r.activeWeekStart) return false;
            if (r.activeWeekEnd !== undefined && w >= r.activeWeekEnd) return false;
            return true;
        };

        const getPgyAtWeek = (r: Resident, w: number) => {
            return getPgy(r, w, residents);
        };

        // 1. Initialize & Clinic Lock
        residents.forEach(r => {
            if (!newSchedule[r.id] || newSchedule[r.id].length !== totalWeeks) {
                newSchedule[r.id] = Array(totalWeeks).fill(null).map(() => ({ assignment: null, locked: false }));
            }
            const row = newSchedule[r.id];
            for (let w = 0; w < row.length; w++) {
                if (!isResidentActive(r, w)) continue;
                const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                const { Y, Z } = programData.cycleConfig;
                const isClinic = Math.floor((w % Z) / Y) === cohort;
                if (isClinic) {
                    if (row[w].locked) continue;
                    if (!row[w].assignment) {
                        const defaultClinicRotation = getClinicCodenames(programData)[0] || 'CLINIC';
                        const weeklyClinicType = (programData.cycleConfig as any).clinicAssignments?.[r.id] || defaultClinicRotation;
                        newSchedule[r.id][w] = { assignment: weeklyClinicType, locked: true };
                        updateCounts(r.id, r.level, w, weeklyClinicType, 1);
                    }
                }
            }
        });

        // 2. Sequential Temporal Placement
        // Dynamically determine which rotations have staffing floors from programData
        // instead of using hardcoded codename lists.
        const criticalStaffingTypes: string[] = [];
        for (const [codename, config] of programData.rotations.entries()) {
            if (isClinicRotation(programData, codename)) continue;
            if ((config.minInterns && config.minInterns > 0) || (config.minSeniors && config.minSeniors > 0)) {
                criticalStaffingTypes.push(codename);
            }
        }

        for (let w = 0; w < totalWeeks; w++) {
            // First: Fill mandatory floors for this specific week
            seededShuffle(criticalStaffingTypes).forEach(type => {
                const meta = programData.rotations.get(type);
                if (!meta) return;
                const dur = meta.duration || programData.cycleConfig.X;

                // Interns
                while ((weekTypeCounts[w].interns[type] || 0) < meta.minInterns) {
                    const pool = seededShuffle(residents.map(r => {
                        const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                        const residentDur = getCappedDuration(w, cohort, dur, totalWeeks, programData);
                        return { r, cohort, residentDur };
                    }).filter(({ r, cohort, residentDur }) => {
                        const currentPgy = getPgyAtWeek(r, w);
                        return residentDur > 0 &&
                               isResidentActive(r, w) &&
                               currentPgy === 1 && 
                               canFitBlock(newSchedule, r.id, w, residentDur) && 
                               isAligned(w, cohort, residentDur, programData) &&
                               (weekTypeCounts[w].interns[type] || 0) < meta.maxInterns;
                    })).sort((a, b) => getReqCountCumulative(a.r.id, type, w) - 
                                     getReqCountCumulative(b.r.id, type, w));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].r.id, w, pool[0].residentDur, type);
                    updateCounts(pool[0].r.id, getPgyAtWeek(pool[0].r, w), w, type, pool[0].residentDur);
                }

                // Seniors
                while ((weekTypeCounts[w].seniors[type] || 0) < meta.minSeniors) {
                    const pool = seededShuffle(residents.map(r => {
                        const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                        const residentDur = getCappedDuration(w, cohort, dur, totalWeeks, programData);
                        return { r, cohort, residentDur };
                    }).filter(({ r, cohort, residentDur }) => {
                        const currentPgy = getPgyAtWeek(r, w);
                        return residentDur > 0 &&
                               isResidentActive(r, w) &&
                               currentPgy >= 2 && 
                               canFitBlock(newSchedule, r.id, w, residentDur) && 
                               isAligned(w, cohort, residentDur, programData) &&
                               (weekTypeCounts[w].seniors[type] || 0) < meta.maxSeniors;
                    })).sort((a, b) => getReqCountCumulative(a.r.id, type, w) - 
                                     getReqCountCumulative(b.r.id, type, w));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].r.id, w, pool[0].residentDur, type);
                    updateCounts(pool[0].r.id, getPgyAtWeek(pool[0].r, w), w, type, pool[0].residentDur);
                }
            });

            // Second: Fill pending requirements for residents who are free this week
            seededShuffle(residents).forEach(r => {
                if (!isResidentActive(r, w) || (newSchedule[r.id][w]?.assignment)) return; // Inactive or already assigned

                const currentPgy = getPgyAtWeek(r, w);
                const pendingReqs = seededShuffle(buildLevelRequirements(programData, currentPgy) || []).filter(req => {
                    return !isClinicRotation(programData, req.type) && getReqCountFast(r.id, req.type, w) < req.minWeeks;
                });
                for (const req of pendingReqs) {
                    const dur = (programData.rotations.get(req.type)?.duration || programData.cycleConfig.X);
                    const cohort = getCohortAtWeek(r, w, validCohortAssignments);
                    const residentDur = getCappedDuration(w, cohort, dur, totalWeeks, programData);
                    if (residentDur <= 0) continue;

                    if (canFitBlock(newSchedule, r.id, w, residentDur) && isAligned(w, cohort, residentDur, programData)) {
                        const meta = programData.rotations.get(req.type);
                        
                        let possible = true;
                        for (let i = 0; i < residentDur; i++) {
                            const cI = weekTypeCounts[w + i]?.interns[req.type] || 0;
                            const cS = weekTypeCounts[w + i]?.seniors[req.type] || 0;
                            if (currentPgy === 1 && cI >= (meta?.maxInterns ?? 99)) { possible = false; break; }
                            if (currentPgy > 1 && cS >= (meta?.maxSeniors ?? 99)) { possible = false; break; }
                        }
                        
                        if (possible) {
                            placeBlock(newSchedule, r.id, w, residentDur, req.type);
                            updateCounts(r.id, currentPgy, w, req.type, residentDur);
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
                    row[w] = { assignment: 'ELEC', locked: false };
                }
            }
        });

        return newSchedule;
    }
};
