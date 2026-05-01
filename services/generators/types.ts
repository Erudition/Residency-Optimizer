import { Resident, ScheduleGrid, ScheduleHistory } from '../../types';

export interface ScheduleGenerator {
    name: string;
    generate: (residents: Resident[], existing: ScheduleGrid, attemptIndex?: number, historicalSchedules?: ScheduleHistory, cohortAssignments?: Record<string, number>) => ScheduleGrid;
}
