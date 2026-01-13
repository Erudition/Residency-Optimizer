
import { generateSchedule } from './scheduler';
import { Resident, ScheduleGrid } from '../types';

onmessage = async (e: MessageEvent) => {
    const { residents, existing, params } = e.data;

    try {
        const result = await generateSchedule(residents, existing, params, (progress, attemptsMade) => {
            postMessage({ type: 'progress', progress, attemptsMade });
        });
        postMessage({ type: 'success', data: result.schedule, winnerName: result.winnerName });
    } catch (error) {
        postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
    }
};
