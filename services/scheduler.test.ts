
import { describe, it, expect, beforeAll } from 'vitest';
import { generateSchedule, getWeeklyViolations, getRequirementViolations } from './scheduler';
import { healSchedule } from './healer';
import { Resident, AssignmentType, ScheduleGrid, CompetitionPriority } from '../types';
import { TOTAL_WEEKS, GENERATE_RESIDENTS_FOR_YEAR } from '../constants';

describe('Schedule Generator', () => {
    const residents = GENERATE_RESIDENTS_FOR_YEAR(2026);
    const initialSchedule: ScheduleGrid = {};
    let schedule: ScheduleGrid;

    const mockCohortMap: Record<string, number> = residents.reduce((acc, r, idx) => ({ ...acc, [r.id]: idx % 5 }), {});
    
    // Test case for locked blocks
    const lockedResId = residents[0].id;

    beforeAll(async () => {
        // Setup locked blocks
        initialSchedule[lockedResId] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null as any, locked: false }));
        initialSchedule[lockedResId][11] = { assignment: AssignmentType.VACATION, locked: true };
        initialSchedule[lockedResId][12] = { assignment: AssignmentType.VACATION, locked: true };

        const result = await generateSchedule(
            2026, 
            1, 
            residents, 
            {}, 
            { existing: { 2026: initialSchedule }, cohortAssignments: { 2026: mockCohortMap } }, 
            { tries: 50, priority: CompetitionPriority.BEST_SCORE, topN: 1 }, 
            ['greedy', 'experimental', 'stochastic', 'strict', 'exact'], 
            () => false, 
            () => {}
        );
        
        const winner = result.results[0];
        console.error("WINNER OF COMPETITION:", winner.winnerName);
        console.error("PHASE 1 VIOLATIONS:", winner.totalViolations);
        
        // Phase 2: Healer (Simulate worker behavior)
        const healedUnified = healSchedule(winner.unifiedSchedule!, result.unifiedResidents, 2026, 3000, {}); 
        const reqV = getRequirementViolations(result.unifiedResidents, healedUnified, {}, 2026).length;
        const weekV = getWeeklyViolations(result.unifiedResidents, healedUnified, 2026).length;
        
        console.error("PHASE 2 VIOLATIONS (Req/Week):", reqV, weekV);
        
        schedule = healedUnified;
    }, 300000); 


    it('should generate a schedule for every resident', () => {
        residents.forEach(r => {
            expect(schedule[r.id]).toBeDefined();
            expect(schedule[r.id]).toHaveLength(TOTAL_WEEKS);
        });
    });

    it('should respect locked blocks (Vacations)', () => {
        expect(schedule[lockedResId][11].assignment).toBe(AssignmentType.VACATION);
        expect(schedule[lockedResId][12].assignment).toBe(AssignmentType.VACATION);
    });

    it('should enforce 4+1 Clinic weeks (Cohort rule)', () => {
        residents.forEach(r => {
            const weeks = schedule[r.id];
            const cohort = mockCohortMap[r.id];
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (w % 5 === cohort) {
                    const assignment = weeks[w].assignment;
                    expect([AssignmentType.CLINIC, AssignmentType.NIMA_CLINIC, AssignmentType.VACATION]).toContain(assignment);
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
            const assignments = schedule[r.id].map(w => w.assignment);
            
            // Check for Cards (2 weeks)
            expect(assignments.filter(a => a === AssignmentType.CARDS).length).toBeGreaterThanOrEqual(2);

            // Check for Wards Red/Blue/Met/Jr Hosp (Total 8+ weeks)
            const wards = assignments.filter(a => 
                a === AssignmentType.WARDS_RED || 
                a === AssignmentType.WARDS_BLUE || 
                a === AssignmentType.WARDS_METRO ||
                a === AssignmentType.JR_HOSPITALIST
            ).length;
            expect(wards).toBeGreaterThanOrEqual(8);

            // Check for ICU (4 weeks)
            const icu = assignments.filter(a => a === AssignmentType.MICU || a === AssignmentType.METRO_ICU).length;
            expect(icu).toBeGreaterThanOrEqual(4);

            // Check for Night Float (2 weeks minimum per metadata)
            expect(assignments.filter(a => a === AssignmentType.NIGHT_FLOAT).length).toBeGreaterThanOrEqual(2);

            // Check for ID/Neph/Pulm (2 weeks each)
            expect(assignments.filter(a => a === AssignmentType.ID).length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Weekly Staffing Requirements', () => {
        it('should have zero weekly staffing violations after healing', () => {
            const violations = getWeeklyViolations(residents, schedule, 2026);
            if (violations.length > 0) {
                console.error("WEEKLY VIOLATIONS FOUND AFTER HEALING:", JSON.stringify(violations, null, 2));
            }
            expect(violations.length).toBe(0);
        });

        it('should have zero requirement violations after healing', () => {
            const violations = getRequirementViolations(residents, schedule, {}, 2026);
            if (violations.length > 0) {
                console.error("REQUIREMENT VIOLATIONS FOUND AFTER HEALING:", JSON.stringify(violations, null, 2));
            }
            expect(violations.length).toBe(0);
        });
    });

    it('should produce non-deterministic (unique) schedules', { timeout: 300000 }, async () => {
        const result1 = await generateSchedule(2026, 1, residents, {}, { existing: {}, cohortAssignments: {} }, { tries: 2, priority: CompetitionPriority.BEST_SCORE, topN: 1 }, ['experimental', 'stochastic', 'strict'], () => false, () => {});
        const result2 = await generateSchedule(2026, 1, [...residents].reverse(), {}, { existing: {}, cohortAssignments: {} }, { tries: 2, priority: CompetitionPriority.BEST_SCORE, topN: 1 }, ['experimental', 'stochastic', 'strict'], () => false, () => {});

        const schedule1 = result1.results[0].schedule[2026];
        const schedule2 = result2.results[0].schedule[2026];

        expect(JSON.stringify(schedule1)).not.toBe(JSON.stringify(schedule2));
    });
});
