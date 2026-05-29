import { buildLevelRequirements } from './generators/reqBuilder';
import type { ProgramData } from './api/client';
import { RequirementsEngine } from './requirementsEngine';
import { CompetitionParams, CompetitionPriority, Resident, PgyLevel, ScheduleGrid, ScheduleHistory, AssignmentType, ScheduleCell, ScheduleStats, CohortFairnessMetrics, RequirementViolation, WeeklyViolation, ResidentFairnessMetrics, ConvergenceDataPoint, CompetitionResult, ClinicalSetting, DetailedScore } from '../types';
import { TOTAL_WEEKS } from '../constants';
import { getAllCodenames, isClinicRotation, deriveLatestHistoricalYear } from './programDataUtils';
import { getRequirementCount, getCumulativeRequirementCount, getYearRequirementCount, getStandardCohortMap } from './generators/utils';
import { WeekByWeekGenerator } from './generators/weekByWeek';
import { StaffingFirstGenerator } from './generators/staffingFirst';
import { StochasticGenerator } from './generators/stochastic';
import { EducationFirstGenerator } from './generators/educationFirst';
/**
 * Main Scheduling Engine - Competition Mode (Async)
 * Returns both the schedule and the name of the winning algorithm.
 */

const WEEKS_PER_YEAR = 52;

// Helper to slice unified grid into yearly grids
export const sliceIntoYears = (unifiedGrid: ScheduleGrid, sYear: number, numYears: number): Record<number, ScheduleGrid> => {
  const years: Record<number, ScheduleGrid> = {};
  for (let y = 0; y < numYears; y++) {
    const yearGrid: ScheduleGrid = {};
    const yearStart = y * WEEKS_PER_YEAR;
    const yearEnd = (y + 1) * WEEKS_PER_YEAR;
    Object.entries(unifiedGrid)?.forEach(([rId, row]) => {
      yearGrid[rId] = row.slice(yearStart, yearEnd);
    });
    years[sYear + y] = yearGrid;
  }
  return years;
};

// Helper to merge yearly grids into a unified grid
export const mergeYearsIntoUnified = (yearsGrid: Record<number, ScheduleGrid>, sYear: number, numYears: number): ScheduleGrid => {
  const unifiedGrid: ScheduleGrid = {};
  const years = Array.from({ length: numYears }, (_, i) => sYear + i);
  const allResidentIds = new Set<string>();
  years.forEach(y => {
    const grid = yearsGrid[y];
    if (grid) {
      Object.keys(grid).forEach(rId => allResidentIds.add(rId));
    }
  });

  allResidentIds.forEach(rId => {
    const row: ScheduleCell[] = [];
    for (let y = 0; y < numYears; y++) {
      const year = sYear + y;
      const yearGrid = yearsGrid[year];
      const yearRow = yearGrid?.[rId];
      if (yearRow && yearRow.length === WEEKS_PER_YEAR) {
        row.push(...yearRow);
      } else {
        row.push(...Array(WEEKS_PER_YEAR).fill(null).map(() => ({ assignment: null, locked: false })));
      }
    }
    unifiedGrid[rId] = row;
  });

  return unifiedGrid;
};



export const getAugmentedResidents = (baseResidents: Resident[], maxYear: number, startYear?: number): Resident[] => {
  const derivedStartYear = startYear ?? deriveLatestHistoricalYear();
  const realResidents = baseResidents.filter(r => !r.isSynthetic);
  const minYear = realResidents.length > 0 ? Math.min(...realResidents.map(r => r.startYear), derivedStartYear) : derivedStartYear;
  
  const lastKnownYear = realResidents.length > 0 ? Math.max(...realResidents.map(r => r.startYear)) : derivedStartYear;
  const size = realResidents.length > 0 ? realResidents.filter(r => r.startYear === lastKnownYear).length : 12;

  const allResidents = [...realResidents];

  for (let currentY = minYear; currentY <= maxYear; currentY++) {
    const hasReal = realResidents.some(r => r.startYear === currentY);
    if (!hasReal) {
      const existingSynthetic = baseResidents.filter(r => r.startYear === currentY && r.isSynthetic);
      const cohort: Resident[] = [...existingSynthetic];
      
      const takenIndices = new Set<number>();
      existingSynthetic.forEach(r => {
        // Server-side synthetic names are formatted as "{index}, New {year} Resident"
        // (displayName = "{lastName}, {firstName}" where lastName is the index).
        // In-memory synthetic names are "New {year} Resident {index}".
        const startMatch = r.name.match(/^(\d+)/);
        const endMatch = r.name.match(/(\d+)$/);
        const idx = startMatch ? parseInt(startMatch[1], 10) : endMatch ? parseInt(endMatch[1], 10) : null;
        if (idx !== null) {
          takenIndices.add(idx);
        }
      });

      let nextIdx = 1;
      while (cohort.length < size) {
        if (!takenIndices.has(nextIdx)) {
          cohort.push({
            id: `c${currentY}-${nextIdx}`,
            name: `New ${currentY} Resident ${nextIdx}`,
            firstName: `New ${currentY} Resident`,
            lastName: `${nextIdx}`,
            startYear: currentY,
            level: 1,
            avoidResidentIds: [],
            isSynthetic: true,
          });
          takenIndices.add(nextIdx);
        }
        nextIdx++;
      }
      allResidents.push(...cohort);
    }
  }
  return allResidents;
};

