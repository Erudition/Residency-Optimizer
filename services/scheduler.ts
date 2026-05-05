import { CompetitionParams, CompetitionPriority, Resident, PgyLevel, ScheduleGrid, ScheduleHistory, AssignmentType, ScheduleCell, ScheduleStats, CohortFairnessMetrics, RequirementViolation, WeeklyViolation, ResidentFairnessMetrics, ConvergenceDataPoint, CompetitionResult, ClinicalSetting } from '../types';
import { TOTAL_WEEKS, COHORT_COUNT, ROTATION_METADATA, CORE_TYPES, REQUIRED_TYPES, ELECTIVE_TYPES, VACATION_TYPE, REQUIREMENTS, fulfillsRequirement, ACTIVE_START_YEAR } from '../constants';
import { getRequirementCount, getCumulativeRequirementCount, getYearRequirementCount } from './generators/utils';
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
    Object.entries(unifiedGrid).forEach(([rId, row]) => {
      yearGrid[rId] = row.slice(yearStart, yearEnd);
    });
    years[sYear + y] = yearGrid;
  }
  return years;
};



export const getAugmentedResidents = (baseResidents: Resident[], maxYear: number, startYear: number = ACTIVE_START_YEAR): Resident[] => {
  const minYear = Math.min(...baseResidents.map(r => r.startYear), startYear);
  const allResidents = [...baseResidents];
  for (let currentY = minYear; currentY <= maxYear; currentY++) {
    if (!allResidents.some(r => r.startYear === currentY)) {
      const lastKnownYear = Math.max(...baseResidents.map(r => r.startYear));
      const size = baseResidents.filter(r => r.startYear === lastKnownYear).length;
      for (let i = 0; i < size; i++) {
        allResidents.push({
          id: `c${currentY}-${i+1}`,
          name: `New ${currentY} Resident ${i+1}`,
          startYear: currentY,
          level: 1,
          avoidResidentIds: [],
        });
      }
    }
  }
  return allResidents;
};

export const getUnifiedResidents = (baseResidents: Resident[], startYear: number, totalYears: number): Resident[] => {
  const augmented = getAugmentedResidents(baseResidents, startYear + totalYears + 1, startYear);
  const totalSpanWeeks = totalYears * TOTAL_WEEKS;

  return augmented.filter(r => {
    const firstLevel = startYear - r.startYear + 1;
    const lastLevel = (startYear + totalYears - 1) - r.startYear + 1;
    return (firstLevel <= 3 && lastLevel >= 1);
  }).map(r => {
    const relStart = Math.max(0, (r.startYear - startYear) * TOTAL_WEEKS);
    const relEnd = Math.min(totalSpanWeeks, (r.startYear + 3 - startYear) * TOTAL_WEEKS);
    return {
      ...r,
      level: (startYear - r.startYear + 1) as PgyLevel,
      activeWeekStart: relStart,
      activeWeekEnd: relEnd
    };
  });
};

