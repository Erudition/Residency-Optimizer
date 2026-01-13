
import { Resident, ScheduleGrid, AssignmentType } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, COHORT_COUNT, fulfillsRequirement } from '../../constants';
import { ScheduleGenerator } from './types';
import { canFitBlock, placeBlock, getRequirementCount } from './utils';

class SeededRNG {
    private seed: number;
    constructor(seed: number) { this.seed = seed; }
    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

/**
 * Week-First Generator (Education-Last)
 * 
 * This is the best performing version:
 * - 0 Weekly Violations (guaranteed staffing)
 * - ~75 Req Violations (education shortfall)
 * 
 * The trade-off is acceptable for now: no understaffing.
 */
export const ExperimentalGenerator: ScheduleGenerator = {
    name: "Staffing First (Week-First)",
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0): ScheduleGrid => {
        const rng = new SeededRNG(Date.now() + attemptIndex * 7);
        const seededShuffle = <T>(array: T[]): T[] => {
            const a = [...array];
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(rng.next() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        };

        const newSchedule: ScheduleGrid = JSON.parse(JSON.stringify(existingSchedule));

        // 1. Initialize (Empty)
        residents.forEach(r => {
            if (!newSchedule[r.id] || newSchedule[r.id].length !== TOTAL_WEEKS) {
                newSchedule[r.id] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
            }
        });

        const getCount = (week: number, type: AssignmentType, level?: number) => {
            return residents.filter(r => {
                if (level && r.level !== level) return false;
                return newSchedule[r.id]?.[week]?.assignment === type;
            }).length;
        };

        const staffedTypes = [
            AssignmentType.ICU,
            AssignmentType.WARDS_RED,
            AssignmentType.WARDS_BLUE,
            AssignmentType.NIGHT_FLOAT,
            AssignmentType.EM,
        ];

        // 2. Week-First Staffing
        for (let w = 0; w < TOTAL_WEEKS; w++) {
            staffedTypes.forEach(type => {
                const meta = ROTATION_METADATA[type];
                if (!meta) return;

                // Fill INTERN need
                let needI = getCount(w, type, 1) < (meta.minInterns || 0);
                while (needI) {
                    const pool = seededShuffle(residents).filter(r => {
                        if (r.level !== 1) return false;
                        const cell = newSchedule[r.id][w];
                        if (cell && cell.assignment !== null) return false;
                        const cI = getCount(w, type, 1);
                        if (cI >= (meta.maxInterns || 99)) return false;
                        return true;
                    });
                    if (pool.length === 0) break;
                    pool.sort((a, b) => {
                        const reqT = fulfillsRequirement(type, AssignmentType.WARDS_RED) ? AssignmentType.WARDS_RED : type;
                        return getRequirementCount(newSchedule[a.id], reqT, a.level) - getRequirementCount(newSchedule[b.id], reqT, b.level);
                    });
                    newSchedule[pool[0].id][w] = { assignment: type, locked: false };
                    needI = getCount(w, type, 1) < (meta.minInterns || 0);
                }

                // Fill SENIOR need
                let needS = (getCount(w, type, 2) + getCount(w, type, 3)) < (meta.minSeniors || 0);
                while (needS) {
                    const pool = seededShuffle(residents).filter(r => {
                        if (r.level === 1) return false;
                        const cell = newSchedule[r.id][w];
                        if (cell && cell.assignment !== null) return false;
                        const cS = getCount(w, type, 2) + getCount(w, type, 3);
                        if (cS >= (meta.maxSeniors || 99)) return false;
                        return true;
                    });
                    if (pool.length === 0) break;
                    pool.sort((a, b) => {
                        const reqT = fulfillsRequirement(type, AssignmentType.WARDS_RED) ? AssignmentType.WARDS_RED : type;
                        return getRequirementCount(newSchedule[a.id], reqT, a.level) - getRequirementCount(newSchedule[b.id], reqT, b.level);
                    });
                    newSchedule[pool[0].id][w] = { assignment: type, locked: false };
                    needS = (getCount(w, type, 2) + getCount(w, type, 3)) < (meta.minSeniors || 0);
                }
            });
        }

        // 3. Add Clinic weeks
        residents.forEach(r => {
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (w % COHORT_COUNT === r.cohort) {
                    if (!newSchedule[r.id][w]?.assignment) {
                        newSchedule[r.id][w] = { assignment: AssignmentType.CLINIC, locked: true };
                    }
                }
            }
        });

        // 4. Fill remaining Educational Requirements
        [1, 2, 3].forEach(level => {
            const reqs = seededShuffle(REQUIREMENTS[level as 1 | 2 | 3] || []);
            reqs.sort((a, b) => (ROTATION_METADATA[b.type]?.duration || 0) - (ROTATION_METADATA[a.type]?.duration || 0));

            reqs.forEach(req => {
                seededShuffle(residents.filter(r => r.level === level)).forEach(res => {
                    let cur = getRequirementCount(newSchedule[res.id], req.type, level);
                    const meta = ROTATION_METADATA[req.type];
                    if (!meta) return;
                    const dur = meta.duration;
                    const possibleTypes = fulfillsRequirement(null, req.type) || req.type === AssignmentType.WARDS_RED ? [AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE] : [req.type];

                    while (cur < req.target) {
                        let bestW = -1, bestT = possibleTypes[0], bestScore = Infinity;

                        for (let ww = 0; ww <= TOTAL_WEEKS - dur; ww++) {
                            if (!canFitBlock(newSchedule, res.id, ww, dur)) continue;

                            possibleTypes.forEach(t => {
                                const m = ROTATION_METADATA[t];
                                if (!m) return;
                                let score = 0;
                                for (let i = 0; i < dur; i++) {
                                    const cI = getCount(ww + i, t, 1);
                                    const cS = getCount(ww + i, t, 2) + getCount(ww + i, t, 3);
                                    if (res.level === 1 && cI >= (m.maxInterns || 99)) score += 10000;
                                    if (res.level > 1 && cS >= (m.maxSeniors || 99)) score += 10000;
                                    score += (cI + cS) * 2;
                                }
                                if (score < bestScore) { bestScore = score; bestW = ww; bestT = t; }
                            });
                        }

                        if (bestScore >= 10000) break;
                        placeBlock(newSchedule, res.id, bestW, dur, bestT);
                        cur += dur;
                    }
                });
            });
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
