import { describe, it, expect, beforeAll } from 'vitest';
import { Resident, ScheduleSession, ScheduleHistory } from '../types';
import { getScheduleFixture } from '../tests/fixtures/scheduleFixture';

describe.skip('Backup and Restore Integrity', () => {
    let residents: Resident[];
    let mockCohortMap: Record<string, number>;
    let schedule: ScheduleHistory;

    beforeAll(async () => {
        const fixture = await getScheduleFixture();
        residents = fixture.residents;
        mockCohortMap = fixture.mockCohortMap;
        schedule = { 2026: fixture.schedule };
    }, 300000);

    it('should maintain data integrity across export and import cycle with real generated data', () => {
        // 1. Setup real session data
        const mockSchedules: ScheduleSession[] = [
            {
                id: 'real-schedule-AY26',
                name: 'Realistic Generated Schedule',
                data: schedule,
                createdAt: new Date('2026-05-06T10:00:00Z'),
                cohortAssignments: { 2026: mockCohortMap },
                startYear: 2026,
                isHistory: false
            }
        ];

        // 2. Simulate Export logic from App.tsx
        const exportData = {
            residents: residents,
            schedules: mockSchedules,
            exportDate: new Date().toISOString(),
            version: "2.0"
        };

        const jsonString = JSON.stringify(exportData);

        // 3. Simulate Import logic from App.tsx
        const importedJson = JSON.parse(jsonString);

        // Patch dates (same logic as in handleImportJSON and loadState)
        const restoredSchedules = (importedJson.schedules as any[]).map((s: any) => ({
            ...s,
            createdAt: s.createdAt ? new Date(s.createdAt) : new Date()
        })) as ScheduleSession[];

        const restoredResidents = importedJson.residents as Resident[];

        // 4. Assertions
        // Deep equality check for residents
        expect(restoredResidents).toEqual(residents);

        // Full deep equality check for schedules
        expect(restoredSchedules[0].id).toBe(mockSchedules[0].id);
        expect(restoredSchedules[0].name).toBe(mockSchedules[0].name);
        expect(restoredSchedules[0].data).toEqual(mockSchedules[0].data);
        expect(restoredSchedules[0].cohortAssignments).toEqual(mockSchedules[0].cohortAssignments);
        expect(restoredSchedules[0].startYear).toBe(mockSchedules[0].startYear);
        expect(restoredSchedules[0].isHistory).toBe(mockSchedules[0].isHistory);

        // Verify date restoration
        expect(restoredSchedules[0].createdAt.getTime()).toBe(mockSchedules[0].createdAt.getTime());
        expect(restoredSchedules[0].createdAt).toBeInstanceOf(Date);
    });
});

