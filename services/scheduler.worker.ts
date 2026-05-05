import { generateSchedule, sliceIntoYears } from './scheduler';
import { healSchedule } from './healer';

let cancelledAlgorithmIds = new Set<string>();
let isPromoteTriggered = false;
let overallProgress = 0;

// Throttled progress updates to avoid flooding the UI thread
let lastUpdate = 0;
let pendingProgress: any = null;

const postProgress = (iteration: number, scores: (number | null)[], attempts: number[], exhaustionPoints: number[], exhaustedCount: number) => {
  const now = Date.now();
  pendingProgress = { type: 'progress', iteration, overallProgress, bestScore: scores, attempts, exhaustionPoints, exhaustedCount };
  
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
        (iteration, scores, attempts, exhaustionPoints, exhaustedCount) => {
          overallProgress = (exhaustedCount / algorithmIds.length) * 0.8; // 80% for generation
          postProgress(iteration, scores, attempts, exhaustionPoints, exhaustedCount);
        },
        () => isPromoteTriggered
      );

      // Phase 2: Healer Phase (Off-thread)
      const healedResults = [];
      const unifiedResidents = result.unifiedResidents;
      
      for (let idx = 0; idx < result.results.length; idx++) {
        const res = result.results[idx];
        if (res.unifiedSchedule) {
           // Run healer on the unified grid
           // 1000 iterations per result
           const healedUnified = healSchedule(res.unifiedSchedule, unifiedResidents, e.data.year, 1000);
           const reSliced = sliceIntoYears(healedUnified, e.data.year, totalYears);
           
           healedResults.push({
             ...res,
             schedule: reSliced,
             unifiedSchedule: healedUnified
           });
        } else {
           healedResults.push(res);
        }
        
        // Progress: Last 20% is healing
        overallProgress = 0.8 + (0.2 * ((idx + 1) / result.results.length));
        postMessage({ type: 'progress', iteration: 2000, overallProgress, healerProgress: Math.round(((idx + 1) / result.results.length) * 100) });
      }

      result.results = healedResults;


      // Flush any pending progress
      if (pendingProgress) {
        postMessage(pendingProgress);
        pendingProgress = null;
      }

      postMessage({ type: 'success', results: result.results, unifiedResidents: result.unifiedResidents });
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
