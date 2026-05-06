import { test, expect } from 'vitest';
import { healer } from '../services/healerSolver';
import { WeekByWeekGenerator } from '../services/generators/weekByWeek';
import { Resident, AssignmentType } from '../types';

test('Healer performance check', () => {
    const residents: Resident[] = Array.from({ length: 45 }, (_, i) => ({
        id: `r${i}`,
        name: `Resident ${i}`,
        level: (i % 3) + 1 as any,
        startYear: 2024,
        avoidResidentIds: []
    }));

    const existingSchedule = {};
    const historicalSchedules = {};

    const startWBW = Date.now();
    for (let i = 0; i < 20; i++) {
        WeekByWeekGenerator.generate(residents, existingSchedule, i, historicalSchedules);
    }
    const endWBW = Date.now();
    console.log(`WeekByWeek (20 seeds) time: ${endWBW - startWBW}ms`);

    const start = Date.now();
    const result = healer.solve(residents, existingSchedule, 0, historicalSchedules);
    const end = Date.now();

    console.log(`Execution time: ${end - start}ms`);
    expect(result).toBeDefined();
});