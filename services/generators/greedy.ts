import { Resident, ScheduleGrid, AssignmentType, ScheduleHistory } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement } from '../../constants';
import { ScheduleGenerator } from './types';
import { canFitBlock, placeBlock, shuffle, getCumulativeRequirementCount } from './utils';

export const GreedyGenerator: ScheduleGenerator = {
    name: "Greedy (Legacy)",
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex?: number, historicalSchedules?: ScheduleHistory, cohortAssignments?: Record<string, number>): ScheduleGrid => {
        const newSchedule: ScheduleGrid = JSON.parse(JSON.stringify(existingSchedule));

        residents.forEach(r => {
            if (!newSchedule[r.id] || newSchedule[r.id].length !== TOTAL_WEEKS) {
                newSchedule[r.id] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
            } else {
                newSchedule[r.id] = newSchedule[r.id].map(cell => (cell && cell.locked) ? cell : { assignment: null, locked: false });
            }

            const cohort = cohortAssignments ? cohortAssignments[r.id] : 0;
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (w % 5 === cohort) {
                    newSchedule[r.id][w] = { assignment: AssignmentType.CLINIC, locked: true };
                }
            }
        });

        const findBestBalancedWindow = (resId: string, types: AssignmentType[], duration: number): { start: number, type: AssignmentType } => {
            let bestStart = -1;
            let bestType: AssignmentType = types[0];
            let minLoad = Infinity;

            const candidates: number[] = [];
            for (let w = 0; w <= TOTAL_WEEKS - duration; w++) {
                if (canFitBlock(newSchedule, resId, w, duration)) {
                    candidates.push(w);
                }
            }

            if (candidates.length === 0) return { start: -1, type: types[0] };

            shuffle(candidates).forEach(w => {
                types.forEach(type => {
                    let totalHeadcountInWindow = 0;
                    for (let i = 0; i < duration; i++) {
                        totalHeadcountInWindow += residents.filter(r => newSchedule[r.id]?.[w + i]?.assignment === type).length;
                    }

                    if (totalHeadcountInWindow < minLoad) {
                        minLoad = totalHeadcountInWindow;
                        bestStart = w;
                        bestType = type;
                    }
                });
            });

            return { start: bestStart, type: bestType };
        };

        const coreStaffingTypes = [AssignmentType.MICU, AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE, AssignmentType.NIGHT_FLOAT, AssignmentType.EM];

        for (let w = 0; w < TOTAL_WEEKS; w++) {
            shuffle(coreStaffingTypes).forEach(type => {
                const meta = ROTATION_METADATA[type];
                const duration = meta.duration || 4;

                let safety = 0;
                while (safety < 10) {
                    const currentlyAssigned = residents.filter(r => newSchedule[r.id]?.[w]?.assignment === type);
                    let interns = currentlyAssigned.filter(r => r.level === 1).length;
                    let seniors = currentlyAssigned.filter(r => r.level > 1).length;

                    const needsIntern = interns < meta.minInterns;
                    const needsSenior = seniors < meta.minSeniors;

                    if (!needsIntern && !needsSenior) break;

                    const candidate = shuffle(residents).find(r => {
                        if (needsIntern && r.level !== 1) return false;
                        if (needsSenior && r.level === 1) return false;
                        return !newSchedule[r.id][w].assignment; // Must be free this week
                    });

                    if (candidate) {
                        // Place for as long as possible up to duration
                        let d = 1;
                        while (d < duration && w + d < TOTAL_WEEKS && !newSchedule[candidate.id][w + d].assignment) d++;
                        placeBlock(newSchedule, candidate.id, w, d, type);
                        if (candidate.level === 1) interns++; else seniors++;
                    } else break;
                    safety++;
                }
            });
        }

        [1, 2, 3].forEach(level => {
            const pgyRequirements = REQUIREMENTS[level as 1 | 2 | 3] || [];

            pgyRequirements.forEach(req => {
                shuffle(residents.filter(r => r.level === level)).forEach(res => {
                    const current = getCumulativeRequirementCount(res.id, newSchedule[res.id], req.type, historicalSchedules);
                    const meta = ROTATION_METADATA[req.type];
                    if (!meta) return;

                    // FIX: Use meta duration for NF as well, don't hardcode 2
                    const duration = meta.duration;
                    const typesToTry = fulfillsRequirement(null, req.type) || req.type === AssignmentType.WARDS_RED
                        ? [AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE]
                        : [req.type];

                    while (getCumulativeRequirementCount(res.id, newSchedule[res.id], req.type, historicalSchedules) < req.target) {
                        const best = findBestBalancedWindow(res.id, typesToTry, duration);
                        if (best.start === -1) break;

                        const currentStaff = residents.filter(r => newSchedule[r.id]?.[best.start]?.assignment === best.type).length;
                        const typeMeta = ROTATION_METADATA[best.type];
                        const maxAllowed = (res.level === 1 ? typeMeta.maxInterns : typeMeta.maxSeniors) + 1;

                        if (currentStaff < maxAllowed) {
                            placeBlock(newSchedule, res.id, best.start, duration, best.type);
                        } else break;
                    }
                });
            });
        });

        residents.forEach(r => {
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (!newSchedule[r.id][w] || newSchedule[r.id][w].assignment === null) {
                    if (w < TOTAL_WEEKS - 1 && (!newSchedule[r.id][w + 1] || newSchedule[r.id][w + 1].assignment === null)) {
                        placeBlock(newSchedule, r.id, w, 2, AssignmentType.ELECTIVE);
                        w++;
                    } else {
                        newSchedule[r.id][w] = { assignment: AssignmentType.ELECTIVE, locked: false };
                    }
                }
            }
        });

        return newSchedule;
    }
};
