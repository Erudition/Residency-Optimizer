import { generateSchedule } from './scheduler';

let cancelledAlgorithmIds = new Set<string>();
let isPromoteTriggered = false;
let overallProgress = 0;

// Throttled progress updates to avoid flooding the UI thread
let lastUpdate = 0;
let pendingProgress: any = null;

const postProgress = (iteration: number, scores: number[], attempts: number, exhaustionPoints: number[]) => {
  const now = Date.now();
  pendingProgress = { type: 'progress', iteration, overallProgress, bestScore: scores, attempts, exhaustionPoints };
  
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
        (iteration, scores, attempts, exhaustionPoints) => {
          // Overall progress is % of non-canceled algorithms that are exhausted
          // but that's hard to calculate here since we don't have the exhausted flag easily.
          // Let's just use iteration / 1000 as a rough indicator or just keep it simple.
          overallProgress = Math.min(0.99, iteration / 1000); 
          postProgress(iteration, scores, attempts, exhaustionPoints);
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
