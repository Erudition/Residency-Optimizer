import { generateSchedule } from './scheduler';
import { Resident, ScheduleGrid, ScheduleHistory } from '../types';

onmessage = async (e: MessageEvent) => {
    const { residents, existing, params, historicalSchedules, cohortAssignments } = e.data;

    try {
        let lastPost = 0;
        const result = await generateSchedule(residents, existing, params, (progress, attemptsMade) => {
            const now = Date.now();
            if (now - lastPost > 1000 || progress === 100) {
                lastPost = now;
                postMessage({ type: 'progress', progress, attemptsMade });
            }
        }, historicalSchedules, cohortAssignments);
        postMessage({ type: 'success', results: result.results });
    } catch (error) {
        postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
    }
};
