import { Resident, ScheduleGrid, AssignmentType, ScheduleHistory, ScheduleGenerator } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, fulfillsRequirement, COHORT_COUNT } from '../../constants';

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

const getWeeklyViolationsCount = (residents: Resident[], schedule: ScheduleGrid): number => {
    let count = 0;
    for (let week = 0; week < TOTAL_WEEKS; week++) {
        const assignments = residents.map(r => schedule[r.id]?.[week]?.assignment);
        const clinicCount = assignments.filter(a => a === AssignmentType.CLINIC || a === AssignmentType.NIMA_CLINIC).length;
        if (clinicCount === 0) {
            count++;
        }

        Object.values(AssignmentType).forEach(type => {
            const meta = ROTATION_METADATA[type];
            if (!meta) return;

            const assignees = residents.filter(r => schedule[r.id]?.[week]?.assignment === type);
            const interns = assignees.filter(r => r.level === 1).length;
            const seniors = assignees.filter(r => r.level > 1).length;

            if (interns < meta.minInterns || interns > meta.maxInterns) {
                count++;
            }
            if (seniors < meta.minSeniors || seniors > meta.maxSeniors) {
                count++;
            }
        });
    }
    return count;
};

const getContinuityScore = (residents: Resident[], schedule: ScheduleGrid): number => {
    let score = 0;
    residents.forEach(r => {
        const row = schedule[r.id];
        if (!row) return;
        for (let w = 0; w < TOTAL_WEEKS - 1; w++) {
            if (row[w]?.assignment === row[w+1]?.assignment) {
                score++;
            }
        }
    });
    return score;
};

