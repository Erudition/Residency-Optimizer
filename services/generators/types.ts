import { Resident, ScheduleGrid } from '../../types';

import type { ProgramData } from '../api/client';

export interface ScheduleGenerator {
    name: string;
    generate: (residents: Resident[], existing: ScheduleGrid, programData: ProgramData, attemptIndex?: number, priorRequirementCounts?: Record<string, Record<string, number>>, cohortAssignments?: Record<string, number> | Record<number, Record<string, number>>) => ScheduleGrid;
}
