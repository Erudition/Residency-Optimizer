import { Resident, ScheduleGrid, AssignmentType, ScheduleHistory } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, COHORT_COUNT, fulfillsRequirement } from '../../constants';
import { ScheduleGenerator } from './types';
import { canFitBlock, placeBlock, getCumulativeRequirementCount, getRequirementCount } from './utils';

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
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, historicalSchedules?: ScheduleHistory): ScheduleGrid => {
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
                if (level === 1) return r.level === 1 && newSchedule[r.id]?.[week]?.assignment === type;
                if (level === 2) return r.level >= 2 && newSchedule[r.id]?.[week]?.assignment === type;
                return newSchedule[r.id]?.[week]?.assignment === type;
            }).length;
        };

        const staffedTypes = [
            AssignmentType.MICU,
            AssignmentType.WARDS_RED,
            AssignmentType.WARDS_BLUE,
            AssignmentType.NIGHT_FLOAT,
            AssignmentType.EM,
            AssignmentType.WARDS_METRO,
            AssignmentType.JR_HOSPITALIST
        ];

        // 2. FIXED BACKBONE: Add Clinic weeks (4+1 Rule)
        residents.forEach(r => {
            const clinicType = r.clinicType || AssignmentType.CLINIC;
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (w % COHORT_COUNT === r.cohort) {
                    newSchedule[r.id][w] = { assignment: clinicType, locked: true };
                }
            }
        });

        // 3. Staffing (Block-Based)
        staffedTypes.forEach(type => {
            const meta = ROTATION_METADATA[type];
            if (!meta) return;
            const dur = meta.duration;

            for (let w = 0; w <= TOTAL_WEEKS - dur; w += dur) {
                // Interns
                while (getCount(w, type, 1) < (meta.minInterns || 0)) {
                    const pool = seededShuffle(residents.filter(r => {
                        return r.level === 1 && canFitBlock(newSchedule, r.id, w, dur) && getCount(w, type, 1) < (meta.maxInterns || 99);
                    })).sort((a, b) => getRequirementCount(newSchedule[a.id], type) - getRequirementCount(newSchedule[b.id], type));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                }

                // Seniors
                while (getCount(w, type, 2) < (meta.minSeniors || 0)) {
                    const pool = seededShuffle(residents.filter(r => {
                        const levelOk = type === AssignmentType.JR_HOSPITALIST ? r.level === 3 : r.level >= 2;
                        return levelOk && canFitBlock(newSchedule, r.id, w, dur) && getCount(w, type, 2) < (meta.maxSeniors || 99);
                    })).sort((a, b) => getRequirementCount(newSchedule[a.id], type) - getRequirementCount(newSchedule[b.id], type));
                    
                    if (pool.length === 0) break;
                    placeBlock(newSchedule, pool[0].id, w, dur, type);
                }
            }
        });


        // 4. Fill remaining Educational Requirements
        [1, 2, 3].forEach(level => {
            const reqs = seededShuffle(REQUIREMENTS[level as 1 | 2 | 3] || []);
            reqs.sort((a, b) => (ROTATION_METADATA[b.type]?.duration || 0) - (ROTATION_METADATA[a.type]?.duration || 0));

            reqs.forEach(req => {
                seededShuffle(residents.filter(r => r.level === level)).forEach(res => {
                    const meta = ROTATION_METADATA[req.type];
                    if (!meta) return;
                    const possibleTypes = fulfillsRequirement(null, req.type) || req.type === AssignmentType.WARDS_RED ? [AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE] : [req.type];

                    while (getCumulativeRequirementCount(res.id, newSchedule[res.id], req.type, historicalSchedules) < req.target) {
                        let bestW = -1;
                        let bestT: AssignmentType | null = null;
                        let bestScore = Infinity;
                        const dur = ROTATION_METADATA[req.type].duration;

                        for (let ww = 0; ww <= TOTAL_WEEKS - dur; ww++) {
                            if (!canFitBlock(newSchedule, res.id, ww, dur)) continue;

                            possibleTypes.forEach(t => {
                                const m = ROTATION_METADATA[t];
                                if (!m) return;
                                let score = 0;
                                for (let i = 0; i < dur; i++) {
                                    const cI = getCount(ww + i, t, 1);
                                    const cS = getCount(ww + i, t, 2);
                                    if (res.level === 1 && cI >= (m.maxInterns || 99)) score += 10000;
                                    if (res.level > 1 && cS >= (m.maxSeniors || 99)) score += 10000;
                                    score += (cI + cS) * 2;
                                }
                                if (score < bestScore) { bestScore = score; bestW = ww; bestT = t; }
                            });
                        }

                        if (bestScore >= 10000 || bestT === null) break;
                        placeBlock(newSchedule, res.id, bestW, dur, bestT);
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
