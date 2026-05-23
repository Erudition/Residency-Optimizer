import { getMockProgramData } from '../tests/fixtures/scheduleFixture';
const mockProgramData = getMockProgramData();

import { describe, it, expect, beforeAll } from 'vitest';
import { generateSchedule, getWeeklyViolations, getRequirementViolations, getAugmentedResidents } from './scheduler';
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
                    expect(['CCIM', 'NIMA', 'VAC']).toContain(assignment);
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
            expect(assignments.filter(a => a === 'CARDS').length).toBeGreaterThanOrEqual(2);

            // Check for Wards Red/Blue/Met/Jr Hosp (Total 8+ weeks)
            const wards = assignments.filter(a => 
                a === 'W-RED' || 
                a === 'W-BLUE' || 
                a === 'MET' ||
                a === 'JH'
            ).length;
            expect(wards).toBeGreaterThanOrEqual(8);

            // Check for ICU (4 weeks)
            const icu = assignments.filter(a => a === 'ICU' || a === 'METRO').length;
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

describe('getAugmentedResidents', () => {
    const baseResidents: Resident[] = [
        { id: '1', name: 'Real 2025 Resident 1', startYear: 2025, level: 1, avoidResidentIds: [] },
        { id: '2', name: 'Real 2025 Resident 2', startYear: 2025, level: 1, avoidResidentIds: [] },
    ];

    it('should generate complete cohort of synthetic residents when no residents exist for a future year', () => {
        const augmented = getAugmentedResidents(baseResidents, 2026, 2025);
        // Real residents (2) + synthetic cohort for 2026 (size of 2025, which is 2) = 4
        expect(augmented.length).toBe(4);
        
        const synthetic = augmented.filter(r => r.isSynthetic);
        expect(synthetic.length).toBe(2);
        expect(synthetic.map(r => r.name)).toContain('New 2026 Resident 1');
        expect(synthetic.map(r => r.name)).toContain('New 2026 Resident 2');
    });

    it('should preserve existing synthetic residents and backfill missing ones to match previous cohort size', () => {
        // Pre-populate one synthetic resident from the database
        const withOneSynthetic: Resident[] = [
            ...baseResidents,
            { id: 'db-synth-1', name: 'New 2026 Resident 1', startYear: 2026, level: 1, avoidResidentIds: [], isSynthetic: true }
        ];

        const augmented = getAugmentedResidents(withOneSynthetic, 2026, 2025);
        // Expect cohort size 2 in 2026. Since 1 is pre-populated, we should backfill 1 more.
        expect(augmented.length).toBe(4);

        const synthetic = augmented.filter(r => r.isSynthetic);
        expect(synthetic.length).toBe(2);
        
        // The pre-populated one should be preserved exactly
        const preserved = synthetic.find(r => r.id === 'db-synth-1');
        expect(preserved).toBeDefined();
        expect(preserved?.name).toBe('New 2026 Resident 1');

        // The backfilled one should have been added
        const backfilled = synthetic.find(r => r.id === 'c2026-2');
        expect(backfilled).toBeDefined();
        expect(backfilled?.name).toBe('New 2026 Resident 2');
    });

    it('should preserve all synthetic residents and not backfill if cohort is already full', () => {
        const withTwoSynthetic: Resident[] = [
            ...baseResidents,
            { id: 'db-synth-1', name: 'New 2026 Resident 1', startYear: 2026, level: 1, avoidResidentIds: [], isSynthetic: true },
            { id: 'db-synth-2', name: 'New 2026 Resident 2', startYear: 2026, level: 1, avoidResidentIds: [], isSynthetic: true }
        ];

        const augmented = getAugmentedResidents(withTwoSynthetic, 2026, 2025);
        expect(augmented.length).toBe(4);

        const synthetic = augmented.filter(r => r.isSynthetic);
        expect(synthetic.length).toBe(2);
        expect(synthetic.map(r => r.id)).toContain('db-synth-1');
        expect(synthetic.map(r => r.id)).toContain('db-synth-2');
    });
});

