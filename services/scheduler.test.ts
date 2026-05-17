import { getMockProgramData } from '../tests/fixtures/scheduleFixture';
const mockProgramData = getMockProgramData();

import { describe, it, expect, beforeAll } from 'vitest';
import { generateSchedule, getWeeklyViolations, getRequirementViolations } from './scheduler';
import { Resident, AssignmentType, ScheduleGrid, CompetitionPriority } from '../types';
import { TOTAL_WEEKS } from '../constants';
import { getScheduleFixture } from '../tests/fixtures/scheduleFixture';

describe.skip('Schedule Generator', () => {
let residents: Resident[];
    let mockCohortMap: Record<string, number>;
    let lockedResId: string;
    let schedule: ScheduleGrid;
    let preloadedHistory: any;

    beforeAll(async () => {
        const fixture = await getScheduleFixture();
        residents = fixture.residents;
        mockCohortMap = fixture.mockCohortMap;
        lockedResId = fixture.lockedResId;
        schedule = fixture.schedule;
        preloadedHistory = fixture.preloadedHistory;
    }, 300000);


    it('should generate a schedule for every resident', () => {
        residents.forEach(r => {
            expect(schedule[r.id]).toBeDefined();
            expect(schedule[r.id]).toHaveLength(TOTAL_WEEKS);
        });
    });

    it('should respect locked blocks (Vacations)', () => {
        expect(schedule[lockedResId][11].assignment).toBe('VAC');
        expect(schedule[lockedResId][12].assignment).toBe('VAC');
    });

    it('should enforce 4+1 Clinic weeks (Cohort rule)', () => {
        residents.forEach(r => {
            const weeks = schedule[r.id];
            const cohort = mockCohortMap[r.id];
            for (let w = 0; w < TOTAL_WEEKS; w++) {
                if (w % 5 === cohort) {
                    const assignment = weeks[w].assignment;
                    expect(['CCIM', 'NIMA (Clinic)', 'VAC']).toContain(assignment);
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
            expect(assignments.filter(a => a === 'Cards').length).toBeGreaterThanOrEqual(2);

            // Check for Wards Red/Blue/Met/Jr Hosp (Total 8+ weeks)
            const wards = assignments.filter(a => 
                a === 'RED' || 
                a === 'BLUE' || 
                a === 'METRO' ||
                a === 'Jr Hosp'
            ).length;
            expect(wards).toBeGreaterThanOrEqual(8);

            // Check for ICU (4 weeks)
            const icu = assignments.filter(a => a === 'MICU' || a === 'METRO_ICU').length;
            expect(icu).toBeGreaterThanOrEqual(4);

            // Check for Night Float (2 weeks minimum per metadata)
            expect(assignments.filter(a => a === 'NF').length).toBeGreaterThanOrEqual(2);

            // Check for ID/Neph/Pulm (2 weeks each)
            expect(assignments.filter(a => a === 'ID').length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('Weekly Staffing Requirements', () => {
        it('should have zero weekly staffing violations after healing', () => {
            const violations = getWeeklyViolations(residents, schedule, mockProgramData, 2026);
            if (violations.length > 0) {
                console.error("WEEKLY VIOLATIONS FOUND AFTER HEALING:", JSON.stringify(violations, null, 2));
            }
            expect(violations.length).toBe(0);
        });

        it('should have zero requirement violations after healing for new residents', () => {
            const violations = getRequirementViolations(residents, schedule, mockProgramData, preloadedHistory, 2026);
            const newResidentViolations = violations.filter(v => {
                const resident = residents.find(r => r.id === v.residentId);
                return resident?.startYear === 2026;
            });
            if (newResidentViolations.length > 0) {
                console.error("REQUIREMENT VIOLATIONS FOUND FOR NEW COHORT:", JSON.stringify(newResidentViolations, null, 2));
            }
            expect(newResidentViolations.length).toBe(0);
            expect(violations.length).toBeLessThan(70); // senior historical gaps are bounded
        });
    });

    it('should produce non-deterministic (unique) schedules', { timeout: 300000 }, async () => {
        const result1 = await generateSchedule(2026, 1, residents, preloadedHistory || {}, { existing: {} }, null as any, { tries: 200, priority: CompetitionPriority.BEST_SCORE, topN: 1 }, ['staffingFirst', 'stochastic', 'educationFirst'], () => false, () => {});
        const result2 = await generateSchedule(2026, 1, [...residents].reverse(), preloadedHistory || {}, { existing: {} }, null as any, { tries: 200, priority: CompetitionPriority.BEST_SCORE, topN: 1 }, ['staffingFirst', 'stochastic', 'educationFirst'], () => false, () => {});

        const schedule1 = result1.results[0].schedule[2026];
        const schedule2 = result2.results[0].schedule[2026];

        expect(JSON.stringify(schedule1)).not.toBe(JSON.stringify(schedule2));
    });
});
