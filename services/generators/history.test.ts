import { describe, it, expect } from 'vitest';
import { preloadHistoricalData } from './historyPreloader';
import { GENERATE_INITIAL_RESIDENTS } from '../../constants';
import historicalGridData from '../../specification/historical_schedules_grid_v2.json';

describe('Historical Data Integrity', () => {
    const residents = GENERATE_INITIAL_RESIDENTS();

    it('should hydrate historical data without errors', () => {
        const { history, cohortAssignments } = preloadHistoricalData(residents);
        
        const years = Object.keys(historicalGridData).map(Number);
        
        years.forEach(year => {
            expect(history[year]).toBeDefined();
            expect(cohortAssignments[year]).toBeDefined();
            
            const rawYearData = (historicalGridData as any)[year];
            const processedYearData = history[year];
            
            // Check that all residents in the JSON who exist in the master list are hydrated
            Object.keys(rawYearData).forEach(name => {
                const resident = residents.find(r => r.name === name);
                if (resident) {
                    expect(processedYearData[resident.id]).toBeDefined();
                    expect(processedYearData[resident.id].length).toBe(52);
                    expect(cohortAssignments[year][resident.id]).toBeGreaterThanOrEqual(0);
                }
            });
        });
    });

    it('should map legacy assignment types correctly', () => {
        const { history } = preloadHistoricalData(residents);
        
        // Find a specific known legacy mapping in the history
        // e.g., 'Met Wards' -> 'METRO' ('METRO')
        let foundMetro = false;
        Object.values(history).forEach(yearData => {
            Object.values(yearData).forEach(assignments => {
                assignments.forEach(a => {
                    if (a.assignment === 'METRO') foundMetro = true;
                });
            });
        });
        
        expect(foundMetro).toBe(true);
    });
});
