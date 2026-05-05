import { Resident, ScheduleGrid, AssignmentType } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, COHORT_COUNT, fulfillsRequirement, ELECTIVE_TYPES, REQUIRED_TYPES } from '../../constants';
import { ScheduleGenerator } from './types';
import { canFitBlock, placeBlock, getCumulativeRequirementCount, shuffle } from './utils';

export const StrictGenerator: ScheduleGenerator = {
    name: "Education First",
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex: number = 0, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number>): ScheduleGrid => {
        const newSchedule: ScheduleGrid = JSON.parse(JSON.stringify(existingSchedule));

        // 1. Initialize empty schedule
        residents.forEach(r => {
            if (!newSchedule[r.id] || newSchedule[r.id].length !== TOTAL_WEEKS) {
                newSchedule[r.id] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
            }
        });

        // 2. Pre-assign Clinic (Locked)
        residents.forEach(r => {
            const cohort = cohortAssignments ? cohortAssignments[r.id] : 0;
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (w % COHORT_COUNT === cohort) {
                    newSchedule[r.id][w] = { assignment: AssignmentType.CLINIC, locked: true };
                }
            }
        });

        // 3. Helper to check weekly staffing availability
        // We need to ensure that after placing a non-staffing block, we STILL have enough residents
        // who are either ALREADY on a staffing rotation or are FREE to be assigned to one.
        const getResidualCapacity = (week: number, level: number) => {
            const levelRes = residents.filter(r => r.level === (level === 1 ? 1 : 2)); // 2 for seniors
            const totalLevel = level === 1 ? residents.filter(r => r.level === 1).length : residents.filter(r => r.level > 1).length;

            // Fixed Busy: Clinic or other non-staffing rotations already placed
            const busy = residents.filter(r => {
                const l = r.level === 1 ? 1 : 2;
                if (l !== (level === 1 ? 1 : 2)) return false;
                const assign = newSchedule[r.id][week].assignment;
                if (!assign) return false;
                // If it's a "Staffing" rotation, they are NOT busy (they are contributing to staffing)
                return ![
                    AssignmentType.MICU,
                    AssignmentType.WARDS_RED,
                    AssignmentType.WARDS_BLUE,
                    AssignmentType.NIGHT_FLOAT,
                    AssignmentType.EM,
                    AssignmentType.WARDS_METRO,
                    AssignmentType.JR_HOSPITALIST,
                ].includes(assign);
            }).length;

            return totalLevel - busy;
        };

        const minInternsNeeded = 8; // ICU(2) + WR(2) + WB(2) + NF(1) + EM(1)
        const minSeniorsNeeded = 5; // ICU(2) + WR(1) + WB(1) + NF(1)

        // 4. Collect all Requirement Blocks
        type ReqBlock = {
            residentId: string;
            type: AssignmentType;
            duration: number;
            isStaffing: boolean;
        };

        const allBlocks: ReqBlock[] = [];
        residents.forEach(r => {
            const reqs = [...(REQUIREMENTS[r.level] || [])];

            // Virtual Target: Ensure PGY1s get Night Float as blocks
            if (r.level === 1 && !reqs.find(rq => rq.type === AssignmentType.NIGHT_FLOAT)) {
                reqs.push({ type: AssignmentType.NIGHT_FLOAT, label: 'Night Float', target: 4 });
            }

            reqs.forEach(req => {
                const meta = ROTATION_METADATA[req.type];
                if (!meta) return;
                const count = getCumulativeRequirementCount(r.id, newSchedule[r.id], req.type, priorRequirementCounts);
                let needed = req.target - count;

                const isStaffing = [
                    AssignmentType.MICU,
                    AssignmentType.WARDS_RED,
                    AssignmentType.WARDS_BLUE,
                    AssignmentType.NIGHT_FLOAT,
                    AssignmentType.EM
                ].includes(req.type);

                while (needed > 0) {
                    allBlocks.push({
                        residentId: r.id,
                        type: req.type,
                        duration: meta.duration,
                        isStaffing
                    });
                    needed -= meta.duration;
                }
            });
        });

        // 5. Sort Blocks: Staffing First (to ensure coverage), then Duration DESC
        const sortedBlocks = allBlocks.sort((a, b) => {
            if (a.isStaffing !== b.isStaffing) return a.isStaffing ? -1 : 1;
            return b.duration - a.duration;
        });

        const isStaffingType = (type: AssignmentType | null) => [
            AssignmentType.MICU,
            AssignmentType.WARDS_RED,
            AssignmentType.WARDS_BLUE,
            AssignmentType.NIGHT_FLOAT,
            AssignmentType.EM,
            AssignmentType.WARDS_METRO,
            AssignmentType.JR_HOSPITALIST
        ].includes(type as AssignmentType);

        // 6. Place Blocks
        sortedBlocks.forEach(block => {
            const res = residents.find(r => r.id === block.residentId)!;

            // Wards Handling: If it's a Ward requirement, consider Red and Blue (NOT Met)
            const candidateTypes = fulfillsRequirement(block.type, AssignmentType.WARDS_RED)
                ? [AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE]
                : [block.type];

            let globalBest: { week: number; type: AssignmentType; score: number } | null = null;

            // 6. Place Blocks (Gap-Aware)
            candidateTypes.forEach(cType => {
                const meta = ROTATION_METADATA[cType];
                if (!meta) return;

                // Search for valid start weeks for this block
                for (let w = 0; w <= TOTAL_WEEKS - block.duration; w++) {
                    if (!canFitBlock(newSchedule, res.id, w, block.duration)) continue;

                    let score = 0;
                    for (let i = 0; i < block.duration; i++) {
                        const week = w + i;
                        const assignedOnThis = residents.filter(r => newSchedule[r.id][week]?.assignment === cType);
                        const currentCount = res.level === 1
                            ? assignedOnThis.filter(r => r.level === 1).length
                            : assignedOnThis.filter(r => r.level > 1).length;

                        const min = res.level === 1 ? (meta.minInterns || 0) : (meta.minSeniors || 0);
                        const max = res.level === 1 ? (meta.maxInterns || 99) : (meta.maxSeniors || 99);

                        if (isStaffingType(cType)) {
                            if (currentCount < min) score -= 1000;
                            if (currentCount >= max) score += 10000;

                            // --- Jeopardy Awareness ---
                            if (res.level > 1) {
                                const poolSize = residents.filter(r => {
                                    if (r.level !== res.level) return false;
                                    const a = newSchedule[r.id][week].assignment;
                                    return a === null || ELECTIVE_TYPES.includes(a) || REQUIRED_TYPES.includes(a);
                                }).length;
                                if (poolSize <= 1) score += 5000; // Leave at least one senior
                            }

                            score += currentCount * 100;

                        } else {
                            const poolSize = getResidualCapacity(week, res.level);
                            const minNeeded = res.level === 1 ? minInternsNeeded : minSeniorsNeeded;
                            if (poolSize <= minNeeded) score += 5000;
                            score += currentCount * 10;
                        }
                    }

                    if (!globalBest || score < globalBest.score) {
                        globalBest = { week: w, type: cType, score };
                    } else if (score === globalBest.score && Math.random() > 0.5) {
                        globalBest = { week: w, type: cType, score };
                    }
                }
            });

            if (globalBest) {
                placeBlock(newSchedule, res.id, globalBest.week, block.duration, globalBest.type);
            }
        });

        // 7. Last-Mile Staffing Fill (1-week slots)
        // Use the strategy from Experimental to patch any remaining holes in staffing
        const staffedTypes = [
            AssignmentType.MICU,
            AssignmentType.WARDS_RED,
            AssignmentType.WARDS_BLUE,
            AssignmentType.NIGHT_FLOAT,
            AssignmentType.EM,
        ];

        for (let w = 0; w < TOTAL_WEEKS; w++) {
            staffedTypes.forEach(type => {
                const meta = ROTATION_METADATA[type];
                if (!meta) return;

                // Interns
                let internsOn = residents.filter(r => r.level === 1 && newSchedule[r.id][w].assignment === type).length;
                while (internsOn < meta.minInterns) {
                    const pool = shuffle(residents.filter(r => {
                        return r.level === 1 && newSchedule[r.id][w].assignment === null;
                    }));
                    if (pool.length === 0) break;
                    newSchedule[pool[0].id][w] = { assignment: type, locked: false };
                    internsOn++;
                }

                // Seniors
                let seniorsOn = residents.filter(r => r.level > 1 && newSchedule[r.id][w].assignment === type).length;
                while (seniorsOn < meta.minSeniors) {
                    const pool = shuffle(residents.filter(r => {
                        return r.level > 1 && newSchedule[r.id][w].assignment === null;
                    }));
                    if (pool.length === 0) break;
                    newSchedule[pool[0].id][w] = { assignment: type, locked: false };
                    seniorsOn++;
                }
            });
        }

        // 8. Final Elective Fill
        residents.forEach(r => {
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (newSchedule[r.id][w].assignment === null) {
                    newSchedule[r.id][w] = { assignment: AssignmentType.ELECTIVE, locked: false };
                }
            }
        });

        return newSchedule;
    }
};
