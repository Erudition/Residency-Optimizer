import { describe, it, expect } from 'vitest';
import { Resident, ScheduleGrid } from '../types';
import { GENERATE_INITIAL_RESIDENTS } from '../constants';

// Local definition since ScheduleSession is defined in App.tsx
interface ScheduleSession {
    id: string;
    name: string;
    data: ScheduleGrid;
    createdAt: Date;
}

describe('Backup and Restore Integrity', () => {
    it('should maintain data integrity across export and import cycle', () => {
        // 1. Setup mock data
        const mockResidents: Resident[] = GENERATE_INITIAL_RESIDENTS();
        const mockSchedules: ScheduleSession[] = [
            {
                id: 'test-1',
                name: 'Test Schedule',
                data: {
                    'res1': [{ assignment: 'NIGHT_FLOAT', locked: true }]
                } as any,
                createdAt: new Date('2026-01-01T10:00:00Z')
            }
        ];

        // 2. Simulate Export logic from App.tsx
        const exportData = {
            residents: mockResidents,
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
        expect(restoredResidents).toEqual(mockResidents);

        // Core properties check for schedules
        expect(restoredSchedules[0].id).toBe(mockSchedules[0].id);
        expect(restoredSchedules[0].name).toBe(mockSchedules[0].name);
        expect(restoredSchedules[0].data).toEqual(mockSchedules[0].data);

        // Verify date restoration (critical for non-string types)
        expect(restoredSchedules[0].createdAt.getTime()).toBe(mockSchedules[0].createdAt.getTime());
        expect(restoredSchedules[0].createdAt).toBeInstanceOf(Date);
    });
});
