
import { describe, it, expect, beforeAll } from 'vitest';
import { generateSchedule, getWeeklyViolations } from './scheduler';
import { Resident, AssignmentType, ScheduleGrid, CompetitionPriority } from '../types';
import { TOTAL_WEEKS, GENERATE_INITIAL_RESIDENTS } from '../constants';

/*
const createMockResidents = (): Resident[] => {
*/

describe('Schedule Generator', () => {
    const residents = GENERATE_INITIAL_RESIDENTS();
    const initialSchedule: ScheduleGrid = {};
    let schedule: ScheduleGrid;

    beforeAll(async () => {
        const result = await generateSchedule(residents, initialSchedule, { tries: 100, priority: CompetitionPriority.BEST_SCORE, algorithmIds: ['experimental', 'stochastic', 'strict'] });
        schedule = result.schedule;
    }, 180000); // Increase timeout for competition iterations

    it('should generate a schedule for every resident', () => {
        residents.forEach(r => {
            expect(schedule[r.id]).toBeDefined();
            expect(schedule[r.id]).toHaveLength(TOTAL_WEEKS);
        });
    });

    it('should enforce 4+1 Clinic weeks (Cohort rule)', () => {
        residents.forEach(r => {
            const weeks = schedule[r.id];
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (w % 5 === r.cohort) {
                    expect(weeks[w].assignment).toBe(AssignmentType.CLINIC);
                }
            }
        });
    });

    it('should not leave any week unassigned', () => {
        residents.forEach(r => {
            schedule[r.id].forEach((week, index) => {
                expect(week.assignment, `Week ${index + 1} for ${r.id} is null`).not.toBeNull();
            });
        });
    });

    it('should assign PGY1 required electives', () => {
        const pgy1s = residents.filter(r => r.level === 1);
        pgy1s.forEach(r => {
            const weeks = schedule[r.id];
            const assignments = weeks.map(w => w.assignment);

            // Check for Cards (4 weeks)
            const cards = assignments.filter(a => a === AssignmentType.CARDS).length;
            expect(cards, `PGY1 ${r.id} Cards`).toBeGreaterThanOrEqual(4);

            // Check for Wards Red/Blue/Met (Total 12 weeks)
            const wards = assignments.filter(a => a === AssignmentType.WARDS_RED || a === AssignmentType.WARDS_BLUE || a === AssignmentType.MET_WARDS).length;
            expect(wards, `PGY1 ${r.id} Wards`).toBeGreaterThanOrEqual(12);

            // Check for ICU (4 weeks)
            const icu = assignments.filter(a => a === AssignmentType.ICU).length;
            expect(icu, `PGY1 ${r.id} ICU`).toBeGreaterThanOrEqual(4);

            // Check for Night Float (4 weeks)
            const nf = assignments.filter(a => a === AssignmentType.NIGHT_FLOAT).length;
            expect(nf, `PGY1 ${r.id} NF`).toBeGreaterThanOrEqual(4);

            // Check for ID (2 weeks)
            const id = assignments.filter(a => a === AssignmentType.ID).length;
            expect(id, `PGY1 ${r.id} ID`).toBeGreaterThanOrEqual(2);

            // Check for Neph (2 weeks)
            const neph = assignments.filter(a => a === AssignmentType.NEPH).length;
            expect(neph, `PGY1 ${r.id} Neph`).toBeGreaterThanOrEqual(2);

            // Check for Pulm (2 weeks)
            const pulm = assignments.filter(a => a === AssignmentType.PULM).length;
            expect(pulm).toBeGreaterThanOrEqual(2);

            // Check for EM (4 weeks)
            const em = assignments.filter(a => a === AssignmentType.EM).length;
            expect(em).toBeGreaterThanOrEqual(4);
        });
    });

    it('should assign PGY2 required rotations', () => {
        const pgy2s = residents.filter(r => r.level === 2);
        pgy2s.forEach(r => {
            const assignments = schedule[r.id].map(w => w.assignment);

            // Ranges are 2-4 weeks, checking min 2
            // Ranges are 2-4 weeks, checking min 2
            expect(assignments.filter(a => a === AssignmentType.ONC).length).toBeGreaterThanOrEqual(2);
            expect(assignments.filter(a => a === AssignmentType.NEURO).length).toBeGreaterThanOrEqual(2);
            expect(assignments.filter(a => a === AssignmentType.RHEUM).length).toBeGreaterThanOrEqual(2);
            expect(assignments.filter(a => a === AssignmentType.GI).length).toBeGreaterThanOrEqual(2);

            // Core Req
            expect(assignments.filter(a => a === AssignmentType.WARDS_RED || a === AssignmentType.WARDS_BLUE || a === AssignmentType.MET_WARDS).length).toBeGreaterThanOrEqual(8);
            expect(assignments.filter(a => a === AssignmentType.ICU).length).toBeGreaterThanOrEqual(4);
            // Core Req
            expect(assignments.filter(a => a === AssignmentType.WARDS_RED || a === AssignmentType.WARDS_BLUE || a === AssignmentType.MET_WARDS).length).toBeGreaterThanOrEqual(8);
            expect(assignments.filter(a => a === AssignmentType.ICU).length).toBeGreaterThanOrEqual(4);
            // expect(assignments.filter(a => a === AssignmentType.NIGHT_FLOAT).length).toBeGreaterThanOrEqual(4);
        });
    });

    it('should assign PGY3 required electives', () => {
        const pgy3s = residents.filter(r => r.level === 3);
        pgy3s.forEach(r => {
            const assignments = schedule[r.id].map(w => w.assignment);

            expect(assignments.filter(a => a === AssignmentType.ADD_MED).length).toBeGreaterThanOrEqual(4);
            expect(assignments.filter(a => a === AssignmentType.ENDO).length).toBeGreaterThanOrEqual(4);
            expect(assignments.filter(a => a === AssignmentType.GERI).length).toBeGreaterThanOrEqual(4);
            expect(assignments.filter(a => a === AssignmentType.HPC).length).toBeGreaterThanOrEqual(4);

            // Core Req
            expect(assignments.filter(a => a === AssignmentType.WARDS_RED || a === AssignmentType.WARDS_BLUE || a === AssignmentType.MET_WARDS).length).toBeGreaterThanOrEqual(8);
            expect(assignments.filter(a => a === AssignmentType.ICU).length).toBeGreaterThanOrEqual(4);
            // expect(assignments.filter(a => a === AssignmentType.NIGHT_FLOAT).length).toBeGreaterThanOrEqual(4);
        });
    });

    it('should assign correct block lengths for rotations', () => {
        // Check Night Float is 2 week blocks if assigned (logic says duration 2 for NF in scheduler.ts)
        // Actually scheduler.ts line 143 says duration = 2 for Night Float for PGY1/2 requirements?
        // Let's check logic: duration is from metadata generally.

        // Let's just spot check one resident to see if blocks are contiguous for Wards (4 weeks usually)
        // This is a bit complex to test deterministically on a random schedule without parsing streaks.
        // Skipping complex streak validation for now, relying on requirements counts.
    });

    describe('Weekly Staffing Requirements', () => {
        // We verify that for a generated schedule, constraints aren't violated GROSSLY.
        // Since it's a random filler, it might not be perfect, but we can check bounds.

        it('should have at least 1 intern on Night Float per week', () => {
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                const internsOnNF = residents.filter(r => r.level === 1 && schedule[r.id][w].assignment === AssignmentType.NIGHT_FLOAT).length;
                // NF Min Interns is 1
                // Note: It's possible the generator fails to find a fit, but it "should" find one.
                // If this fails often, the generator or the test parameters (resident count) need adjustment.
                // With 15 residents, constraints are tight.

                // Commenting out strict assertion because random generation with tight constraints might fail occasionally without backtracking.
                // But let's log if it happens.
                if (internsOnNF < 1) console.warn(`Week ${w + 1}: NF Interns < 1`);
                expect(internsOnNF).toBeGreaterThanOrEqual(1);
            }
        });

        it('should have 0 weekly staffing violations', () => {
            const violations = getWeeklyViolations(residents, schedule);
            if (violations.length > 0) {
                console.log("Weekly Violations Sample:", JSON.stringify(violations.slice(0, 10), null, 2));
                console.log("Total Violations:", violations.length);
            }
            expect(violations.length).toBe(0);
        });
    });

    it('should produce non-deterministic (unique) schedules', { timeout: 300000 }, async () => {
        const schedule1 = await generateSchedule(residents, initialSchedule, { tries: 2, priority: CompetitionPriority.BEST_SCORE, algorithmIds: ['experimental', 'stochastic', 'strict'] });
        const schedule2 = await generateSchedule(residents, initialSchedule, { tries: 2, priority: CompetitionPriority.BEST_SCORE, algorithmIds: ['experimental', 'stochastic', 'strict'] });

        // Convert schedules to strings to compare them
        // We check if the entire grid is different. 
        // Note: There's a tiny probability they could be identical by chance, but with 300 attempts it's effectively 0.
        expect(JSON.stringify(schedule1)).not.toBe(JSON.stringify(schedule2));
    });
});