export const getUnifiedResidents = (baseResidents: Resident[], startYear: number, totalYears: number): Resident[] => {
  const augmented = getAugmentedResidents(baseResidents, startYear + totalYears + 1, startYear);
  const totalSpanWeeks = totalYears * TOTAL_WEEKS;

  return augmented.filter(r => {
    const startActiveYear = r.transferInYear ?? r.startYear;
    const endActiveYear = r.transferOutYear ?? (r.startYear + 2);
    if (endActiveYear < startYear || startActiveYear >= startYear + totalYears) return false;
    
    const relStart = Math.max(0, (startActiveYear - startYear) * TOTAL_WEEKS);
    const relEnd = Math.min(totalSpanWeeks, (endActiveYear + 1 - startYear) * TOTAL_WEEKS);
    return relStart < relEnd;
  }).map(r => {
    const startActiveYear = r.transferInYear ?? r.startYear;
    const endActiveYear = r.transferOutYear ?? (r.startYear + 2);
    const relStart = Math.max(0, (startActiveYear - startYear) * TOTAL_WEEKS);
    const relEnd = Math.min(totalSpanWeeks, (endActiveYear + 1 - startYear) * TOTAL_WEEKS);
    return {
      ...r,
      level: (startYear - r.startYear + 1) as PgyLevel,
      activeWeekStart: relStart,
      activeWeekEnd: relEnd
    };
  });
};

export const buildCohortAssignments = (
  startYear: number,
  totalYears: number,
  unifiedResidents: Resident[],
  programData: any
): Record<number, Record<string, number>> => {
  const fullCohortAssignments: Record<number, Record<string, number>> = {};
  for (let y = startYear; y < startYear + totalYears; y++) {
    const yearCohorts: Record<string, number> = {};
    
    const ay = programData.academicYears?.find((ay: any) => ay.startingYear === y);
    if (ay?.canonicalSchedule?.cohortAssignments?.[y]) {
      Object.assign(yearCohorts, ay.canonicalSchedule.cohortAssignments[y]);
    }
    
    const activeForYear = unifiedResidents.filter(r => {
      const level = y - r.startYear + 1;
      const isPgyInRange = level >= 1 && level <= 3;
      const hasJoined = r.transferInYear === undefined || r.transferInYear <= y;
      const hasNotLeft = r.transferOutYear === undefined || r.transferOutYear >= y;
      return isPgyInRange && hasJoined && hasNotLeft;
    }).sort((a, b) => {
      const levelA = y - a.startYear + 1;
      const levelB = y - b.startYear + 1;
      if (levelA !== levelB) return levelA - levelB;
      return a.name.localeCompare(b.name);
    });

    activeForYear.forEach((r, idx) => {
      if (yearCohorts[r.id] === undefined) {
        yearCohorts[r.id] = r.cohort !== undefined ? r.cohort : (idx % programData.cycleConfig.cohortCount);
      }
    });
    
    fullCohortAssignments[y] = yearCohorts;
  }
  return fullCohortAssignments;
};

