
import { generateSchedule } from './scheduler';
import { Resident, ScheduleGrid, ScheduleHistory } from '../types';

onmessage = async (e: MessageEvent) => {
    const { residents, existing, params, historicalSchedules } = e.data;

    try {
        const result = await generateSchedule(residents, existing, params, (progress, attemptsMade) => {
            postMessage({ type: 'progress', progress, attemptsMade });
        }, historicalSchedules);
        postMessage({ type: 'success', results: result.results });
    } catch (error) {
        postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
    }
};
