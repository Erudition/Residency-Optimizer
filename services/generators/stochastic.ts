
import { Resident, ScheduleGrid, AssignmentType } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS } from '../../constants';
import { ScheduleGenerator } from './types';
import { canFitBlock, placeBlock, shuffle, getRequirementCount, isWards } from './utils';

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
    name: "Stochastic (Balanced Fill)",
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0): ScheduleGrid => {
        const rng = new SeededRNG(Date.now() + Math.random() * 1000 + attemptIndex * 7);

        const seededShuffle = <T>(array: T[]): T[] => {
            const newArray = [...array];
            for (let i = newArray.length - 1; i > 0; i--) {
                const j = Math.floor(rng.next() * (i + 1));
                [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
            }
            return newArray;
        };

        const newSchedule: ScheduleGrid = JSON.parse(JSON.stringify(existingSchedule));

        // 1. Initialize
        residents.forEach(r => {
            if (!newSchedule[r.id] || newSchedule[r.id].length !== TOTAL_WEEKS) {
                newSchedule[r.id] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
            }
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (w % 5 === r.cohort) {
                    newSchedule[r.id][w] = { assignment: AssignmentType.CLINIC, locked: true };
                }
            }
        });

        const getAssignedCount = (week: number, type: AssignmentType, level?: number) => {
            return residents.filter(r => {
                if (level && r.level !== level) return false;
                return newSchedule[r.id]?.[week]?.assignment === type;
            }).length;
        };

        const criticalTypes = [
            AssignmentType.ICU,
            AssignmentType.WARDS_RED,
            AssignmentType.WARDS_BLUE,
            AssignmentType.NIGHT_FLOAT,
            AssignmentType.EM,
            AssignmentType.MET_WARDS
        ];

        // 2. Foundation (Critical Staffing)
        criticalTypes.forEach(type => {
            const meta = ROTATION_METADATA[type];
            if (!meta) return;
            const duration = meta.duration || 4;
            const weeksIndices = seededShuffle(Array.from({ length: TOTAL_WEEKS - duration + 1 }, (_, i) => i));

            weeksIndices.forEach(w => {
                let nI = false, nS = false;
                const check = () => {
                    nI = false; nS = false;
                    for (let i = 0; i < duration; i++) {
                        if (getAssignedCount(w + i, type, 1) < (meta.minInterns || 0)) nI = true;
                        const s = getAssignedCount(w + i, type, 2) + getAssignedCount(w + i, type, 3);
                        if (s < (meta.minSeniors || 0)) nS = true;
                    }
                };
                check();

                while (nI || nS) {
                    const pool = residents.filter(r => {
                        if (r.level === 1 && !nI) return false;
                        if (r.level > 1 && !nS) return false;
                        for (let i = 0; i < duration; i++) {
                            const curI = getAssignedCount(w + i, type, 1);
                            const curS = getAssignedCount(w + i, type, 2) + getAssignedCount(w + i, type, 3);
                            if (r.level === 1 && curI >= (meta.maxInterns || 99)) return false;
                            if (r.level > 1 && curS >= (meta.maxSeniors || 99)) return false;
                        }
                        return canFitBlock(newSchedule, r.id, w, duration);
                    });

                    if (pool.length === 0) break;

                    pool.sort((a, b) => {
                        const reqT = isWards(type) ? AssignmentType.WARDS_RED : type;
                        const fA = getRequirementCount(newSchedule[a.id], reqT, a.level);
                        const tA = REQUIREMENTS[a.level]?.find(req => isWards(type) ? isWards(req.type) : req.type === type)?.target || 0;
                        const fB = getRequirementCount(newSchedule[b.id], reqT, b.level);
                        const tB = REQUIREMENTS[b.level]?.find(req => isWards(type) ? isWards(req.type) : req.type === type)?.target || 0;

                        const uA = fA < tA ? 0 : 1;
                        const uB = fB < tB ? 0 : 1;
                        if (uA !== uB) return uA - uB;

                        return (newSchedule[a.id].filter(x => x.assignment).length) - (newSchedule[b.id].filter(x => x.assignment).length);
                    });

                    placeBlock(newSchedule, pool[0].id, w, duration, type);
                    check();
                }
            });
        });

        // 3. Smart Fill (Educational Requirements)
        [1, 2, 3].forEach(level => {
            const reqs = seededShuffle(REQUIREMENTS[level as 1 | 2 | 3] || []);
            reqs.sort((a, b) => (ROTATION_METADATA[b.type]?.duration || 0) - (ROTATION_METADATA[a.type]?.duration || 0));

            reqs.forEach(req => {
                seededShuffle(residents.filter(r => r.level === level)).forEach(res => {
                    let cur = getRequirementCount(newSchedule[res.id], req.type, level);
                    const meta = ROTATION_METADATA[req.type];
                    if (!meta) return;
                    const dur = meta.duration;
                    const possibleTypes = isWards(req.type) ? [AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE, AssignmentType.MET_WARDS] : [req.type];

                    while (cur < req.target) {
                        let bestW = -1, bestT = possibleTypes[0], bestScore = Infinity;

                        for (let w = 0; w <= TOTAL_WEEKS - dur; w++) {
                            if (!canFitBlock(newSchedule, res.id, w, dur)) continue;

                            possibleTypes.forEach(t => {
                                const m = ROTATION_METADATA[t];
                                if (!m) return;
                                let score = 0;
                                for (let i = 0; i < dur; i++) {
                                    const cI = getAssignedCount(w + i, t, 1);
                                    const cS = getAssignedCount(w + i, t, 2) + getAssignedCount(w + i, t, 3);
                                    if (res.level === 1) {
                                        if (cI >= (m.maxInterns || 99)) score += 10000;
                                        if (cI < (m.minInterns || 0)) score -= 200;
                                    } else {
                                        if (cS >= (m.maxSeniors || 99)) score += 10000;
                                        if (cS < (m.minSeniors || 0)) score -= 200;
                                    }
                                    score += (cI + cS) * 2;
                                }
                                if (score < bestScore) {
                                    bestScore = score; bestW = w; bestT = t;
                                }
                            });
                        }

                        if (bestScore >= 10000) break;
                        placeBlock(newSchedule, res.id, bestW, dur, bestT);
                        cur += dur;
                    }
                });
            });
        });

        // 4. Balancer
        criticalTypes.forEach(type => {
            const meta = ROTATION_METADATA[type];
            const dur = meta?.duration || 4;
            for (let w = 0; w <= TOTAL_WEEKS - dur; w++) {
                let nI = getAssignedCount(w, type, 1) < (meta?.minInterns || 0);
                let nS = (getAssignedCount(w, type, 2) + getAssignedCount(w, type, 3)) < (meta?.minSeniors || 0);
                if (!nI && !nS) continue;

                const pool = residents.filter(r => {
                    if (nI && r.level !== 1) return false;
                    if (nS && r.level === 1) return false;
                    for (let i = 0; i < dur; i++) {
                        if (r.level === 1 && getAssignedCount(w + i, type, 1) >= (meta?.maxInterns || 99)) return false;
                        if (r.level > 1 && (getAssignedCount(w + i, type, 2) + getAssignedCount(w + i, type, 3)) >= (meta?.maxSeniors || 99)) return false;
                    }
                    return canFitBlock(newSchedule, r.id, w, dur);
                });
                if (pool.length > 0) {
                    pool.sort((a, b) => (newSchedule[a.id].filter(x => x.assignment).length) - (newSchedule[b.id].filter(x => x.assignment).length));
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                }
            }
        });

        // 5. Electives
        residents.forEach(r => {
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (!newSchedule[r.id][w]?.assignment) {
                    if (w < TOTAL_WEEKS - 1 && !newSchedule[r.id][w + 1]?.assignment) {
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
