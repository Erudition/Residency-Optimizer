import { RequirementsEngine } from './requirementsEngine';
import { CompetitionParams, CompetitionPriority, Resident, PgyLevel, ScheduleGrid, ScheduleHistory, AssignmentType, ScheduleCell, ScheduleStats, CohortFairnessMetrics, RequirementViolation, WeeklyViolation, ResidentFairnessMetrics, ConvergenceDataPoint, CompetitionResult, ClinicalSetting, DetailedScore } from '../types';
import { TOTAL_WEEKS, COHORT_COUNT, ROTATION_METADATA, CORE_TYPES, REQUIRED_TYPES, ELECTIVE_TYPES, VACATION_TYPE, REQUIREMENTS, fulfillsRequirement, ACTIVE_START_YEAR, ACGME_TYPES } from '../constants';
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

  selectedGenerators.forEach(g => {
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
          attemptSeed, 
          combinedPriorCounts, 
          cohortAssignments // Pass full nested assignments for dynamic cohort resolution
        );

        // Score and validate unified grid
        totalScore = calculateScheduleScore(unifiedResidents, unifiedSchedule, historicalSchedules);
        const reqViolations = RequirementsEngine.getViolations(unifiedResidents, unifiedSchedule, historicalSchedules, startYear);
        const weekViolations = getWeeklyViolations(unifiedResidents, unifiedSchedule);

        attemptTotalViolations = reqViolations.length + weekViolations.length;
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
  return RequirementsEngine.getViolations(residents, schedule, historicalSchedules || {}, activeYear || 2026);
};


