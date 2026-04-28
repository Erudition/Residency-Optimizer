import { Resident, ScheduleGrid, AssignmentType, ScheduleHistory } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, COHORT_COUNT, fulfillsRequirement, ELECTIVE_TYPES, REQUIRED_TYPES } from '../../constants';
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
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, historicalSchedules?: ScheduleHistory, cohortAssignments?: Record<string, number>): ScheduleGrid => {
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
            const cohort = cohortAssignments ? cohortAssignments[r.id] : 0;
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (w % COHORT_COUNT === cohort) {
                    newSchedule[r.id][w] = { assignment: clinicType, locked: true };
                }
            }
        });

        // 3. Staffing (Gap-Based)
        // We identify all "Gaps" (contiguous free weeks) for each resident and fill them to satisfy staffing requirements.
        staffedTypes.forEach(type => {
            const meta = ROTATION_METADATA[type];
            if (!meta) return;

            // Simple week-by-week backfill to ensure absolute staffing minimums
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                // Interns
                while (getCount(w, type, 1) < (meta.minInterns || 0)) {
                    const pool = seededShuffle(residents.filter(r => {
                        return r.level === 1 && !newSchedule[r.id][w].assignment && getCount(w, type, 1) < (meta.maxInterns || 99);
                    })).sort((a, b) => getRequirementCount(newSchedule[a.id], type) - getRequirementCount(newSchedule[b.id], type));
                    
                    if (pool.length === 0) break;
                    
                    // Try to place as long a block as possible (up to meta.duration)
                    let d = 1;
                    while (d < meta.duration && w + d < TOTAL_WEEKS && !newSchedule[pool[0].id][w + d].assignment) d++;
                    placeBlock(newSchedule, pool[0].id, w, d, type);
                }

                // Seniors
                while (getCount(w, type, 2) < (meta.minSeniors || 0)) {
                    const pool = seededShuffle(residents.filter(r => {
                        const levelOk = type === AssignmentType.JR_HOSPITALIST ? r.level === 3 : r.level >= 2;
                        return levelOk && !newSchedule[r.id][w].assignment && getCount(w, type, 2) < (meta.maxSeniors || 99);
                    })).sort((a, b) => getRequirementCount(newSchedule[a.id], type) - getRequirementCount(newSchedule[b.id], type));
                    
                    if (pool.length === 0) break;

                    let d = 1;
                    while (d < meta.duration && w + d < TOTAL_WEEKS && !newSchedule[pool[0].id][w + d].assignment) d++;
                    placeBlock(newSchedule, pool[0].id, w, d, type);
                }
            }
        });


        // 4. Fill remaining Educational Requirements
        [1, 2, 3].forEach(level => {
            const reqs = seededShuffle(REQUIREMENTS[level as 1 | 2 | 3] || []);
            reqs.sort((a, b) => (ROTATION_METADATA[b.type]?.duration || 0) - (ROTATION_METADATA[a.type]?.duration || 0));

            reqs.forEach(req => {
                const meta = ROTATION_METADATA[req.type];
                if (!meta) return;
                const dur = meta.duration;
                const possibleTypes = [AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE, AssignmentType.WARDS_METRO].includes(req.type) 
                    ? [AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE, AssignmentType.WARDS_METRO] 
                    : [req.type];

                seededShuffle(residents.filter(r => r.level === level)).forEach(res => {
                    while (getCumulativeRequirementCount(res.id, newSchedule[res.id], req.type, historicalSchedules) < req.target) {
                        // Find the best week to start a block of 'dur' or whatever fits
                        let bestW = -1;
                        let bestT: AssignmentType | null = null;
                        let bestScore = Infinity;

                        for (let w = 0; w <= TOTAL_WEEKS - 1; w++) {
                            if (newSchedule[res.id][w].assignment !== null) continue;
                            
                            possibleTypes.forEach(t => {
                                const m = ROTATION_METADATA[t];
                                if (!m) return;
                                let score = 0;
                                // Peak headcount in this week
                                const cI = getCount(w, t, 1);
                                const cS = getCount(w, t, 2);
                                if (res.level === 1 && cI >= (m.maxInterns || 99)) score += 10000;
                                if (res.level > 1 && cS >= (m.maxSeniors || 99)) score += 10000;

                                // --- Jeopardy Awareness ---
                                if (res.level > 1 && [AssignmentType.MICU, AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE, AssignmentType.NIGHT_FLOAT, AssignmentType.EM, AssignmentType.WARDS_METRO].includes(t)) {
                                    const poolSize = residents.filter(r => {
                                        if (r.level !== res.level) return false;
                                        const a = newSchedule[r.id][w].assignment;
                                        return a === null || ELECTIVE_TYPES.includes(a) || REQUIRED_TYPES.includes(a);
                                    }).length;
                                    if (poolSize <= 1) score += 5000; // Leave at least one senior
                                }

                                score += (cI + cS) * 5;

                                
                                if (score < bestScore) {
                                    bestScore = score; bestW = w; bestT = t;
                                }
                            });
                        }

                        if (bestScore >= 10000 || bestW === -1 || !bestT) break;
                        
                        // Place a segment (1 week or dur if possible)
                        let d = 1;
                        while (d < dur && bestW + d < TOTAL_WEEKS && newSchedule[res.id][bestW + d].assignment === null) {
                            // Check if adding this week exceeds capacity
                            const m = ROTATION_METADATA[bestT];
                            if (res.level === 1 && getCount(bestW + d, bestT, 1) >= (m!.maxInterns || 99)) break;
                            if (res.level > 1 && getCount(bestW + d, bestT, 2) >= (m!.maxSeniors || 99)) break;
                            d++;
                        }
                        placeBlock(newSchedule, res.id, bestW, d, bestT);
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
