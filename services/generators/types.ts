
import { Resident, ScheduleGrid } from '../../types';

export interface ScheduleGenerator {
    name: string;
    generate: (residents: Resident[], existing: ScheduleGrid, attemptIndex?: number) => ScheduleGrid;
}
