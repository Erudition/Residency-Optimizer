
import { Resident, ScheduleGrid, AssignmentType } from '../../types';
import { TOTAL_WEEKS, ROTATION_METADATA, REQUIREMENTS, REQUIRED_TYPES } from '../../constants';
import { ScheduleGenerator } from './types';
import { canFitBlock, placeBlock, shuffle, getRequirementCount, isWards } from './utils';

export const BacktrackingGenerator: ScheduleGenerator = {
    name: "Priority/Constraint (Backtracking)",
    generate: (residents: Resident[], existingSchedule: ScheduleGrid, attemptIndex?: number): ScheduleGrid => {
        const newSchedule: ScheduleGrid = JSON.parse(JSON.stringify(existingSchedule));

        // 1. Initialize empty schedule with Clinic weeks (Locked)
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

        // 2. Build a list of ALL blocks needed for all residents
        type BlockRequest = {
            residentId: string;
            residentLevel: number;
            type: AssignmentType;
            duration: number;
            priority: number; // Higher is more important
        };

        const requests: BlockRequest[] = [];

        residents.forEach(r => {
            const reqs = REQUIREMENTS[r.level] || [];
            reqs.forEach(req => {
                const meta = ROTATION_METADATA[req.type];
                if (!meta) return;
                const duration = meta.duration; // Trust constant duration

                // Existing count?
                const current = getRequirementCount(newSchedule[r.id], req.type, r.level);
                const needed = req.target - current;

                if (needed > 0) {
                    // Create blocks of 'duration' size until target is met
                    // This assumes target is multiple of duration. 
                    // If target is 4 and duration is 4, we need 1 block.
                    const blocksNeeded = Math.ceil(needed / duration);
                    for (let i = 0; i < blocksNeeded; i++) {
                        let priority = 1;
                        // Priority is now secondary to Duration, but still useful for tie-breaking same-duration blocks
                        if (req.type === AssignmentType.NIGHT_FLOAT) priority = 10;
                        else if (isWards(req.type) || req.type === AssignmentType.ICU) priority = 8;
                        else if (REQUIRED_TYPES.includes(req.type)) priority = 5;

                        requests.push({
                            residentId: r.id,
                            residentLevel: r.level,
                            type: req.type,
                            duration: duration,
                            priority: priority
                        });
                    }
                }
            });
        });

        // 3. Sort requests by Duration DESC (Tetris), then Priority DESC
        const sortedRequests = shuffle(requests).sort((a, b) => {
            if (a.duration !== b.duration) return b.duration - a.duration;
            return b.priority - a.priority;
        });

        // 4. Process requests
        sortedRequests.forEach(req => {
            const resId = req.residentId;
            const meta = ROTATION_METADATA[req.type];

            // Find all valid start weeks
            const candidates: number[] = [];
            for (let w = 0; w <= TOTAL_WEEKS - req.duration; w++) {
                if (canFitBlock(newSchedule, resId, w, req.duration)) {
                    candidates.push(w);
                }
            }

            if (candidates.length === 0) {
                // Fail to place (Backtracking would happen here in a full solver)
                // console.warn(`Could not place ${req.type} for ${resId}`);
                return;
            }

            // Simple Heuristic: Pick window with LEAST staffing of this type to balance load
            // Or just random if no constraints.

            let bestW = -1;
            let minLoad = Infinity;

            // Optimization: Check strict Max caps immediately
            const validCandidates = candidates.filter(w => {
                // Check max cap for the whole duration
                for (let i = 0; i < req.duration; i++) {
                    const currentStaff = residents.filter(r => newSchedule[r.id]?.[w + i]?.assignment === req.type);
                    const interns = currentStaff.filter(r => r.level === 1).length;
                    const seniors = currentStaff.filter(r => r.level > 1).length;

                    if (req.residentLevel === 1 && interns >= meta.maxInterns) return false;
                    if (req.residentLevel > 1 && seniors >= meta.maxSeniors) return false;
                }
                return true;
            });

            // If strict caps ruled everything out, fall back to "Ignore caps" or just skip?
            // Let's stick to validCandidates.
            const options = validCandidates.length > 0 ? validCandidates : [];

            if (options.length === 0) return; // Cannot place respecting caps

            shuffle(options).forEach(w => {
                let load = 0;
                for (let i = 0; i < req.duration; i++) {
                    load += residents.filter(r => newSchedule[r.id]?.[w + i]?.assignment === req.type).length;
                }
                if (load < minLoad) {
                    minLoad = load;
                    bestW = w;
                }
            });

            if (bestW !== -1) {
                placeBlock(newSchedule, resId, bestW, req.duration, req.type);
            }
        });

        // 5. Fill remaining holes with Electives
        residents.forEach(r => {
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (!newSchedule[r.id][w] || newSchedule[r.id][w].assignment === null) {
                    // Check consecutive empty slots for 2-week electives?
                    // For now just fill 1 by 1 or 2 if possible
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
}
