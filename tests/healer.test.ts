import { describe, test, expect } from 'vitest';
import { healer } from '../services/healerSolver';
import { ScheduleGrid, Resident } from '../types';
import { getMockProgramData } from './fixtures/scheduleFixture';

describe('Healer Solver Strategies', () => {
    test('runs healer with each strategy successfully', async () => {
        const programData = getMockProgramData();
        const residents: Resident[] = [
            { id: 'res1', name: 'Dr. A', level: 1, startYear: 2026, activeWeekStart: 0, activeWeekEnd: 52 },
            { id: 'res2', name: 'Dr. B', level: 1, startYear: 2026, activeWeekStart: 0, activeWeekEnd: 52 },
        ];

        const schedule: ScheduleGrid = {
            'res1': Array(52).fill(null).map(() => ({ assignment: 'ELEC' })),
            'res2': Array(52).fill(null).map(() => ({ assignment: 'ELEC' })),
        };

        const strategies = ['4-block', '3-way', '2-way', 'default'];

        for (const strategy of strategies) {
            const solved = await healer.solve(
                residents,
                schedule,
                programData,
                0,
                {},
                {},
                undefined,
                strategy
            );
            expect(solved).toBeDefined();
            expect(Object.keys(solved).length).toBe(2);
            expect(solved['res1'].length).toBe(52);
        }
    });
});