export const getWeeklyViolations = (residents: Resident[], schedule: ScheduleGrid, activeYear?: number): WeeklyViolation[] => {
  const violations: WeeklyViolation[] = [];
  const cohortMap = getStandardCohortMap(residents);
  const safeGrid = schedule || {};
  const currentYear = activeYear || 2026;
  
  const totalWeeks = Object.values(safeGrid)[0]?.length || 52;
  
  for (let week = 0; week < totalWeeks; week++) {
    const assignments = residents.map(r => safeGrid[r.id]?.[week]?.assignment);
    const clinicCount = assignments.filter(a => a === AssignmentType.CLINIC || a === AssignmentType.NIMA_CLINIC).length;
    if (clinicCount === 0) {
      violations.push({ week, type: AssignmentType.CLINIC, issue: `No residents in clinic in week ${week + 1}`, year: Math.floor(week / 52) + currentYear, instances: 1 });
    }

    Object.values(AssignmentType).forEach(type => {
      const meta = ROTATION_METADATA[type];
      if (!meta) return;

      const assignees = residents.filter(r => safeGrid[r.id]?.[week]?.assignment === type);
      const interns = assignees.filter(r => ((r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52)) === 1).length;
      const seniors = assignees.filter(r => ((r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52)) > 1).length;

      if (interns < meta.minInterns) {
        violations.push({ week, type, issue: `Min Interns (${meta.minInterns}) unmet: ${interns}`, year: Math.floor(week / 52) + currentYear, instances: meta.minInterns - interns });
      }
      if (interns > meta.maxInterns) {
        violations.push({ week, type, issue: `Max Interns (${meta.maxInterns}) exceeded: ${interns}`, year: Math.floor(week / 52) + currentYear, instances: interns - meta.maxInterns });
      }
      if (seniors < meta.minSeniors) {
        violations.push({ week, type, issue: `Min Seniors (${meta.minSeniors}) unmet: ${seniors}`, year: Math.floor(week / 52) + currentYear, instances: meta.minSeniors - seniors });
      }
      if (seniors > meta.maxSeniors) {
        violations.push({ week, type, issue: `Max Seniors (${meta.maxSeniors}) exceeded: ${seniors}`, year: Math.floor(week / 52) + currentYear, instances: seniors - meta.maxSeniors });
      }
    });
    // T6.2: Jeopardy Pool Monitoring
    const flexibleAssigns = [...ELECTIVE_TYPES, AssignmentType.AMCS_CONSULTS];
    const jeopardyPgy2 = residents.filter(r => {
      const pgy = (r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52);
      const assign = safeGrid[r.id]?.[week]?.assignment;
      return pgy === 2 && assign && RequirementsEngine.isJeopardyBlock(assign);
    }).length;

    const jeopardyPgy3 = residents.filter(r => {
      const pgy = (r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52);
      const assign = safeGrid[r.id]?.[week]?.assignment;
      return pgy === 3 && assign && RequirementsEngine.isJeopardyBlock(assign);
    }).length;

    if (jeopardyPgy2 < 1) {
      violations.push({ week, type: AssignmentType.ELECTIVE, issue: `Jeopardy Gap: Minimum 1 PGY-2 on flexible block unmet`, year: Math.floor(week / 52) + currentYear, instances: 1 });
    }
    if (jeopardyPgy3 < 1) {
      violations.push({ week, type: AssignmentType.ELECTIVE, issue: `Jeopardy Gap: Minimum 1 PGY-3 on flexible block unmet`, year: Math.floor(week / 52) + currentYear, instances: 1 });
    }
  }

  // PTO Policy, Clinic Site validations, and Jeopardy Pool Monitoring
  residents.forEach(r => {
    const cohort = cohortMap[r.id] ?? 0;
    const blockStartOffset = (cohort + 1) % 5;

    for (let week = 0; week < totalWeeks; week++) {
      const cell = safeGrid[r.id]?.[week];
      if (!cell || !cell.assignment) continue;

      const assign = cell.assignment;
      const pgy = (r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52);

      // T6.3: PGY-specific Clinic Sites
      if (!RequirementsEngine.isClinicSiteCorrect(r, assign)) {
        violations.push({
          week,
          type: AssignmentType.CLINIC,
          issue: `Clinic site mismatch for resident ${r.name}: assigned ${assign} but requires ${r.startYear === 2025 ? 'NIMA' : 'CCIM'}`,
          year: Math.floor(week / 52) + currentYear
        });
      }

      // T6.4: PTO Policy Validator
      if (assign === AssignmentType.VACATION) {
        // Prevent vacation on +1 clinic weeks
        if (week % 5 === cohort) {
          violations.push({
            week,
            type: AssignmentType.VACATION,
            issue: `Vacation Policy: Vacation prohibited during +1 clinic week for ${r.name}`,
            year: Math.floor(week / 52) + currentYear
          });
        }

        // Prevent vacation during blackout weeks [0, 5, 6, 7, 8, 9, 50, 51]
        const blackoutWeeks = [0, 5, 6, 7, 8, 9, 50, 51];
        if (blackoutWeeks.includes(week % 52)) {
          violations.push({
            week,
            type: AssignmentType.VACATION,
            issue: `Vacation Policy: Vacation prohibited during blackout week ${week % 52 + 1} for ${r.name}`,
            year: Math.floor(week / 52) + currentYear
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
          year: Math.floor(weekNum / 52) + currentYear
        });
      }
    }
  });

  // Jeopardy Pool Monitoring: Monitor senior residents available on flexible blocks
  for (let week = 0; week < totalWeeks; week++) {
    let seniorFlexibleCount = 0;
    residents.forEach(r => {
      const pgy = (r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52);
      if (pgy > 1) { // Senior resident
        const cell = safeGrid[r.id]?.[week];
        if (cell && cell.assignment) {
          const assign = cell.assignment;
          const isFlexible = RequirementsEngine.isJeopardyBlock(assign);
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
        year: Math.floor(week / 52) + currentYear
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

        if (outpatient < 44) violationCount += (44 - outpatient);
        if (inpatient + totalCriticalCare < 48) violationCount += (48 - (inpatient + totalCriticalCare));
        if (criticalCareCore > 24) violationCount += (criticalCareCore - 24);
        if (nightFloat < 6) violationCount += (6 - nightFloat);
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
  return calculateDetailedScheduleScore(residents, schedule, historicalSchedules).finalScore;
};

export const calculateDetailedScheduleScore = (residents: Resident[], schedule: ScheduleGrid, historicalSchedules?: ScheduleHistory): DetailedScore => {
  const safeGrid = schedule || {};
  const totalWeeks = Object.values(safeGrid)[0]?.length || 52;
  const numYears = Math.ceil(totalWeeks / 52);

  // Component 1: Education Requirements (Weight: 0.490)
  let educationDenominator = 0;
  let educationNumerator = 0;

  residents.forEach(r => {
    for (let yearIdx = 0; yearIdx < numYears; yearIdx++) {
      const currentYear = ACTIVE_START_YEAR + yearIdx;
      const pgy = currentYear - r.startYear + 1;
      if (pgy < 1 || pgy > 3) continue;

      const pgyReqs = REQUIREMENTS[pgy] || [];
      pgyReqs.forEach(req => {
        const isACGME = ACGME_TYPES.includes(req.type);
        let minWeeks = req.minWeeks;
        let actual = 0;

        if (isACGME) {
          minWeeks = 0;
          for (let l = 1; l <= pgy; l++) {
            const levelReqs = REQUIREMENTS[l] || [];
            const levelReq = levelReqs.find(rq => rq.type === req.type);
            minWeeks += levelReq ? levelReq.minWeeks : 0;
          }
          actual = RequirementsEngine.getActualWeeks(r, req.type, schedule, historicalSchedules || {}, ACTIVE_START_YEAR, currentYear, true);
        } else {
          actual = RequirementsEngine.getActualWeeks(r, req.type, schedule, historicalSchedules || {}, ACTIVE_START_YEAR, currentYear, false);
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

  const cohortMap = getStandardCohortMap(residents);
  const currentYear = ACTIVE_START_YEAR;

  for (let week = 0; week < totalWeeks; week++) {
    const assignments = residents.map(r => safeGrid[r.id]?.[week]?.assignment);
    const clinicCount = assignments.filter(a => a === AssignmentType.CLINIC || a === AssignmentType.NIMA_CLINIC).length;
    
    staffingDenominator += 1;
    staffingNumerator += clinicCount >= 1 ? 1 : 0;

    Object.values(AssignmentType).forEach(type => {
      const meta = ROTATION_METADATA[type];
      if (!meta) return;

      const assignees = residents.filter(r => safeGrid[r.id]?.[week]?.assignment === type);
      const interns = assignees.filter(r => ((r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52)) === 1).length;
      const seniors = assignees.filter(r => ((r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52)) > 1).length;

      const activeInternsPool = residents.filter(r => ((r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52)) === 1).length;
      const activeSeniorsPool = residents.filter(r => ((r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52)) > 1).length;

      if (meta.minInterns > 0) {
        staffingDenominator += meta.minInterns;
        staffingNumerator += Math.min(meta.minInterns, interns);
      }
      if (meta.maxInterns < activeInternsPool) {
        const diff = activeInternsPool - meta.maxInterns;
        staffingDenominator += diff;
        staffingNumerator += diff - Math.max(0, interns - meta.maxInterns);
      }
      if (meta.minSeniors > 0) {
        staffingDenominator += meta.minSeniors;
        staffingNumerator += Math.min(meta.minSeniors, seniors);
      }
      if (meta.maxSeniors < activeSeniorsPool) {
        const diff = activeSeniorsPool - meta.maxSeniors;
        staffingDenominator += diff;
        staffingNumerator += diff - Math.max(0, seniors - meta.maxSeniors);
      }
    });

    const jeopardyPgy2 = residents.filter(r => {
      const pgy = (r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52);
      const assign = safeGrid[r.id]?.[week]?.assignment;
      return pgy === 2 && assign && RequirementsEngine.isJeopardyBlock(assign);
    }).length;

    const jeopardyPgy3 = residents.filter(r => {
      const pgy = (r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52);
      const assign = safeGrid[r.id]?.[week]?.assignment;
      return pgy === 3 && assign && RequirementsEngine.isJeopardyBlock(assign);
    }).length;

    const seniorFlexibleCount = residents.filter(r => {
      const pgy = (r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52);
      if (pgy > 1) {
        const assign = safeGrid[r.id]?.[week]?.assignment;
        return assign && RequirementsEngine.isJeopardyBlock(assign);
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

  residents.forEach(r => {
    const cohort = cohortMap[r.id] ?? 0;
    const blockStartOffset = (cohort + 1) % 5;

    for (let week = 0; week < totalWeeks; week++) {
      const cell = safeGrid[r.id]?.[week];
      if (!cell || !cell.assignment) continue;

      const assign = cell.assignment;

      staffingDenominator += 1;
      staffingNumerator += RequirementsEngine.isClinicSiteCorrect(r, assign) ? 1 : 0;

      if (assign === AssignmentType.VACATION) {
        staffingDenominator += 1;
        staffingNumerator += (week % 5 !== cohort) ? 1 : 0;

        const blackoutWeeks = [0, 5, 6, 7, 8, 9, 50, 51];
        staffingDenominator += 1;
        staffingNumerator += (!blackoutWeeks.includes(week % 52)) ? 1 : 0;
      }
    }

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

  residents.forEach(r => {
    for (let week = 0; week < totalWeeks; week++) {
      const assign = safeGrid[r.id]?.[week]?.assignment;
      if (!assign) continue;

      const intensity = ROTATION_METADATA[assign]?.intensity || 0;
      actualTotalIntensity += intensity;

      if (assign === AssignmentType.CLINIC || assign === AssignmentType.NIMA_CLINIC || assign === AssignmentType.VACATION) {
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
    weeks.forEach(c => {
      if (!c || !c.assignment) return;
      const m = ROTATION_METADATA[c.assignment];
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

  residents.forEach(r => {
    const pgy = r.level || 1;
    const weight = pgy === 1 ? 3 : pgy === 2 ? 2 : 1;

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

    for (let w = 0; w < totalWeeks; w++) {
      const myAssign = safeGrid[r.id]?.[w]?.assignment;
      if (myAssign && clinicalTypes.includes(myAssign)) {
        residents.forEach(peer => {
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
    residents.forEach(r => {
      const pgy = (r.startYear > 0 ? (currentYear - r.startYear + 1) : Number(r.level)) + Math.floor(week / 52);
      if (pgy > 1) {
        const assign = safeGrid[r.id]?.[week]?.assignment;
        if (assign && RequirementsEngine.isJeopardyBlock(assign)) {
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

  [1, 2, 3].forEach(level => {
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

      weeks.forEach(c => {
        if (!c || !c.assignment) return;
        if (CORE_TYPES.includes(c.assignment)) coreCount++;
        if (ELECTIVE_TYPES.includes(c.assignment)) electiveCount++;
        if (c.assignment === AssignmentType.VACATION) vacationCount++;
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