export const generateSchedule = async (
  startYear: number,
  totalYears: number,
  baseResidents: Resident[],
  historicalSchedules: ScheduleHistory,
  constraints: { existing: ScheduleHistory, cohortAssignments: Record<number, Record<string, number>> },
  params: CompetitionParams,
  algorithmIds: string[],
  isAlgorithmCanceled: (id: string) => boolean,
  onProgress: (iteration: number, scores: (number | null)[], attempts: Record<string, number>, exhaustionPoints: Record<string, number>, exhaustedCount: number) => void,
  isPromoted: () => boolean = () => false
): Promise<{ results: CompetitionResult[], unifiedResidents: Resident[] }> => {

  const { existing, cohortAssignments } = constraints;

  const unifiedResidents = getUnifiedResidents(baseResidents, startYear, totalYears);
  const totalSpanWeeks = totalYears * TOTAL_WEEKS;

  // Base unified grid with existing/continuity
  const buildBaseUnifiedGrid = (): ScheduleGrid => {
    const grid: ScheduleGrid = {};
    unifiedResidents.forEach(r => {
      grid[r.id] = Array.from({ length: totalSpanWeeks }, () => ({ assignment: null as any, locked: false }));
      
      // Fill existing
      for (let y = startYear; y < startYear + totalYears; y++) {
        const yearOffset = (y - startYear) * WEEKS_PER_YEAR;
        if (existing[y] && existing[y][r.id]) {
          existing[y][r.id].forEach((cell, w) => {
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
    { id: 'greedy', generator: WeekByWeekGenerator, name: 'Week By Week' },

    { id: 'experimental', generator: StaffingFirstGenerator, name: 'Staffing First' },
    { id: 'stochastic', generator: StochasticGenerator, name: 'Stochastic' },
    { id: 'strict', generator: EducationFirstGenerator, name: 'Education First' },

  ];

  const selectedGenerators = algorithmIds.map(id => allGenerators.find(g => g.id === id)).filter(Boolean) as any[];
  if (selectedGenerators.length === 0) {
    selectedGenerators.push({ id: 'experimental', generator: StaffingFirstGenerator, name: 'Staffing First' });
  }

  const results: CompetitionResult[] = [];
  const algoState: Record<string, {
    bestScore: number,
    lastBestIteration: number,
    iterationsToFindBest: number,
    exhausted: boolean,
    totalAttempts: number
  }> = {};

  selectedGenerators.forEach(g => {
    algoState[g.id] = {
      bestScore: -Infinity,
      lastBestIteration: 0,
      iterationsToFindBest: 1, // Start with 1, will grow based on gaps
      exhausted: false,
      totalAttempts: 0
    };
  });

  // PRE-COMPUTE combined prior counts once (Efficiency fix)
  const combinedPriorCounts: Record<string, Record<string, number>> = {};
  unifiedResidents.forEach(r => {
    combinedPriorCounts[r.id] = {};
    Object.entries(historicalSchedules).forEach(([yStr, grid]) => {
      if (parseInt(yStr) < startYear && grid[r.id]) {
        grid[r.id].forEach(c => {
          if (c && c.assignment) {
            combinedPriorCounts[r.id][c.assignment] = (combinedPriorCounts[r.id][c.assignment] || 0) + 1;
          }
        });
      }
    });
  });

  console.log(`Starting Unified Multi-Year Competition (${totalYears} years)...`);

  let i = 0;
  const HARD_CAP = params.tries || 2000; // Safety cap

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
        const unifiedSchedule = g.generator.generate(
          unifiedResidents, 
          JSON.parse(JSON.stringify(baseUnifiedGrid)), 
          attemptSeed, 
          combinedPriorCounts, 
          cohortAssignments[startYear] // Note: cohort assignments might vary by year, but usually static per resident
        );

        // Score and validate unified grid
        totalScore = calculateScheduleScore(unifiedResidents, unifiedSchedule, historicalSchedules);
        const reqViolations = getRequirementViolations(unifiedResidents, unifiedSchedule, historicalSchedules, startYear);
        const weekViolations = getWeeklyViolations(unifiedResidents, unifiedSchedule);

        attemptTotalViolations = reqViolations.length + weekViolations.length;
        attemptUnderstaffing = weekViolations.filter(v => v.issue.includes('Min')).length;
        
        const attemptFullData = sliceIntoYears(unifiedSchedule, startYear, totalYears);
        
        const score = totalScore;

        // 1. Improvement Logic
        if (score > state.bestScore) {
          const gap = i - state.lastBestIteration;
          state.iterationsToFindBest = Math.max(state.iterationsToFindBest, gap);
          state.lastBestIteration = i;
          state.bestScore = score;
        } 
        // 2. Exhaustion Logic
        else if (i - state.lastBestIteration > state.iterationsToFindBest * 10) {
          state.exhausted = true;
          console.log(`Solver ${g.name} exhausted at iteration ${i}. (Max Gap: ${state.iterationsToFindBest}, Window: ${state.iterationsToFindBest * 10})`);
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

    selectedGenerators.forEach(g => {
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

  return { results, unifiedResidents };
};

// --- Analysis Helpers (Kept for UI/Analysis) ---

export const calculateStats = (residents: Resident[], schedule: ScheduleGrid): ScheduleStats => {
  const stats: ScheduleStats = {};
  const safeGrid = schedule || {};
  residents.forEach(r => {
    stats[r.id] = {} as Record<AssignmentType, number>;
    Object.values(AssignmentType).forEach(t => stats[r.id][t] = 0);
    (safeGrid[r.id] || []).forEach(cell => { if (cell && cell.assignment) stats[r.id][cell.assignment]++; });
  });
  return stats;
};

export const getRequirementViolations = (residents: Resident[], schedule: ScheduleGrid, historicalSchedules?: ScheduleHistory, activeYear?: number): RequirementViolation[] => {
  const violations: RequirementViolation[] = [];
  const safeGrid = schedule || {};
  
  const filteredHistory: ScheduleHistory = {};
  if (historicalSchedules) {
    Object.entries(historicalSchedules).forEach(([yStr, grid]) => {
      const y = parseInt(yStr);
      if (activeYear === undefined || y < activeYear) {
        filteredHistory[y] = grid;
      }
    });
  }

  const totalWeeks = Object.values(safeGrid)[0]?.length || 52;
  const numYears = Math.ceil(totalWeeks / 52);

  residents.forEach(r => {
    for (let yearIdx = 0; yearIdx < numYears; yearIdx++) {
      const yearStart = yearIdx * 52;
      const yearEnd = Math.min((yearIdx + 1) * 52, totalWeeks);
      const relativeYear = activeYear !== undefined ? activeYear + yearIdx : r.startYear + yearIdx;
      const pgyLevel = relativeYear - r.startYear + 1;
      
      if (pgyLevel < 1 || pgyLevel > 3) continue;

      const reqs = REQUIREMENTS[pgyLevel] || [];
      reqs.forEach(req => {
        const count = getYearRequirementCount(safeGrid[r.id] || [], req.type, yearStart, yearEnd);
        if (count < req.minWeeks) {
          violations.push({ 
            residentId: r.id, 
            type: req.type, 
            minWeeks: req.minWeeks, 
            actual: count,
            year: relativeYear
          });
        }
      });
    }
  });
  return violations;
};


export const getWeeklyViolations = (residents: Resident[], schedule: ScheduleGrid, activeYear?: number): WeeklyViolation[] => {
  const violations: WeeklyViolation[] = [];
  const safeGrid = schedule || {};
  
  const totalWeeks = Object.values(safeGrid)[0]?.length || 52;
  
  for (let week = 0; week < totalWeeks; week++) {
    const assignments = residents.map(r => safeGrid[r.id]?.[week]?.assignment);
    const clinicCount = assignments.filter(a => a === AssignmentType.CLINIC || a === AssignmentType.NIMA_CLINIC).length;
    if (clinicCount === 0) {
      violations.push({ week, type: AssignmentType.CLINIC, issue: `No residents in clinic in week ${week + 1}`, year: Math.floor(week / 52) + (activeYear || 2026) });
    }

    Object.values(AssignmentType).forEach(type => {
      const meta = ROTATION_METADATA[type];
      if (!meta) return;

      const assignees = residents.filter(r => safeGrid[r.id]?.[week]?.assignment === type);
      const interns = assignees.filter(r => (r.level + Math.floor(week / 52)) === 1).length;
      const seniors = assignees.filter(r => (r.level + Math.floor(week / 52)) > 1).length;

      if (interns < meta.minInterns) {
        violations.push({ week, type, issue: `Min Interns (${meta.minInterns}) unmet: ${interns}`, year: Math.floor(week / 52) + (activeYear || 2026) });
      }
      if (interns > meta.maxInterns) {
        violations.push({ week, type, issue: `Max Interns (${meta.maxInterns}) exceeded: ${interns}`, year: Math.floor(week / 52) + (activeYear || 2026) });
      }
      if (seniors < meta.minSeniors) {
        violations.push({ week, type, issue: `Min Seniors (${meta.minSeniors}) unmet: ${seniors}`, year: Math.floor(week / 52) + (activeYear || 2026) });
      }
      if (seniors > meta.maxSeniors) {
        violations.push({ week, type, issue: `Max Seniors (${meta.maxSeniors}) exceeded: ${seniors}`, year: Math.floor(week / 52) + (activeYear || 2026) });
      }
    });
  }

  // PTO Policy, Clinic Site validations, and Jeopardy Pool Monitoring
  residents.forEach(r => {
    const cohort = r.cohort || 0;
    const blockStartOffset = (5 - cohort) % 5;

    for (let week = 0; week < totalWeeks; week++) {
      const cell = safeGrid[r.id]?.[week];
      if (!cell || !cell.assignment) continue;

      const assign = cell.assignment;
      const pgy = r.level + Math.floor(week / 52);

      // T6.3: PGY-specific Clinic Sites
      if (pgy === 2 && assign === AssignmentType.CLINIC) {
        violations.push({
          week,
          type: AssignmentType.CLINIC,
          issue: `Clinic site mismatch for PGY-2 ${r.name}: assigned CCIM clinic but requires NIMA clinic`,
          year: Math.floor(week / 52) + (activeYear || 2026)
        });
      } else if ((pgy === 1 || pgy === 3) && assign === AssignmentType.NIMA_CLINIC) {
        violations.push({
          week,
          type: AssignmentType.CLINIC,
          issue: `Clinic site mismatch for PGY-${pgy} ${r.name}: assigned NIMA clinic but requires CCIM clinic`,
          year: Math.floor(week / 52) + (activeYear || 2026)
        });
      }

      // T6.4: PTO Policy Validator
      if (assign === AssignmentType.VACATION) {
        // Prevent vacation on +1 clinic weeks
        if (week % 5 === (4 - cohort) % 5) {
          violations.push({
            week,
            type: AssignmentType.VACATION,
            issue: `Vacation Policy: Vacation prohibited during +1 clinic week for ${r.name}`,
            year: Math.floor(week / 52) + (activeYear || 2026)
          });
        }

        // Prevent vacation during blackout weeks [0, 5, 6, 7, 8, 9, 50, 51]
        const blackoutWeeks = [0, 5, 6, 7, 8, 9, 50, 51];
        if (blackoutWeeks.includes(week % 52)) {
          violations.push({
            week,
            type: AssignmentType.VACATION,
            issue: `Vacation Policy: Vacation prohibited during blackout week ${week % 52 + 1} for ${r.name}`,
            year: Math.floor(week / 52) + (activeYear || 2026)
          });
        }
      }
    }

    // Prevent vacation inside core Wards/ICU blocks
    for (let cycle = 0; cycle < Math.floor(totalWeeks / 5); cycle++) {
      const start = cycle * 5 + blockStartOffset;
      if (start + 4 > totalWeeks) continue;

      const blockWeeks = Array.from({ length: 4 }, (_, i) => start + i);
      const assignmentsInBlock = blockWeeks.map(w => safeGrid[r.id]?.[w]?.assignment);

      const hasVacation = assignmentsInBlock.includes(AssignmentType.VACATION);
      const hasCore = assignmentsInBlock.some(a => a && [
        AssignmentType.WARDS_RED,
        AssignmentType.WARDS_BLUE,
        AssignmentType.WARDS_METRO,
        AssignmentType.MICU,
        AssignmentType.METRO_ICU
      ].includes(a));

      if (hasVacation && hasCore) {
        const vacWeekIndex = blockWeeks.find(w => safeGrid[r.id]?.[w]?.assignment === AssignmentType.VACATION);
        const weekNum = vacWeekIndex !== undefined ? vacWeekIndex : start;
        violations.push({
          week: weekNum,
          type: AssignmentType.VACATION,
          issue: `Vacation Policy: Vacation prohibited inside core Wards/ICU block for ${r.name}`,
          year: Math.floor(weekNum / 52) + (activeYear || 2026)
        });
      }
    }
  });

  // Jeopardy Pool Monitoring: Monitor senior residents available on flexible blocks
  for (let week = 0; week < totalWeeks; week++) {
    let seniorFlexibleCount = 0;
    residents.forEach(r => {
      const pgy = r.level + Math.floor(week / 52);
      if (pgy > 1) { // Senior resident
        const cell = safeGrid[r.id]?.[week];
        if (cell && cell.assignment) {
          const assign = cell.assignment;
          const isFlexible = assign === AssignmentType.ELECTIVE || [
            AssignmentType.CARDS, AssignmentType.ID, AssignmentType.NEPH, AssignmentType.PULM,
            AssignmentType.ONC, AssignmentType.NEURO, AssignmentType.RHEUM, AssignmentType.GI,
            AssignmentType.ADD_MED, AssignmentType.ENDO, AssignmentType.GERI, AssignmentType.PALLIATIVE
          ].includes(assign);
          if (isFlexible) {
            seniorFlexibleCount++;
          }
        }
      }
    });

    if (seniorFlexibleCount === 0) {
      violations.push({
        week,
        type: AssignmentType.ELECTIVE,
        issue: `Jeopardy Gap: No senior residents available on flexible time`,
        year: Math.floor(week / 52) + (activeYear || 2026)
      });
    }
  }

  return violations;
};

export const getAuditViolations = (residents: Resident[], history: ScheduleHistory, activeYear?: number): number => {
    let violationCount = 0;

    residents.forEach(r => {
        let outpatient = 0;
        let inpatient = 0;
        let totalCriticalCare = 0;
        let criticalCareCore = 0;
        let nightFloat = 0;

        Object.entries(history).forEach(([yStr, grid]) => {
            const year = parseInt(yStr);
            const pgy = year - r.startYear + 1;
            if (pgy < 1 || pgy > 3) return;

            const weeks = grid[r.id] || [];
            weeks.forEach(c => {
                if (!c || !c.assignment) return;
                const meta = ROTATION_METADATA[c.assignment];
                if (!meta) return;

                if (meta.setting === ClinicalSetting.OUTPATIENT) outpatient++;
                if (meta.setting === ClinicalSetting.INPATIENT) inpatient++;
                if (meta.setting === ClinicalSetting.CRITICAL_CARE) {
                    totalCriticalCare++;
                    if (c.assignment !== AssignmentType.AMCS_CONSULTS) {
                        criticalCareCore++;
                    }
                }
                if (c.assignment === AssignmentType.NIGHT_FLOAT) nightFloat++;
            });
        });

        if (outpatient < 44) violationCount++;
        if (inpatient + totalCriticalCare < 48) violationCount++;
        if (criticalCareCore > 24) violationCount++;
        if (nightFloat < 6) violationCount++;
    });

    return violationCount;
};



const calculateSD = (values: number[], mean: number): number => {
  if (values.length === 0) return 0;
  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
};


export const calculateFairnessMetrics = (residents: Resident[], schedule: ScheduleGrid): CohortFairnessMetrics[] => {
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

      weeks.forEach((c, idx) => {
        if (!c || !c.assignment) return;
        const m = ROTATION_METADATA[c.assignment];
        if (!m) return;

        if (CORE_TYPES.includes(c.assignment)) core++;
        if (ELECTIVE_TYPES.includes(c.assignment)) elec++;
        if (REQUIRED_TYPES.includes(c.assignment)) req++;
        if (c.assignment === VACATION_TYPE) vac++;
        if (c.assignment === AssignmentType.NIGHT_FLOAT) nf++;
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

  residents.forEach(r => {
    const partners = new Set<string>();
    const clinicalTypes = [
      AssignmentType.WARDS_RED,
      AssignmentType.WARDS_BLUE,
      AssignmentType.MICU,
      AssignmentType.NIGHT_FLOAT,
      AssignmentType.EM,
      AssignmentType.WARDS_METRO,
      AssignmentType.JR_HOSPITALIST
    ];

    for (let w = 0; w < TOTAL_WEEKS; w++) {
      const myAssign = safeGrid[r.id]?.[w]?.assignment;
      if (myAssign && clinicalTypes.includes(myAssign)) {
        residents.forEach(peer => {
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

export const calculateScheduleScore = (residents: Resident[], schedule: ScheduleGrid, historicalSchedules?: ScheduleHistory): number => {
  const weeklyViolations = getWeeklyViolations(residents, schedule);
  const reqViolations = getRequirementViolations(residents, schedule, historicalSchedules);
  const fairness = calculateFairnessMetrics(residents, schedule);

  // New Score Function (Higher is Better)

  // 1. Violations (Dominant Factor - negative impact)
  const violationPenalty = (weeklyViolations.length + reqViolations.length) * -10000;

  // 2. Fairness (PGY-3 Only)
  const pgy3 = fairness.find(f => f.level === 3);
  const pgy3FairnessScore = pgy3 ? pgy3.fairnessScore : 0;
  const fairnessBonus = pgy3FairnessScore * 100;

  // 3. Streak Equity (negative impact for higher standard deviation)
  const allStreaks: number[] = [];
  fairness.forEach(g => g.residents.forEach(r => allStreaks.push(r.maxIntensityStreak)));
  const meanStreak = allStreaks.reduce((a, b) => a + b, 0) / (allStreaks.length || 1);
  const streakSD = Math.sqrt(allStreaks.reduce((s, n) => s + Math.pow(n - meanStreak, 2), 0) / (allStreaks.length || 1));

  const streakPenalty = streakSD * -1000;

  // 4. Continuity (Avoid "Salad" schedules)
  // Downgraded to Ideal (soft bonus/penalty) to allow healer to prioritize hard constraints.
  let continuityPenalty = 0;
  residents.forEach(r => {
    const weeks = schedule[r.id] || [];
    const cohort = r.cohort || 0;
    
    // Check 4-week inpatient blocks, correctly offset by cohort clinic weeks.
    // In a 4+1 system, there are 5 possible start offsets for a 4-week block.
    // Cohort 0: Clinic at 4, 9, 14... Blocks at [0-3], [5-8], [10-13]
    // Cohort 1: Clinic at 0, 5, 10... Blocks at [1-4], [6-9], [11-14]
    // General rule: Clinic at week 'w' if (w % 5) === (4 - cohort) ?? 
    // Wait, let's re-verify:
    // Cohort 0: Clinic at 4, 9. (4%5=4). (4-0=4). OK.
    // Cohort 1: Clinic at 3, 8. (3%5=3). (4-1=3). OK.
    // Cohort 2: Clinic at 2, 7. (2%5=2). (4-2=2). OK.
    // Cohort 3: Clinic at 1, 6. (1%5=1). (4-3=1). OK.
    // Cohort 4: Clinic at 0, 5. (0%5=0). (4-4=0). OK.
    // So Clinic week is (4 - cohort) % 5.
    // Inpatient block starts at (4 - cohort + 1) % 5.
    
    const blockStartOffset = (5 - cohort) % 5; 
    
    for (let cycle = 0; cycle < Math.floor(weeks.length / 5); cycle++) {
      const start = cycle * 5 + blockStartOffset;
      if (start + 4 > weeks.length) continue;
      
      const core = weeks.slice(start, start + 4).map(c => c?.assignment).filter(Boolean);
      if (core.length < 2) continue;
      
      let changes = 0;
      for (let i = 1; i < core.length; i++) {
        if (core[i] !== core[i-1]) changes++;
      }
      
      // Downgraded weights: 500 for a split block, 2000 for a "salad" block.
      if (changes === 1) continuityPenalty += 500;
      else if (changes > 1) continuityPenalty += changes * 1000;
    }
  });

  // Total Score
  return violationPenalty + fairnessBonus + streakPenalty - continuityPenalty;
};
