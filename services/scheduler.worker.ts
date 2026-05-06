import { generateSchedule, sliceIntoYears } from './scheduler';
import { 
  getRequirementViolations, 
  getWeeklyViolations, 
  getAuditViolations 
} from './scheduler';
import { healSchedule } from './healer';

let cancelledAlgorithmIds = new Set<string>();
let isPromoteTriggered = false;
let overallProgress = 0;

let lastAttempts: Record<string, number> = {};
let lastExhaustionPoints: Record<string, number> = {};
let lastExhaustedCount = 0;

// Throttled progress updates to avoid flooding the UI thread
let lastUpdate = 0;
let pendingProgress: any = null;

const postProgress = (iteration: number, scores: (number | null)[], attempts: Record<string, number>, exhaustionPoints: Record<string, number>, exhaustedCount: number) => {
  const now = Date.now();
  lastAttempts = attempts;
  lastExhaustionPoints = exhaustionPoints;
  lastExhaustedCount = exhaustedCount;
  
  pendingProgress = { 
    type: 'progress', 
    iteration, 
    overallProgress, 
    bestScore: scores, 
    attempts, 
    exhaustionPoints, 
    exhaustedCount 
  };
  
  if (now - lastUpdate > 200) { // Throttled to 200ms
    postMessage(pendingProgress);
    pendingProgress = null;
    lastUpdate = now;
  }
};

onmessage = async (e: MessageEvent) => {
  const { type, totalYears, residents, historicalSchedules, constraints, params, algorithmIds } = e.data;

  if (type === 'generate') {
    cancelledAlgorithmIds.clear();
    isPromoteTriggered = false;
    overallProgress = 0;
    
    try {
      const result = await generateSchedule(
        e.data.year,
        totalYears,
        residents,
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
      // Reset promote flag before healer phase
      isPromoteTriggered = false;
      
      // Phase 2: Healer Phase (Off-thread)
      const healedResults = [];
      const unifiedResidents = result.unifiedResidents;
      
      for (let idx = 0; idx < result.results.length; idx++) {
        const res = result.results[idx];
        if (res.unifiedSchedule && idx < 1) {
           // Run healer on the unified grid
           // 150 iterations per result for fast execution
           console.log("Starting Healer phase for result", idx);
           const healedUnified = healSchedule(res.unifiedSchedule, unifiedResidents, e.data.year, undefined, e.data.historicalSchedules, (step, max) => {
             if (step % 10000 === 0) console.log("Healer progress:", step, "/", max);
             postMessage({ 
               type: 'progress', 
               overallProgress: 0.8 + (0.2 * (step / max)),
               healerProgress: Math.round((step / max) * 100)
             });
           });
           console.log("Healer phase complete");
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
        postMessage({ 
          type: 'progress', 
          iteration: 2000, 
          overallProgress, 
          healerProgress: Math.round(((idx + 1) / result.results.length) * 100),
          attempts: lastAttempts,
          exhaustionPoints: lastExhaustionPoints,
          exhaustedCount: lastExhaustedCount
        });
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
  } else if (type === 'start-heal') {
    const { grid, residents, historicalSchedules, startYear, totalYears } = e.data;
    isHealingActive = true;
    runHeal(grid, residents, historicalSchedules || {}, startYear, totalYears || 1);
  } else if (type === 'stop-heal') {
    isHealingActive = false;
  } else if (type === 'cancel') {
    isHealingActive = false;
    // Abort is handled by the main thread terminating the worker, 
    // but we can also use a flag if we wanted more graceful exit
  }

};

let isHealingActive = false;

async function runHeal(
  grid: any, 
  residents: any, 
  historicalSchedules: any,
  startYear: number,
  totalYears: number
) {
  let currentBest = JSON.parse(JSON.stringify(grid));
  currentBest = healSchedule(
    currentBest, 
    residents, 
    startYear,
    undefined,
    historicalSchedules,
    (step, max) => {
      postMessage({ 
        type: 'heal-ping', 
        healerProgress: Math.round((step / max) * 100)
      });
    }
  );
    
    // Calculate violations for reporting
    const reqViolations = getRequirementViolations(residents, currentBest, historicalSchedules, startYear).length;
    const weeklyViolations = getWeeklyViolations(residents, currentBest, startYear).length;
    const total = reqViolations + weeklyViolations;

    postMessage({ 
      type: 'heal-update', 
      schedule: currentBest, 
      violations: total 
    });
    
    // Once complete, terminate the state
    isHealingActive = false;
    postMessage({ type: 'heal-complete' });
}
