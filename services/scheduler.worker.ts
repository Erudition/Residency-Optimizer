import { generateSchedule } from './scheduler';

let cancelledAlgorithmIds = new Set<string>();
let isPromoteTriggered = false;
let overallProgress = 0;

// Throttled progress updates to avoid flooding the UI thread
let lastUpdate = 0;
let pendingProgress: any = null;

const postProgress = (iteration: number, scores: number[], attempts: number) => {
  const now = Date.now();
  pendingProgress = { type: 'progress', iteration, overallProgress, bestScore: scores, attempts };
  
  if (now - lastUpdate > 200) { // Throttled to 200ms
    postMessage(pendingProgress);
    pendingProgress = null;
    lastUpdate = now;
  }
};

onmessage = async (e: MessageEvent) => {
  const { type, totalYears, historicalSchedules, constraints, params, algorithmIds } = e.data;

  if (type === 'generate') {
    cancelledAlgorithmIds.clear();
    isPromoteTriggered = false;
    overallProgress = 0;
    
    try {
      const result = await generateSchedule(
        e.data.year,
        totalYears,
        historicalSchedules,
        constraints,
        params,
        algorithmIds,
        (id) => cancelledAlgorithmIds.has(id),
        (iteration, scores, attempts) => {
          overallProgress = iteration / (params.tries || 300);
          postProgress(iteration, scores, attempts);
        },
        () => isPromoteTriggered
      );


      // Flush any pending progress
      if (pendingProgress) {
        postMessage(pendingProgress);
        pendingProgress = null;
      }

      // result.results already contains CompetitionResult[] where .schedule is the full multi-year Record
      postMessage({ type: 'success', results: result.results });
    } catch (error) {
      postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  } else if (type === 'promote') {
    isPromoteTriggered = true;
  } else if (type === 'cancelAlgorithm') {
    cancelledAlgorithmIds.add(e.data.algoId);
  } else if (type === 'cancel') {
    // Abort is handled by the main thread terminating the worker, 
    // but we can also use a flag if we wanted more graceful exit
  }

};
