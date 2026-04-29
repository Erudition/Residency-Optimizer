import { generateSchedule } from './scheduler';
import { ConvergenceDataPoint } from '../types';

let currentAbortController: AbortController | null = null;

onmessage = async (e: MessageEvent) => {
    const { type, residents, existing, params, historicalSchedules, cohortAssignments } = e.data;

    if (type === 'cancel') {
        currentAbortController?.abort();
        return;
    }

    // Support legacy message format for backwards compatibility if needed, 
    // but prefer explicit 'generate' type
    if (type === 'generate' || !type) {
        currentAbortController?.abort();
        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        try {
            let lastPost = 0;
            const result = await generateSchedule(
                residents, 
                existing, 
                params, 
                (progress, attemptsMade, convergenceData) => {
                    const now = Date.now();
                    // Stream updates: every 500ms, or when progress hits 100%, 
                    // or whenever we have new convergence data (graph needs real-time points)
                    if (now - lastPost > 500 || progress === 100 || convergenceData) {
                        lastPost = now;
                        postMessage({ type: 'progress', progress, attemptsMade, convergenceData });
                    }
                }, 
                historicalSchedules, 
                cohortAssignments,
                undefined, // baseSeed
                signal
            );
            postMessage({ type: 'success', results: result.results });
        } catch (error: any) {
            if (signal.aborted || error?.name === 'AbortError') {
                postMessage({ type: 'aborted' });
            } else {
                postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
            }
        } finally {
            if (currentAbortController?.signal === signal) {
                currentAbortController = null;
            }
        }
    }
};
