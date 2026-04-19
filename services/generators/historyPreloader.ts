import { ScheduleHistory, AssignmentType, Resident } from '../../types';
import { ACTIVE_START_YEAR } from '../../constants';
import historicalGridData from '../../specification/historical_schedules_grid.json';

export const preloadHistoricalData = (residents: Resident[]): ScheduleHistory => {
    const history: ScheduleHistory = {};

    const findId = (name: string) => residents.find(r => r.name === name)?.id;

    const years = Object.keys(historicalGridData).map(Number).filter(y => y < ACTIVE_START_YEAR);

    years.forEach(year => {
        history[year] = {};
        const yearData = (historicalGridData as any)[year];
        if (!yearData) return;

        // Years before the current one (ACTIVE_START_YEAR - 1) are fully completed
        // and should be locked unconditionally. The current year's locking is
        // determined at runtime by getCurrentWeekForYear() in App.tsx.
        const isFullyCompleted = year < ACTIVE_START_YEAR - 1;

        Object.entries(yearData).forEach(([name, assignments]) => {
            const id = findId(name);
            if (!id) return;

            history[year][id] = (assignments as (string | null)[]).map(type => ({
                assignment: type as AssignmentType,
                locked: isFullyCompleted
            }));
        });
    });

    return history;
};
