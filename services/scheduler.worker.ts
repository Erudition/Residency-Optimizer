import { generateSchedule, sliceIntoYears } from './scheduler';
import { 
  getRequirementViolations, 
  getWeeklyViolations, 
  getAuditViolations,
  getRequirementsViolationsCount
} from './scheduler';
import { healSchedule } from './healer';
import { deserializeProgramData } from './api/client';

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
  const programData = deserializeProgramData(e.data.programData);

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
        programData,
        params,
        algorithmIds,
        (id) => cancelledAlgorithmIds.has(id),
        (iteration, scores, attempts, exhaustionPoints, exhaustedCount) => {
          overallProgress = (exhaustedCount / algorithmIds.length) * 1.0; // 100% for generation
          postProgress(iteration, scores, attempts, exhaustionPoints, exhaustedCount);
        },
        () => isPromoteTriggered
      );
      isPromoteTriggered = false;

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
    const { grid, residents, historicalSchedules, startYear, totalYears, strategy } = e.data;
    isHealingActive = true;
    runHeal(grid, residents, historicalSchedules || {}, startYear, totalYears || 1, programData, strategy);
  } else if (type === 'stop-heal') {
    isHealingActive = false;
  } else if (type === 'cancel') {
    isHealingActive = false;
  }

};

let isHealingActive = false;
(globalThis as any).checkInterrupt = () => !isHealingActive;

async function runHeal(
  grid: any, 
  residents: any, 
  historicalSchedules: any,
  startYear: number,
  totalYears: number,
  programData?: any,
  strategy?: string
) {
  const getTrueViolations = (grid: any) => {
    let total = 0;
    const fullHistory = { ...historicalSchedules };
    if (totalYears === 3) {
      const sliced = sliceIntoYears(grid, startYear, 3);
      Object.assign(fullHistory, sliced);
      
      const reqsDeficit = getRequirementsViolationsCount(residents, grid, fullHistory, startYear, true, programData);
      
      let constraints = 0;
      let audit = 0;
      for (let offset = 0; offset < 3; offset++) {
        const y = startYear + offset;
        const yrResidents = residents.filter((r: any) => {
          const level = y - r.startYear + 1;
          return level >= 1 && level <= 3;
        });
        const yrGrid = sliced[y] || {};
        const constraintsList = getWeeklyViolations(yrResidents, yrGrid, programData, y);
        constraints += constraintsList.reduce((sum, v) => sum + (v.instances !== undefined ? v.instances : 1), 0);
        audit += getAuditViolations(yrResidents, fullHistory, programData, y);
      }
      total = reqsDeficit + constraints + audit;
    } else {
      fullHistory[startYear] = grid;
      const reqsDeficit = getRequirementsViolationsCount(residents, grid, fullHistory, startYear, false, programData);
      const constraintsList = getWeeklyViolations(residents, grid, programData, startYear);
      const constraints = constraintsList.reduce((sum, v) => sum + (v.instances !== undefined ? v.instances : 1), 0);
      const audit = getAuditViolations(residents, fullHistory, programData, startYear);
      total = reqsDeficit + constraints + audit;
    }
    return total;
  };

  let currentBest = JSON.parse(JSON.stringify(grid));
  currentBest = await healSchedule(
    currentBest, 
    residents, 
    programData,
    startYear,
    undefined,
    historicalSchedules,
    undefined,
    (step, max, v) => {
      postMessage({ 
        type: 'heal-ping', 
        healerProgress: Math.round((step / max) * 100),
        violations: getTrueViolations(currentBest)
      });
    },
    strategy
  );
    
    // Calculate final violations for reporting
    let total = getTrueViolations(currentBest);

    postMessage({ 
      type: 'heal-update', 
      schedule: currentBest, 
      violations: total 
    });
    
    // Once complete, terminate the state
    isHealingActive = false;
    postMessage({ type: 'heal-complete' });
}
