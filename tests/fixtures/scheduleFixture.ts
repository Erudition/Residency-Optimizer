import { generateSchedule } from '../../services/scheduler';
import { healSchedule } from '../../services/healer';
import { Resident, ScheduleGrid, CompetitionPriority, AssignmentType } from '../../types';
import { TOTAL_WEEKS, GENERATE_RESIDENTS_FOR_YEAR } from '../../constants';
import { preloadHistoricalData } from '../../services/generators/historyPreloader';

let cachedFixture: {
    residents: Resident[];
    mockCohortMap: Record<string, number>;
    lockedResId: string;
    schedule: ScheduleGrid;
    preloadedHistory: any;
} | null = null;

export async function getScheduleFixture() {
    if (cachedFixture) return cachedFixture;

    const residents = GENERATE_RESIDENTS_FOR_YEAR(2026);
    const mockCohortMap: Record<string, number> = residents.reduce((acc, r, idx) => ({ ...acc, [r.id]: idx % 5 }), {});
    const lockedResId = residents[0].id;

    const { history: preloadedHistory } = preloadHistoricalData(residents);

    const initialSchedule: ScheduleGrid = {};
    initialSchedule[lockedResId] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null as any, locked: false }));
    initialSchedule[lockedResId][11] = { assignment: 'VAC', locked: true };
    initialSchedule[lockedResId][12] = { assignment: 'VAC', locked: true };

    const result = await generateSchedule(
        2026, 
        1, 
        residents, 
        preloadedHistory, 
        { existing: { 2026: initialSchedule }, cohortAssignments: { 2026: mockCohortMap } }, 
        { tries: 50, priority: CompetitionPriority.BEST_SCORE, topN: 1 }, 
        ['weekByWeek', 'staffingFirst', 'stochastic', 'educationFirst'], 
        () => false, 
        () => {}
    );
    
    const winner = result.results[0];
    const healedUnified = await healSchedule(winner.unifiedSchedule!, result.unifiedResidents, 2026, 3000, preloadedHistory, { 2026: mockCohortMap }); 

    cachedFixture = {
        residents,
        mockCohortMap,
        lockedResId,
        schedule: healedUnified,
        preloadedHistory
    };

    return cachedFixture;
}