export const ExactConstraintGenerator: ScheduleGenerator = {
    name: "Zero Violations Exact Solver",
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, historicalSchedules?: ScheduleHistory, cohortAssignments?: Record<string, number>): ScheduleGrid => {
        const rng = new SeededRNG(42 + attemptIndex);
        
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

        const availableWeeks: Record<string, number[]> = {};
        const neededPerResident: Record<string, AssignmentType[]> = {};

        residents.forEach(r => {
            const cohort = validCohortAssignments[r.id] ?? 0;
            availableWeeks[r.id] = [];
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                const isClinic = w % COHORT_COUNT === cohort;
                const isLocked = existingSchedule && existingSchedule[r.id] && existingSchedule[r.id][w]?.locked;
                if (!isClinic && !isLocked) {
                    availableWeeks[r.id].push(w);
                }
            }

            const reqs = REQUIREMENTS[r.level as 1 | 2 | 3] || [];
            const needed: AssignmentType[] = [];

            reqs.forEach(req => {
                let count = 0;
                if (historicalSchedules) {
                    for (const yearStr in historicalSchedules) {
                        const yearRow = historicalSchedules[yearStr][r.id];
                        if (yearRow) {
                            yearRow.forEach(cell => {
                                if (cell && cell.assignment && fulfillsRequirement(cell.assignment, req.type)) {
                                    count++;
                                }
                            });
                        }
                    }
                }
                if (existingSchedule && existingSchedule[r.id]) {
                    existingSchedule[r.id].forEach(cell => {
                        if (cell && cell.locked && cell.assignment && fulfillsRequirement(cell.assignment, req.type)) {
                            count++;
                        }
                    });
                }
                const remaining = Math.max(0, req.target - count);
                for (let i = 0; i < remaining; i++) {
                    needed.push(req.type);
                }
            });

            while (needed.length > availableWeeks[r.id].length) {
                needed.pop();
            }
            while (needed.length < availableWeeks[r.id].length) {
                needed.push(AssignmentType.ELECTIVE);
            }

            neededPerResident[r.id] = needed;
        });

        const getWeekViolations = (week: number, currentSchedule: ScheduleGrid): number => {
            let count = 0;
            const assignments = residents.map(r => currentSchedule[r.id]?.[week]?.assignment);
            const clinicCount = assignments.filter(a => a === AssignmentType.CLINIC || a === AssignmentType.NIMA_CLINIC).length;
            if (clinicCount === 0) {
                count += 100;
            }

            const typeCounts: Record<AssignmentType, { interns: number, seniors: number }> = {} as any;
            Object.values(AssignmentType).forEach(t => typeCounts[t] = { interns: 0, seniors: 0 });

            residents.forEach(r => {
                const a = currentSchedule[r.id]?.[week]?.assignment;
                if (a && typeCounts[a]) {
                    if (r.level === 1) typeCounts[a].interns++;
                    else typeCounts[a].seniors++;
                }
            });

            Object.values(AssignmentType).forEach(type => {
                const meta = ROTATION_METADATA[type];
                if (!meta) return;
                const c = typeCounts[type];
                if (c.interns < meta.minInterns) count += (meta.minInterns - c.interns);
                if (c.interns > meta.maxInterns) count += (c.interns - meta.maxInterns);
                if (c.seniors < meta.minSeniors) count += (meta.minSeniors - c.seniors);
                if (c.seniors > meta.maxSeniors) count += (c.seniors - meta.maxSeniors);
            });

            return count;
        };

        const getResidentReqViolations = (r: Resident, currentSchedule: ScheduleGrid): number => {
            let count = 0;
            const reqs = REQUIREMENTS[r.level as 1 | 2 | 3] || [];
            
            reqs.forEach(req => {
                let actual = 0;
                if (historicalSchedules) {
                    for (const yearStr in historicalSchedules) {
                        const yearRow = historicalSchedules[yearStr][r.id];
                        if (yearRow) {
                            yearRow.forEach(cell => {
                                if (cell && cell.assignment && fulfillsRequirement(cell.assignment, req.type)) {
                                    actual++;
                                }
                            });
                        }
                    }
                }
                const yearRow = currentSchedule[r.id];
                if (yearRow) {
                    yearRow.forEach(cell => {
                        if (cell && cell.assignment && fulfillsRequirement(cell.assignment, req.type)) {
                            actual++;
                        }
                    });
                }
                if (actual < req.target) {
                    count += (req.target - actual);
                }
            });
            return count;
        };

        let bestGlobalSchedule: ScheduleGrid = {};
        let minGlobalViolations = Infinity;

        const allAssignmentTypes = Object.values(AssignmentType);

        for (let seedIdx = 0; seedIdx < 10; seedIdx++) {
            const currentSchedule: ScheduleGrid = {};
            residents.forEach(r => {
                currentSchedule[r.id] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
                const cohort = validCohortAssignments[r.id] ?? 0;

                for (let w = 0; w < TOTAL_WEEKS; w++) {
                    if (w % COHORT_COUNT === cohort) {
                        currentSchedule[r.id][w] = { assignment: r.clinicType || (r.level === 2 ? AssignmentType.NIMA_CLINIC : AssignmentType.CLINIC), locked: true };
                    } else if (existingSchedule && existingSchedule[r.id] && existingSchedule[r.id][w]?.locked) {
                        currentSchedule[r.id][w] = { ...existingSchedule[r.id][w] };
                    }
                }

                const needed = [...neededPerResident[r.id]];
                for (let i = needed.length - 1; i > 0; i--) {
                    const j = Math.floor(rng.next() * (i + 1));
                    [needed[i], needed[j]] = [needed[j], needed[i]];
                }
                availableWeeks[r.id].forEach((w, idx) => {
                    currentSchedule[r.id][w] = { assignment: needed[idx] || AssignmentType.ELECTIVE, locked: false };
                });
            });

            let weeklyViolations = 0;
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                weeklyViolations += getWeekViolations(w, currentSchedule);
            }

            let reqViolations = 0;
            residents.forEach(r => {
                reqViolations += getResidentReqViolations(r, currentSchedule);
            });

            if (weeklyViolations === 0 && reqViolations === 0) {
                return currentSchedule;
            }

            let T = 1.0;
            const maxSteps = 150000;

            for (let step = 0; step < maxSteps; step++) {
                T *= 0.99999;
                const moveType = rng.next();

                if (moveType < 0.33) {
                    // Type 1: Swap weeks for the same resident
                    const r = residents[Math.floor(rng.next() * residents.length)];
                    const weeks = availableWeeks[r.id];
                    if (weeks.length < 2) continue;

                    const idxA = Math.floor(rng.next() * weeks.length);
                    let idxB = Math.floor(rng.next() * weeks.length);
                    while (idxB === idxA) {
                        idxB = Math.floor(rng.next() * weeks.length);
                    }

                    const w1 = weeks[idxA];
                    const w2 = weeks[idxB];

                    const a1 = currentSchedule[r.id][w1].assignment;
                    const a2 = currentSchedule[r.id][w2].assignment;
                    if (a1 === a2) continue;

                    const oldV1 = getWeekViolations(w1, currentSchedule);
                    const oldV2 = getWeekViolations(w2, currentSchedule);

                    currentSchedule[r.id][w1].assignment = a2;
                    currentSchedule[r.id][w2].assignment = a1;

                    const newV1 = getWeekViolations(w1, currentSchedule);
                    const newV2 = getWeekViolations(w2, currentSchedule);

                    const delta = (newV1 + newV2) - (oldV1 + oldV2);

                    if (delta <= 0 || rng.next() < Math.exp(-delta / (T * 10))) {
                        weeklyViolations += delta;
                        if (weeklyViolations === 0 && reqViolations === 0) {
                            return currentSchedule;
                        }
                    } else {
                        currentSchedule[r.id][w1].assignment = a1;
                        currentSchedule[r.id][w2].assignment = a2;
                    }
                } else if (moveType < 0.66) {
                    // Type 2: Swap assignments for two residents in same week
                    const w = Math.floor(rng.next() * TOTAL_WEEKS);
                    const level = (Math.floor(rng.next() * 3) + 1) as 1 | 2 | 3;

                    const sameLevelAvailable = residents.filter(r => 
                        r.level === level && 
                        availableWeeks[r.id].includes(w)
                    );
                    if (sameLevelAvailable.length < 2) continue;

                    const idxA = Math.floor(rng.next() * sameLevelAvailable.length);
                    let idxB = Math.floor(rng.next() * sameLevelAvailable.length);
                    while (idxB === idxA) {
                        idxB = Math.floor(rng.next() * sameLevelAvailable.length);
                    }

                    const r1 = sameLevelAvailable[idxA];
                    const r2 = sameLevelAvailable[idxB];

                    const a1 = currentSchedule[r1.id][w].assignment;
                    const a2 = currentSchedule[r2.id][w].assignment;
                    if (a1 === a2) continue;

                    const oldV1 = getWeekViolations(w, currentSchedule);
                    const oldReq1 = getResidentReqViolations(r1, currentSchedule);
                    const oldReq2 = getResidentReqViolations(r2, currentSchedule);

                    currentSchedule[r1.id][w].assignment = a2;
                    currentSchedule[r2.id][w].assignment = a1;

                    const newV1 = getWeekViolations(w, currentSchedule);
                    const newReq1 = getResidentReqViolations(r1, currentSchedule);
                    const newReq2 = getResidentReqViolations(r2, currentSchedule);

                    const deltaWeekly = newV1 - oldV1;
                    const deltaReq = (newReq1 + newReq2) - (oldReq1 + oldReq2);

                    const delta = deltaWeekly * 10 + deltaReq * 500;

                    if (delta <= 0 || rng.next() < Math.exp(-delta / (T * 10))) {
                        weeklyViolations += deltaWeekly;
                        reqViolations += deltaReq;
                        if (weeklyViolations === 0 && reqViolations === 0) {
                            return currentSchedule;
                        }
                    } else {
                        currentSchedule[r1.id][w].assignment = a1;
                        currentSchedule[r2.id][w].assignment = a2;
                    }
                } else {
                    // Type 3: Change assignment type in single week
                    const r = residents[Math.floor(rng.next() * residents.length)];
                    const weeks = availableWeeks[r.id];
                    if (weeks.length === 0) continue;

                    const w = weeks[Math.floor(rng.next() * weeks.length)];
                    const a1 = currentSchedule[r.id][w].assignment;
                    const a2 = allAssignmentTypes[Math.floor(rng.next() * allAssignmentTypes.length)];
                    if (a1 === a2) continue;

                    const oldV1 = getWeekViolations(w, currentSchedule);
                    const oldReq1 = getResidentReqViolations(r, currentSchedule);

                    currentSchedule[r.id][w].assignment = a2;

                    const newV1 = getWeekViolations(w, currentSchedule);
                    const newReq1 = getResidentReqViolations(r, currentSchedule);

                    const deltaWeekly = newV1 - oldV1;
                    const deltaReq = newReq1 - oldReq1;

                    const delta = deltaWeekly * 10 + deltaReq * 500;

                    if (delta <= 0 || rng.next() < Math.exp(-delta / (T * 10))) {
                        weeklyViolations += deltaWeekly;
                        reqViolations += deltaReq;
                        if (weeklyViolations === 0 && reqViolations === 0) {
                            return currentSchedule;
                        }
                    } else {
                        currentSchedule[r.id][w].assignment = a1;
                    }
                }
            }

            const totalV = weeklyViolations + reqViolations;
            if (totalV < minGlobalViolations) {
                minGlobalViolations = totalV;
                bestGlobalSchedule = JSON.parse(JSON.stringify(currentSchedule));
            }
        }

        return bestGlobalSchedule;
    }
}