export const generateSchedule = async (
  startYear: number,
  totalYears: number,
  baseResidents: Resident[],
  historicalSchedules: ScheduleHistory,
  constraints: { existing: ScheduleHistory },
  programData: any, // ProgramData type (imported at top or just any)
  params: CompetitionParams,
  algorithmIds: string[],
  isAlgorithmCanceled: (id: string) => boolean,
  onProgress: (iteration: number, scores: (number | null)[], attempts: Record<string, number>, exhaustionPoints: Record<string, number>, exhaustedCount: number) => void,
  isPromoted: () => boolean = () => false
): Promise<{ results: CompetitionResult[], unifiedResidents: Resident[], cohortAssignments: Record<number, Record<string, number>> }> => {

  const { existing } = constraints;

  const unifiedResidents = getUnifiedResidents(baseResidents, startYear, totalYears);
  const totalSpanWeeks = totalYears * TOTAL_WEEKS;
  const derivedCohortAssignments = buildCohortAssignments(startYear, totalYears, unifiedResidents, programData);

  // Base unified grid with existing/continuity
  const buildBaseUnifiedGrid = (): ScheduleGrid => {
    const grid: ScheduleGrid = {};
    unifiedResidents?.forEach(r => {
      grid[r.id] = Array.from({ length: totalSpanWeeks }, () => ({ assignment: null as any, locked: false }));
      
      // Fill existing
      for (let y = startYear; y < startYear + totalYears; y++) {
        const yearOffset = (y - startYear) * WEEKS_PER_YEAR;
        if (existing[y] && existing[y][r.id]) {
          existing[y][r.id]?.forEach((cell, w) => {
            if (cell && cell.assignment) {
              grid[r.id][yearOffset + w] = { ...cell };
            }
          });
        }
      }

      // Prepend continuity prefix (last 4 weeks of prior year)
      // This is Task 2.3
      const firstActiveYear = Math.max(r.startYear, startYear);
      if (firstActiveYear > r.startYear && historicalSchedules[firstActiveYear - 1]) {
        const priorYearGrid = historicalSchedules[firstActiveYear - 1];
        if (priorYearGrid[r.id]) {
          const prefixStart = (firstActiveYear - startYear) * WEEKS_PER_YEAR;
          // Only if within span
          if (prefixStart < totalSpanWeeks) {
             // In multi-year, we don't necessarily "prepend" outside the grid, 
             // but ensure the first 4 weeks are locked to historical if available.
             // Wait, if firstActiveYear == startYear, there's no prefix IN the unified grid.
             // The generator should look at priorRequirementCounts for historical context.
          }
        }
      }
    });
    return grid;
  };

  const baseUnifiedGrid = buildBaseUnifiedGrid();

  const allGenerators = [
    { id: 'weekByWeek', generator: WeekByWeekGenerator, name: 'Week By Week' },

    { id: 'staffingFirst', generator: StaffingFirstGenerator, name: 'Staffing First' },
    { id: 'stochastic', generator: StochasticGenerator, name: 'Stochastic' },
    { id: 'educationFirst', generator: EducationFirstGenerator, name: 'Education First' },

  ];

  const selectedGenerators = algorithmIds.map(id => allGenerators.find(g => g.id === id)).filter(Boolean) as any[];
  if (selectedGenerators.length === 0) {
    selectedGenerators.push({ id: 'staffingFirst', generator: StaffingFirstGenerator, name: 'Staffing First' });
  }

  const results: CompetitionResult[] = [];
  const algoState: Record<string, {
    bestScore: number,
    lastBestIteration: number,
    iterationsToFindBest: number,
    exhausted: boolean,
    totalAttempts: number
  }> = {};

  selectedGenerators?.forEach(g => {
    algoState[g.id] = {
      bestScore: -Infinity,
      lastBestIteration: 0,
      iterationsToFindBest: 20, // Initial N_max bootstrap of 20 per winners.md
      exhausted: false,
      totalAttempts: 0
    };
  });

  // PRE-COMPUTE combined prior counts once (Efficiency fix)
  const combinedPriorCounts: Record<string, Record<string, number>> = {};
  unifiedResidents?.forEach(r => {
    combinedPriorCounts[r.id] = {};
    Object.entries(historicalSchedules)?.forEach(([yStr, grid]) => {
      if (parseInt(yStr) < startYear && grid[r.id]) {
        grid[r.id]?.forEach(c => {
          if (c && c.assignment) {
            combinedPriorCounts[r.id][c.assignment] = (combinedPriorCounts[r.id][c.assignment] || 0) + 1;
          }
        });
      }
    });
  });

  console.log(`Starting Unified Multi-Year Competition (${totalYears} years)...`);

  let i = 0;
  const HARD_CAP = params.tries || 1000000; // Safety cap

  while (i < HARD_CAP) {
    if (isPromoted()) {
      console.log("Promotion triggered - ending generation early with best results found so far.");
      break;
    }

    // Check if all active and non-canceled algorithms are exhausted
    const allExhausted = selectedGenerators.every(g => 
      isAlgorithmCanceled(g.id) || algoState[g.id].exhausted
    );

    if (allExhausted) {
      console.log(`All solvers exhausted after ${i} iterations. Stopping.`);
      break;
    }

    let promoted = false;

    for (let idx = 0; idx < selectedGenerators.length; idx++) {
      if (isPromoted()) {
        promoted = true;
        break;
      }
      
      const g = selectedGenerators[idx];
      const state = algoState[g.id];
      
      if (isAlgorithmCanceled(g.id) || state.exhausted) {
        continue;
      }

      state.totalAttempts++;

      try {
        let attemptTotalViolations = 0;
        let attemptUnderstaffing = 0;
        let totalScore = 0;

        const attemptSeed = i * selectedGenerators.length + idx;
        
        // (Already pre-computed outside the loop)

        // Call generator ONCE for the whole span
        const unifiedSchedule = await g.generator.generate(
          unifiedResidents, 
          JSON.parse(JSON.stringify(baseUnifiedGrid)), 
          programData,
          attemptSeed, 
          combinedPriorCounts,
          derivedCohortAssignments
        );

        // Score and validate unified grid
        totalScore = calculateScheduleScore(unifiedResidents, unifiedSchedule, programData, historicalSchedules);
        const reqViolations = RequirementsEngine.getViolations(unifiedResidents, unifiedSchedule, historicalSchedules, startYear, programData);
        const weekViolations = getWeeklyViolations(unifiedResidents, unifiedSchedule, programData);

        attemptTotalViolations = reqViolations.length + getAuditViolations(unifiedResidents, historicalSchedules, programData, startYear);
        attemptUnderstaffing = weekViolations.filter(v => v.issue.includes('Min')).length;
        
        const attemptFullData = sliceIntoYears(unifiedSchedule, startYear, totalYears);
        
        const score = totalScore;

        // 1. Improvement Logic
        if (score > state.bestScore) {
          const gap = state.totalAttempts - state.lastBestIteration;
          state.iterationsToFindBest = Math.max(state.iterationsToFindBest, gap);
          state.lastBestIteration = state.totalAttempts;
          state.bestScore = score;
        } 
        // 2. Exhaustion Logic
        else if (state.totalAttempts - state.lastBestIteration > state.iterationsToFindBest * 10) {
          state.exhausted = true;
          console.log(`Solver ${g.name} exhausted at attempt ${state.totalAttempts}. (Max Gap: ${state.iterationsToFindBest}, Window: ${state.iterationsToFindBest * 10})`);
        }

        // Check if this multi-year package qualifies for Top N (Higher is Better)
        const currentWorstScore = results.length >= (params.topN || 1) ? results[results.length - 1].score : -Infinity;
        
        if (score >= currentWorstScore || results.length < (params.topN || 1)) {
          const result: CompetitionResult = {
            schedule: attemptFullData,
            unifiedSchedule: unifiedSchedule,
            winnerName: g.name,
            score,
            totalViolations: attemptTotalViolations,
            understaffing: attemptUnderstaffing
          };

          results.push(result);
          results.sort((a, b) => b.score - a.score); // DESC sort (higher score first)

          if (results.length > (params.topN || 1)) {
            results.pop();
          }
        }
      } catch (e) {
        console.error(`Generator ${g.name} failed attempt ${i}`, e);
      }
    }

    if (promoted) break;

    const currentBestScores: (number | null)[] = [];
    const attemptCounts: Record<string, number> = {};
    const exhaustionPoints: Record<string, number> = {};
    let exhaustedCount = 0;

    selectedGenerators?.forEach(g => {
      const state = algoState[g.id];
      const isActuallyExhausted = isAlgorithmCanceled(g.id) || state.exhausted;
      if (isActuallyExhausted) exhaustedCount++;
      
      currentBestScores.push(isActuallyExhausted ? null : (state.bestScore === -Infinity ? -1000000 : state.bestScore));
      attemptCounts[g.id] = state.totalAttempts;
      exhaustionPoints[g.id] = state.lastBestIteration + (state.iterationsToFindBest * 10);
    });

    onProgress(i, currentBestScores, attemptCounts, exhaustionPoints, exhaustedCount);

    if (i % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    i++;
  }

  return { results, unifiedResidents, cohortAssignments: derivedCohortAssignments };
};

// --- Analysis Helpers (Kept for UI/Analysis) ---

export const calculateStats = (residents: Resident[], schedule: ScheduleGrid): ScheduleStats => {
  const stats: ScheduleStats = {};
  const safeGrid = schedule || {};
  residents?.forEach(r => {
    stats[r.id] = {} as Record<AssignmentType, number>;
    (safeGrid[r.id] || [])?.forEach(cell => {
      if (cell && cell.assignment) {
        stats[r.id][cell.assignment] = (stats[r.id][cell.assignment] || 0) + 1;
      }
    });
  });
  return stats;
};

export const getRequirementViolations = (residents: Resident[], schedule: ScheduleGrid, programData: ProgramData, historicalSchedules?: ScheduleHistory, activeYear?: number): RequirementViolation[] => {
  return RequirementsEngine.getViolations(residents, schedule, historicalSchedules || {}, activeYear || 2026, programData);
};


export const getWeeklyViolations = (residents: Resident[], schedule: ScheduleGrid, programData: ProgramData, activeYear?: number): WeeklyViolation[] => {
  return RequirementsEngine.getWeeklyViolations(residents, schedule, programData, activeYear);
};


export const getAuditViolations = (residents: Resident[], history: ScheduleHistory, programData: ProgramData, activeYear?: number): number => {
  return RequirementsEngine.getAuditViolations(residents, history, programData, activeYear);
};

export const getRequirementsViolationsCount = (
  residents: Resident[],
  schedule: ScheduleGrid,
  historicalSchedules: ScheduleHistory,
  startYear: number,
  isUnified: boolean,
  programData: ProgramData
): number => {
  const violations = RequirementsEngine.getViolations(
    residents,
    schedule,
    historicalSchedules,
    startYear,
    programData,
    isUnified
  );
  return violations.reduce((sum, v) => sum + Math.max(0, v.minWeeks - v.actual), 0);
};



const calculateSD = (values: number[], mean: number): number => {
  if (values.length === 0) return 0;
  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
};


export const calculateFairnessMetrics = (residents: Resident[], schedule: ScheduleGrid, programData: ProgramData): CohortFairnessMetrics[] => {
  const safeGrid = schedule || {};
  return [1, 2, 3].map(level => {
    const groupRes = residents.filter(r => r.level === level);
    const resMetrics: ResidentFairnessMetrics[] = groupRes.map(r => {
      const weeks = safeGrid[r.id] || [];
      let core = 0, elec = 0, req = 0, vac = 0, nf = 0, intensity = 0;

      let currentStreak = 0;
      let maxStreak = 0;
      let streakSummary: string[] = [];
      let currentStreakSummary: string[] = [];

      weeks?.forEach((c, idx) => {
        if (!c || !c.assignment) return;
        const m = programData.rotations.get(c.assignment as any);
        if (!m) return;

        if (programData.rotations.get(c.assignment)?.intensity && programData.rotations.get(c.assignment)!.intensity >= 3) core++;
        if (programData.flexibleCodenames.has(c.assignment)) elec++;
        if (!isClinicRotation(programData, c.assignment) && c.assignment !== 'VAC' && !programData.flexibleCodenames.has(c.assignment)) req++;
        if (c.assignment === 'VAC') vac++;
        if (c.assignment === 'NF') nf++;
        intensity += m.intensity;

        // Streak logic
        if (m.intensity >= 3) {
          currentStreak++;
          currentStreakSummary.push(`${c.assignment} (W${idx + 1})`);
          if (currentStreak > maxStreak) {
            maxStreak = currentStreak;
            streakSummary = [...currentStreakSummary];
          }
        } else if (m.intensity < 2) {
          currentStreak = 0;
          currentStreakSummary = [];
        }
      });

      return {
        id: r.id,
        name: r.name,
        level: r.level,
        coreWeeks: core,
        electiveWeeks: elec,
        requiredWeeks: req,
        vacationWeeks: vac,
        nightFloatWeeks: nf,
        totalIntensityScore: intensity,
        maxIntensityStreak: maxStreak,
        streakSummary
      };
    });

    const coreVals = resMetrics.map(m => m.coreWeeks);
    const elecVals = resMetrics.map(m => m.electiveWeeks);
    const intensityVals = resMetrics.map(m => m.totalIntensityScore);

    const meanCore = coreVals.reduce((a, b) => a + b, 0) / (coreVals.length || 1);
    const meanElective = elecVals.reduce((a, b) => a + b, 0) / (elecVals.length || 1);
    const meanIntensity = intensityVals.reduce((a, b) => a + b, 0) / (intensityVals.length || 1);

    const sdCore = calculateSD(coreVals, meanCore);
    const sdElective = calculateSD(elecVals, meanElective);
    const sdIntensity = calculateSD(intensityVals, meanIntensity);

    const cvCore = sdCore / (meanCore || 1);
    const cvIntensity = sdIntensity / (meanIntensity || 1);
    const penalty = (cvCore * 50) + (cvIntensity * 50);
    const fairnessScore = Math.max(0, Math.min(100, 100 - Math.round(penalty)));

    return {
      level,
      residents: resMetrics,
      meanCore,
      sdCore,
      meanElective,
      sdElective,
      meanIntensity,
      sdIntensity,
      fairnessScore
    };
  });
};

export const calculateDiversityStats = (residents: Resident[], schedule: ScheduleGrid): Record<string, number> => {
  const diversity: Record<string, number> = {};
  const safeGrid = schedule || {};

  residents?.forEach(r => {
    const partners = new Set<string>();
    const nonCoWorkingTypes = ['VAC', 'ELEC', 'RSCH'];

    for (let w = 0; w < TOTAL_WEEKS; w++) {
      const myAssign = safeGrid[r.id]?.[w]?.assignment;
      if (myAssign && !nonCoWorkingTypes.includes(myAssign)) {
        residents?.forEach(peer => {
          if (peer.id !== r.id && safeGrid[peer.id]?.[w]?.assignment === myAssign) {
            partners.add(peer.id);
          }
        });
      }
    }

    diversity[r.id] = residents.length > 1
      ? (partners.size / (residents.length - 1)) * 100
      : 0;
  });

  return diversity;
};

export const calculateScheduleScore = (residents: Resident[], schedule: ScheduleGrid, programData: ProgramData, historicalSchedules?: ScheduleHistory): number => {
  return calculateDetailedScheduleScore(residents, schedule, historicalSchedules || {}, programData).finalScore;
};

export const calculateDetailedScheduleScore = (residents: Resident[], schedule: ScheduleGrid, history: ScheduleHistory, programData: ProgramData): DetailedScore => {
  const safeGrid = schedule || {};
  const totalWeeks = Object.values(safeGrid)[0]?.length || 52;
  const { cohortCount, X, Y, Z } = programData.cycleConfig;
  const numYears = Math.ceil(totalWeeks / 52);

  // Component 1: Education Requirements (Weight: 0.490)
  let educationDenominator = 0;
  let educationNumerator = 0;

  const firstRes = residents?.find(res => res.startYear && res.startYear > 0);
  const baseYear = firstRes ? (firstRes.startYear + Number(firstRes.level) - 1) : deriveLatestHistoricalYear();

  residents?.forEach(r => {
    for (let yearIdx = 0; yearIdx < numYears; yearIdx++) {
      const currentYear = baseYear + yearIdx;
      const pgy = currentYear - r.startYear + 1;
      if (pgy < 1 || pgy > 3) continue;

      const pgyReqs = buildLevelRequirements(programData, pgy as any) || [];
      pgyReqs?.forEach(req => {
        const isACGME = req.source === 'ACGME';
        let minWeeks = req.minWeeks;
        let actual = 0;

        if (isACGME) {
          minWeeks = 0;
          for (let l = 1; l <= pgy; l++) {
            const levelReqs = buildLevelRequirements(programData, l as any) || [];
            const levelReq = levelReqs.find(rq => rq.type === req.type);
            minWeeks += levelReq ? levelReq.minWeeks : 0;
          }
          actual = RequirementsEngine.getActualWeeks(r, req.type, schedule, history || {}, currentYear, currentYear, true, programData);
        } else {
          actual = RequirementsEngine.getActualWeeks(r, req.type, schedule, history || {}, currentYear, currentYear, false, programData);
        }

        educationDenominator += minWeeks;
        educationNumerator += Math.min(minWeeks, actual);
      });
    }
  });

  const educationScore = educationDenominator > 0 ? (educationNumerator / educationDenominator) * 100 : 100;

  // Component 2: Staffing Requirements (Weight: 0.490)
  let staffingDenominator = 0;
  let staffingNumerator = 0;

  const cohortMap = getStandardCohortMap(residents, programData);

  for (let week = 0; week < totalWeeks; week++) {
    const activeResidentsAtWeek = residents.filter(r => {
      const start = r.activeWeekStart ?? 0;
      const end = r.activeWeekEnd ?? totalWeeks;
      return week >= start && week < end;
    });

    if (activeResidentsAtWeek.length === 0) continue;

    const assignments = activeResidentsAtWeek.map(r => safeGrid[r.id]?.[week]?.assignment);
    const clinicCount = assignments.filter(a => a && isClinicRotation(programData, a)).length;
    
    staffingDenominator += 1;
    staffingNumerator += clinicCount >= 1 ? 1 : 0;

    // Pool counts: computed once per week, shared across all rotation checks
    const { interns: poolInterns, seniors: poolSeniors } = RequirementsEngine.getStaffingCounts(activeResidentsAtWeek, week, baseYear);

    Array.from(programData.rotations.keys())?.forEach(type => {
      const meta = programData.rotations.get(type);
      if (!meta) return;

      const assignees = activeResidentsAtWeek.filter(r => safeGrid[r.id]?.[week]?.assignment === type);
      const { interns, seniors } = RequirementsEngine.getStaffingCounts(assignees, week, baseYear);

      if (meta.minInterns > 0) {
        staffingDenominator += meta.minInterns;
        staffingNumerator += Math.min(meta.minInterns, interns);
      }
      if (meta.maxInterns < poolInterns) {
        const diff = poolInterns - meta.maxInterns;
        staffingDenominator += diff;
        staffingNumerator += diff - Math.max(0, interns - meta.maxInterns);
      }
      if (meta.minSeniors > 0) {
        staffingDenominator += meta.minSeniors;
        staffingNumerator += Math.min(meta.minSeniors, seniors);
      }
      if (meta.maxSeniors < poolSeniors) {
        const diff = poolSeniors - meta.maxSeniors;
        staffingDenominator += diff;
        staffingNumerator += diff - Math.max(0, seniors - meta.maxSeniors);
      }
    });

    const jeopardyPgy2 = activeResidentsAtWeek.filter(r => {
      const pgy = RequirementsEngine.getPgyAtWeek(r, week, baseYear);
      const assign = safeGrid[r.id]?.[week]?.assignment;
      return pgy === 2 && assign && RequirementsEngine.isJeopardyBlock(assign, programData);
    }).length;

    const jeopardyPgy3 = activeResidentsAtWeek.filter(r => {
      const pgy = RequirementsEngine.getPgyAtWeek(r, week, baseYear);
      const assign = safeGrid[r.id]?.[week]?.assignment;
      return pgy === 3 && assign && RequirementsEngine.isJeopardyBlock(assign, programData);
    }).length;

    const seniorFlexibleCount = activeResidentsAtWeek.filter(r => {
      const pgy = RequirementsEngine.getPgyAtWeek(r, week, baseYear);
      if (pgy > 1) {
        const assign = safeGrid[r.id]?.[week]?.assignment;
        return assign && RequirementsEngine.isJeopardyBlock(assign, programData);
      }
      return false;
    }).length;

    staffingDenominator += 1;
    staffingNumerator += jeopardyPgy2 >= 1 ? 1 : 0;

    staffingDenominator += 1;
    staffingNumerator += jeopardyPgy3 >= 1 ? 1 : 0;

    staffingDenominator += 1;
    staffingNumerator += seniorFlexibleCount >= 1 ? 1 : 0;
  }

  residents?.forEach(r => {
    const cohort = cohortMap[r.id] ?? 0;
    const blockStartOffset = (cohort * Y + Y) % Z;
    const start = r.activeWeekStart ?? 0;
    const end = r.activeWeekEnd ?? totalWeeks;

    for (let week = start; week < end; week++) {
      const cell = safeGrid[r.id]?.[week];
      if (!cell || !cell.assignment) continue;

      const assign = cell.assignment;

      if (assign === 'VAC') {
        staffingDenominator += 1;
        staffingNumerator += (Math.floor((week % Z) / Y) !== cohort) ? 1 : 0;

        const blackoutWeeks = [0, 5, 6, 7, 8, 9, 50, 51];
        staffingDenominator += 1;
        staffingNumerator += (!blackoutWeeks.includes(week % 52)) ? 1 : 0;
      }
    }

    for (let cycle = 0; cycle < Math.floor(totalWeeks / Z); cycle++) {
      const startCycle = cycle * Z + blockStartOffset;
      if (startCycle + X > totalWeeks) continue;
      if (startCycle + (X - 1) < start || startCycle >= end) continue;

      const blockWeeks = Array.from({ length: X }, (_, i) => startCycle + i);
      const assignmentsInBlock = blockWeeks.map(w => safeGrid[r.id]?.[w]?.assignment);

      const hasVacation = assignmentsInBlock.includes('VAC');
      // Use intensity-based check: rotations with intensity >= 3 are core
      const hasCore = assignmentsInBlock.some(a => {
        if (!a) return false;
        const rotMeta = programData.rotations.get(a);
        return rotMeta && rotMeta.intensity >= 4;
      });

      if (hasCore) {
        staffingDenominator += 1;
        staffingNumerator += hasVacation ? 0 : 1;
      }
    }
  });

  const staffingScore = staffingDenominator > 0 ? (staffingNumerator / staffingDenominator) * 100 : 100;

  // Component 3: Total Intensity (Weight: 0.006)
  let actualTotalIntensity = 0;
  let minPossibleIntensity = 0;
  let maxPossibleIntensity = 0;

  residents?.forEach(r => {
    for (let week = 0; week < totalWeeks; week++) {
      const assign = safeGrid[r.id]?.[week]?.assignment;
      if (!assign) continue;

      const intensity = programData.rotations.get(assign as any)?.intensity || 0;
      actualTotalIntensity += intensity;

      if (isClinicRotation(programData, assign) || assign === 'VAC') {
        minPossibleIntensity += intensity;
        maxPossibleIntensity += intensity;
      } else {
        minPossibleIntensity += 1;
        maxPossibleIntensity += 5;
      }
    }
  });

  const intensityDiff = maxPossibleIntensity - minPossibleIntensity;
  const intensityScore = intensityDiff > 0 
    ? Math.max(0, 100 - ((actualTotalIntensity - minPossibleIntensity) / intensityDiff) * 100) 
    : 100;

  // Component 4: Streak Equity (Weight: 0.004)
  const maxStreaks = residents.map(r => {
    const weeks = safeGrid[r.id] || [];
    let currentStreak = 0;
    let maxStreak = 0;
    weeks?.forEach(c => {
      if (!c || !c.assignment) return;
      const m = programData.rotations.get(c.assignment as any);
      if (!m) return;
      if (m.intensity >= 3) {
        currentStreak++;
        if (currentStreak > maxStreak) maxStreak = currentStreak;
      } else if (m.intensity < 2) {
        currentStreak = 0;
      }
    });
    return maxStreak;
  });

  const meanStreak = maxStreaks.reduce((a, b) => a + b, 0) / (maxStreaks.length || 1);
  const streakSD = Math.sqrt(maxStreaks.reduce((s, n) => s + Math.pow(n - meanStreak, 2), 0) / (maxStreaks.length || 1));
  const worstCaseStreakSD = totalWeeks * Math.sqrt(residents.length - 1) / residents.length;
  const streakScore = worstCaseStreakSD > 0 
    ? Math.max(0, 100 - (streakSD / worstCaseStreakSD) * 100) 
    : 100;

  // Component 5: Coworking Diversity (Weight: 0.003)
  let weightedActualDiversity = 0;
  let weightedMaxDiversity = 0;

  residents?.forEach(r => {
    const pgy = r.level || 1;
    const weight = pgy === 1 ? 3 : pgy === 2 ? 2 : 1;

    const partners = new Set<string>();
    // Use all rotations with intensity >= 3 as clinical/team types for diversity scoring
    const clinicalCodenames = new Set<string>();
    for (const [cn, rotMeta] of programData.rotations.entries()) {
      if (rotMeta.intensity >= 3) clinicalCodenames.add(cn);
    }

    for (let w = 0; w < totalWeeks; w++) {
      const myAssign = safeGrid[r.id]?.[w]?.assignment;
      if (myAssign && clinicalCodenames.has(myAssign)) {
        residents?.forEach(peer => {
          if (peer.id !== r.id && safeGrid[peer.id]?.[w]?.assignment === myAssign) {
            partners.add(peer.id);
          }
        });
      }
    }

    weightedActualDiversity += weight * partners.size;
    weightedMaxDiversity += weight * (residents.length - 1);
  });

  const diversityScore = weightedMaxDiversity > 0 
    ? (weightedActualDiversity / weightedMaxDiversity) * 100 
    : 100;

  // Component 6: Jeopardy Pool Stability (Weight: 0.001)
  const jeopardyPoolSizes: number[] = [];
  for (let week = 0; week < totalWeeks; week++) {
    let size = 0;
    residents?.forEach(r => {
      const pgy = RequirementsEngine.getPgyAtWeek(r, week, baseYear);
      if (pgy > 1) {
        const assign = safeGrid[r.id]?.[week]?.assignment;
        if (assign && RequirementsEngine.isJeopardyBlock(assign, programData)) {
          size++;
        }
      }
    });
    jeopardyPoolSizes.push(size);
  }

  const totalJeopardyPoolSeniorsWeeks = jeopardyPoolSizes.reduce((a, b) => a + b, 0);
  const jeopardyPoolMean = totalJeopardyPoolSeniorsWeeks / (totalWeeks || 1);
  const jeopardyPoolSD = Math.sqrt(jeopardyPoolSizes.reduce((s, n) => s + Math.pow(n - jeopardyPoolMean, 2), 0) / (totalWeeks || 1));
  const worstCaseJeopardyPoolSD = totalJeopardyPoolSeniorsWeeks * Math.sqrt(totalWeeks - 1) / totalWeeks;
  const jeopardyPoolStabilityScore = worstCaseJeopardyPoolSD > 0 
    ? Math.max(0, 100 - (jeopardyPoolSD / worstCaseJeopardyPoolSD) * 100) 
    : 100;

  // Components 7-9: Cohort Fairness (PGY-1/2/3 Weights: 0.001 / 0.002 / 0.003)
  const cohortFairnessScores: Record<number, number> = {};

  [1, 2, 3]?.forEach(level => {
    const cohortResidents = residents.filter(r => r.level === level);
    if (cohortResidents.length === 0) {
      cohortFairnessScores[level] = 100;
      return;
    }

    const desirabilities = cohortResidents.map(r => {
      const weeks = safeGrid[r.id] || [];
      let coreCount = 0;
      let electiveCount = 0;
      let vacationCount = 0;

      weeks?.forEach(c => {
        if (!c || !c.assignment) return;
        if (programData.rotations.get(c.assignment)?.intensity && programData.rotations.get(c.assignment)!.intensity >= 3) coreCount++;
        if (programData.flexibleCodenames.has(c.assignment)) electiveCount++;
        if (c.assignment === 'VAC') vacationCount++;
      });

      return (electiveCount + vacationCount) - coreCount;
    });

    const desirabilityMean = desirabilities.reduce((a, b) => a + b, 0) / cohortResidents.length;
    const desirabilitySD = Math.sqrt(desirabilities.reduce((s, n) => s + Math.pow(n - desirabilityMean, 2), 0) / cohortResidents.length);
    const worstCaseDesirabilitySD = totalWeeks;
    cohortFairnessScores[level] = worstCaseDesirabilitySD > 0 
      ? Math.max(0, 100 - (desirabilitySD / worstCaseDesirabilitySD) * 100) 
      : 100;
  });

  // Weighted sum out of 100
  const finalScore = 
    (educationScore * 0.490) +
    (staffingScore * 0.490) +
    (intensityScore * 0.006) +
    (streakScore * 0.004) +
    (diversityScore * 0.003) +
    (jeopardyPoolStabilityScore * 0.001) +
    (cohortFairnessScores[3] * 0.003) +
    (cohortFairnessScores[2] * 0.002) +
    (cohortFairnessScores[1] * 0.001);

  return {
    finalScore,
    educationScore,
    staffingScore,
    intensityScore,
    streakScore,
    diversityScore,
    jeopardyPoolStabilityScore,
    cohortFairnessScores
  };
};
