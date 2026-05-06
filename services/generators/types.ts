import { Resident, ScheduleGrid } from '../../types';

export interface ScheduleGenerator {
    name: string;
    generate: (residents: Resident[], existing: ScheduleGrid, attemptIndex?: number, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number>) => ScheduleGrid;
}
