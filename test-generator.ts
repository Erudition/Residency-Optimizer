import { calculateScheduleScore, getRequirementViolations, getWeeklyViolations } from './services/scheduler';
import { GENERATE_RESIDENTS_FOR_YEAR, REQUIREMENTS, ROTATION_METADATA, fulfillsRequirement, TOTAL_WEEKS, COHORT_COUNT } from './constants';
import { AssignmentType, CompetitionPriority, Resident, ScheduleGrid, ScheduleHistory } from './types';
import { canFitBlock, placeBlock, getCumulativeRequirementCount, isAligned, getAssignedCount } from './services/generators/utils';

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

function generate(residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, historicalSchedules?: ScheduleHistory, cohortAssignments?: Record<string, number>): ScheduleGrid {
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

    // 1. Initialize & Clinic Lock
    residents.forEach(r => {
        if (!newSchedule[r.id] || newSchedule[r.id].length !== TOTAL_WEEKS) {
            newSchedule[r.id] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
        }
        const clinicType = r.clinicType || AssignmentType.CLINIC;
        const cohort = validCohortAssignments[r.id] ?? 0;
        for (let w = 0; w < TOTAL_WEEKS; w++) {
            if (w % COHORT_COUNT === cohort) {
                newSchedule[r.id][w] = { assignment: clinicType, locked: true };
            }
        }
    });

    // 2. Education First Placement (Resident-by-Resident)
    const allLevels = [1, 2, 3];
    allLevels.forEach(level => {
        const levelResidents = seededShuffle(residents.filter(r => r.level === level));

        levelResidents.forEach(res => {
            const reqs = seededShuffle(REQUIREMENTS[level as 1|2|3] || []);
            // Sort requirements by critical ones first, then duration descending
            const criticalPriority = [
                AssignmentType.MICU,
                AssignmentType.WARDS_RED,
                AssignmentType.WARDS_BLUE,
                AssignmentType.WARDS_METRO,
                AssignmentType.GERI,
                AssignmentType.EM,
                AssignmentType.JR_HOSPITALIST,
                AssignmentType.PALLIATIVE,
                AssignmentType.ADD_MED,
                AssignmentType.NIMA_BLOCK
            ];

            reqs.sort((a, b) => {
                const idxA = criticalPriority.indexOf(a.type);
                const idxB = criticalPriority.indexOf(b.type);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;

                const metaA = ROTATION_METADATA[a.type];
                const metaB = ROTATION_METADATA[b.type];
                const durA = metaA?.duration || 4;
                const durB = metaB?.duration || 4;
                return durB - durA;
            });

            reqs.forEach(req => {
                const compatibleTypes = Object.values(AssignmentType).filter(t => fulfillsRequirement(t, req.type));
                const cohort = validCohortAssignments[res.id] ?? 0;

                let safety = 0;
                while (getCumulativeRequirementCount(res.id, newSchedule[res.id], req.type, historicalSchedules) < req.target && safety < 10) {
                    safety++;
                    let bestW = -1, bestType = compatibleTypes[0], bestScore = Infinity;
                    const dur = ROTATION_METADATA[req.type]?.duration || 4;

                    const possibleWeeks = seededShuffle(Array.from({length: TOTAL_WEEKS - dur + 1}, (_, i) => i));

                    for (const w of possibleWeeks) {
                        if (!isAligned(w, cohort, dur)) continue;
                        if (!canFitBlock(newSchedule, res.id, w, dur)) continue;

                        for (const type of compatibleTypes) {
                            const meta = ROTATION_METADATA[type];
                            let score = 0;
                            let possible = true;

                            for (let i = 0; i < dur; i++) {
                                const cI = getAssignedCount(newSchedule, residents, w + i, type, 1);
                                const cS = getAssignedCount(newSchedule, residents, w + i, type, 2);

                                const maxI = meta?.maxInterns || 99;
                                const maxS = meta?.maxSeniors || 99;

                                if (res.level === 1 && cI >= maxI) { possible = false; break; }
                                if (res.level > 1 && cS >= maxS) { possible = false; break; }
                                
                                score += (cI + cS) + rng.next() * 0.1;
                            }

                            if (possible && score < bestScore) {
                                bestScore = score;
                                bestW = w;
                                bestType = type;
                            }
                        }
                    }

                    if (bestW === -1) break; // Cannot fit anymore
                    placeBlock(newSchedule, res.id, bestW, dur, bestType);
                }
            });
        });
    });

    // 3. Staffing Sweep (Foundation) - Mandatory Minima
    const criticalTypes = [
        AssignmentType.MICU,
        AssignmentType.WARDS_RED,
        AssignmentType.WARDS_BLUE,
        AssignmentType.NIGHT_FLOAT,
        AssignmentType.EM,
        AssignmentType.WARDS_METRO,
        AssignmentType.JR_HOSPITALIST,
        AssignmentType.CARDS,
        AssignmentType.NEPH,
        AssignmentType.ID
    ];

    criticalTypes.forEach(type => {
        const meta = ROTATION_METADATA[type];
        if (!meta) return;
        const dur = meta.duration || 4;

        for (let w = 0; w < TOTAL_WEEKS; w++) {
            // Interns
            let safetyI = 0;
            while (getAssignedCount(newSchedule, residents, w, type, 1) < (meta.minInterns || 0) && safetyI < 10) {
                safetyI++;
                const pool = seededShuffle(residents.filter(r => {
                    const cohort = validCohortAssignments[r.id] ?? 0;
                    return r.level === 1 && 
                           canFitBlock(newSchedule, r.id, w, dur) && 
                           isAligned(w, cohort, dur) &&
                           getAssignedCount(newSchedule, residents, w, type, 1) < (meta.maxInterns || 99);
                })).sort((a, b) => getCumulativeRequirementCount(a.id, newSchedule[a.id], type, historicalSchedules) - 
                                 getCumulativeRequirementCount(b.id, newSchedule[b.id], type, historicalSchedules));
                
                if (pool.length === 0) break;
                placeBlock(newSchedule, pool[0].id, w, dur, type);
            }

            // Seniors
            let safetyS = 0;
            while (getAssignedCount(newSchedule, residents, w, type, 2) < (meta.minSeniors || 0) && safetyS < 10) {
                safetyS++;
                const pool = seededShuffle(residents.filter(r => {
                    const cohort = validCohortAssignments[r.id] ?? 0;
                    return r.level >= 2 && 
                           canFitBlock(newSchedule, r.id, w, dur) && 
                           isAligned(w, cohort, dur) &&
                           getAssignedCount(newSchedule, residents, w, type, 2) < (meta.maxSeniors || 99);
                })).sort((a, b) => getCumulativeRequirementCount(a.id, newSchedule[a.id], type, historicalSchedules) - 
                                 getCumulativeRequirementCount(b.id, newSchedule[b.id], type, historicalSchedules));
                
                if (pool.length === 0) break;
                placeBlock(newSchedule, pool[0].id, w, dur, type);
            }
        }
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

async function run() {
    const residents = GENERATE_RESIDENTS_FOR_YEAR(2026);
    const mockCohortMap: Record<string, number> = residents.reduce((acc, r, idx) => ({ ...acc, [r.id]: idx % 5 }), {});

    let bestScore = -Infinity;
    let bestSchedule: any = null;

    for (let i = 0; i < 30; i++) {
        const sched = generate(residents, {}, i, {}, mockCohortMap);
        const score = calculateScheduleScore(residents, sched, {});
        if (score > bestScore) {
            bestScore = score;
            bestSchedule = sched;
        }
    }

    console.log(`\n=== Testing Resident-by-Resident Approach ===`);
    console.log(`Best Try Score: ${bestScore}`);
    const reqs = getRequirementViolations(residents, bestSchedule, {});
    const weeks = getWeeklyViolations(residents, bestSchedule);
    console.log(`Violations count - Reqs: ${reqs.length}, Weeks: ${weeks.length}`);
    if (reqs.length > 0) {
        console.log(reqs);
    } else {
        console.log(`SUCCESS! Perfect requirements generation`);
    }
}

run().catch(console.error);
