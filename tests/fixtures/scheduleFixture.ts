import { generateSchedule } from '../../services/scheduler';
import { healSchedule } from '../../services/healer';
import { Resident, ScheduleGrid, CompetitionPriority, AssignmentType } from '../../types';
import { TOTAL_WEEKS, GENERATE_RESIDENTS_FOR_YEAR } from '../../constants';

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

    // Build mock preloaded history
    const preloadedHistory: any = {};
    for (const r of residents) {
      preloadedHistory[r.id] = Array.from({ length: 52 }, () => ({
        assignment: null as any,
        locked: true,
      }));
    }

    const initialSchedule: ScheduleGrid = {};
    initialSchedule[lockedResId] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null as any, locked: false }));
    initialSchedule[lockedResId][11] = { assignment: 'VAC', locked: true };
    initialSchedule[lockedResId][12] = { assignment: 'VAC', locked: true };

    const result = await generateSchedule(
        2026, 
        1, 
        residents, 
        preloadedHistory, { existing: { 2026: initialSchedule } }, getMockProgramData(), 
        { tries: 50, priority: CompetitionPriority.BEST_SCORE, topN: 1 }, ['weekByWeek', 'staffingFirst', 'stochastic', 'educationFirst'], 
        () => false, 
        () => {}
    );
    
    const winner = result.results[0];
    const healedUnified = await healSchedule(winner.unifiedSchedule!, result.unifiedResidents, getMockProgramData(), 2026, 3000, preloadedHistory, { 2026: mockCohortMap }); 

    cachedFixture = {
        residents,
        mockCohortMap,
        lockedResId,
        schedule: healedUnified,
        preloadedHistory
    };

    return cachedFixture;
}

;

import { ProgramData } from '../../services/api/client';
export const getMockProgramData = (): ProgramData => {
  const mockRotations = new Map<string, any>();
  const originalGet = mockRotations.get.bind(mockRotations);
  mockRotations.get = (key: string) => {
    return originalGet(key) || { codename: key, intensity: 1, duration: 4, setting: 'INPATIENT', requirementTags: [] };
  };
  return {
    rotations: mockRotations as any,
    cycleConfig: { cohortCount: 5, X: 4, Y: 1, Z: 5, assignments: {} },
    residents: [],
    requirements: [],
    avoidanceRules: [],
    tags: [],
    rotationTags: new Map(),
    placeholderCodenames: new Set(),
    flexibleCodenames: new Set(),
    historicalSchedules: {},
    historicalCohorts: {}
  };
};
