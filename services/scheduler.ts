
import { CompetitionParams, CompetitionPriority, Resident, ScheduleGrid, ScheduleHistory, AssignmentType, ScheduleCell, ScheduleStats, CohortFairnessMetrics, RequirementViolation, WeeklyViolation, ResidentFairnessMetrics, ConvergenceDataPoint, CompetitionResult, ClinicalSetting } from '../types';
import { TOTAL_WEEKS, COHORT_COUNT, ROTATION_METADATA, CORE_TYPES, REQUIRED_TYPES, ELECTIVE_TYPES, VACATION_TYPE, REQUIREMENTS } from '../constants';
import { getRequirementCount, getCumulativeRequirementCount } from './generators/utils';
import { WeekByWeekGenerator } from './generators/weekByWeek';
import { StaffingFirstGenerator } from './generators/staffingFirst';
import { StochasticGenerator } from './generators/stochastic';
import { EducationFirstGenerator } from './generators/educationFirst';

/**
 * Main Scheduling Engine - Competition Mode (Async)
 * Returns both the schedule and the name of the winning algorithm.
 */

export const generateSchedule = async (
  startYear: number,
  totalYears: number,
  historicalSchedules: ScheduleHistory,
  constraints: { residents: Resident[], existing: Record<number, ScheduleGrid>, cohortAssignments: Record<number, Record<string, number>> },
  params: CompetitionParams,
  algorithmIds: string[],
  isAlgorithmCanceled: (id: string) => boolean,
  onProgress: (iteration: number, scores: number[], attempts: number) => void,
  isPromoted: () => boolean = () => false
): Promise<{ results: CompetitionResult[] }> => {
  const { residents, existing, cohortAssignments } = constraints;
  const allGenerators = [
    { id: 'greedy', generator: WeekByWeekGenerator, name: 'Week By Week' },
    { id: 'experimental', generator: StaffingFirstGenerator, name: 'Staffing First' },
    { id: 'stochastic', generator: StochasticGenerator, name: 'Stochastic' },
    { id: 'strict', generator: EducationFirstGenerator, name: 'Education First' },
  ];

  const selectedGenerators = allGenerators.filter(g => algorithmIds.includes(g.id));
  if (selectedGenerators.length === 0) {
    selectedGenerators.push({ id: 'experimental', generator: StaffingFirstGenerator, name: 'Staffing First' });
  }

  const results: CompetitionResult[] = [];
  const algorithmBestRegrets: Record<string, number> = {};
  // Standardizing on Cost: Lower is Better. Initial best is Infinity.
  selectedGenerators.forEach(g => algorithmBestRegrets[g.id] = Infinity);

  console.log(`Starting Unified Multi-Year Competition (${totalYears} years)...`);

  let i = 0;
  const tries = params.tries || 300;

  while (i < tries) {
    if (isPromoted()) {
      console.log("Promotion triggered - ending generation early with best results found so far.");
      break;
    }

    const currentBestScores: number[] = [];
    
    for (let idx = 0; idx < selectedGenerators.length; idx++) {
      const g = selectedGenerators[idx];
      
      if (isAlgorithmCanceled(g.id)) {
        currentBestScores.push(algorithmBestRegrets[g.id]);
        continue;
      }

      try {
        let attemptTotalViolations = 0;
        let attemptUnderstaffing = 0;
        let attemptFullData: Record<number, ScheduleGrid> = {};
        let runningHistory = { ...historicalSchedules };
        let totalCost = 0;

        // Generate each year in sequence for this attempt
        for (let y = startYear; y < startYear + totalYears; y++) {
          // Advance resident levels for this year
          const yearResidents = residents.filter(r => {
            const level = y - r.startYear + 1;
            return level >= 1 && level <= 3;
          }).map(r => ({
            ...r,
            level: (y - r.startYear + 1) as 1 | 2 | 3,
            clinicType: (y - r.startYear + 1) === 2 ? AssignmentType.NIMA_CLINIC : AssignmentType.CLINIC
          }));

          const yearExisting = existing[y] || {};
          const yearSchedule = g.generator.generate(yearResidents, yearExisting, i + idx, runningHistory, cohortAssignments[y]);
          
          const yearCost = calculateScheduleRegret(yearResidents, yearSchedule, runningHistory);
          const reqViolations = getRequirementViolations(yearResidents, yearSchedule, runningHistory);
          const weekViolations = getWeeklyViolations(yearResidents, yearSchedule);
          
          attemptTotalViolations += reqViolations.length + weekViolations.length;
          attemptUnderstaffing += weekViolations.filter(v => v.issue.includes('Min')).length;
          attemptFullData[y] = yearSchedule;
          totalCost += yearCost;
          
          // Update running history for the next year in the block
          runningHistory[y] = yearSchedule;
        }
        
        const regret = totalCost;

        // Check if this multi-year package qualifies for Top N (Lower is Better)
        const currentWorstRegret = results.length >= (params.topN || 1) ? results[results.length - 1].regret : Infinity;
        
        if (regret <= currentWorstRegret || results.length < (params.topN || 1)) {
          const result: CompetitionResult = {
            schedule: attemptFullData,
            winnerName: g.name,
            regret,
            totalViolations: attemptTotalViolations,
            understaffing: attemptUnderstaffing
          };


          results.push(result);
          results.sort((a, b) => a.regret - b.regret); // ASC sort (lower cost first)

          if (results.length > (params.topN || 1)) {
            results.pop();
          }
        }

        if (regret < algorithmBestRegrets[g.id]) {
          algorithmBestRegrets[g.id] = regret;
        }
      } catch (e) {
        console.error(`Generator ${g.name} failed attempt ${i}`, e);
      }
      currentBestScores.push(algorithmBestRegrets[g.id] === Infinity ? 1000000 : algorithmBestRegrets[g.id]);
    }

    onProgress(i, currentBestScores, i);

    if (i % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return { results };
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

export const getRequirementViolations = (residents: Resident[], schedule: ScheduleGrid, historicalSchedules?: ScheduleHistory): RequirementViolation[] => {
  const violations: RequirementViolation[] = [];
  const safeGrid = schedule || {};
  residents.forEach(r => {
    const reqs = REQUIREMENTS[r.level] || [];
    reqs.forEach(req => {
      const count = getCumulativeRequirementCount(r.id, safeGrid[r.id] || [], req.type, historicalSchedules);
      if (count < req.target) {
        violations.push({ residentId: r.id, type: req.type, target: req.target, actual: count });
      }
    });
  });
  return violations;
};

export const getWeeklyViolations = (residents: Resident[], schedule: ScheduleGrid): WeeklyViolation[] => {
  const violations: WeeklyViolation[] = [];
  const safeGrid = schedule || {};
  
  for (let week = 0; week < 52; week++) {
    const assignments = residents.map(r => safeGrid[r.id]?.[week]?.assignment);
    const clinicCount = assignments.filter(a => a === AssignmentType.CLINIC).length;
    if (clinicCount === 0) {
      violations.push({ week, type: AssignmentType.CLINIC, issue: `No residents in clinic in week ${week + 1}` });
    }
  }

  return violations;
};

export const getAuditViolations = (residents: Resident[], history: ScheduleHistory): number => {
    let violationCount = 0;

    residents.forEach(r => {
        let outpatient = 0;
        let criticalCareCore = 0;
        let nightFloat = 0;

        Object.entries(history).forEach(([_, grid]) => {
            const weeks = grid[r.id] || [];
            weeks.forEach(c => {
                if (!c || !c.assignment) return;
                const meta = ROTATION_METADATA[c.assignment];
                if (!meta) return;

                if (meta.setting === ClinicalSetting.OUTPATIENT) outpatient++;
                if (meta.setting === ClinicalSetting.CRITICAL_CARE) {
                    if (c.assignment !== AssignmentType.AMCS_CONSULTS) {
                        criticalCareCore++;
                    }
                }
                if (c.assignment === AssignmentType.NIGHT_FLOAT) nightFloat++;
            });
        });

        if (criticalCareCore > 18) violationCount++;
        if (nightFloat > 12) violationCount++;
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
    const fairnessScore = Math.max(0, Math.min(100, Math.round(100 - penalty)));

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

export const calculateScheduleRegret = (residents: Resident[], schedule: ScheduleGrid, historicalSchedules?: ScheduleHistory): number => {
  const weeklyViolations = getWeeklyViolations(residents, schedule);
  const reqViolations = getRequirementViolations(residents, schedule, historicalSchedules);
  const fairness = calculateFairnessMetrics(residents, schedule);

  // New Cost Function (Lower is Better)

  // 1. Violations (Dominant Factor - "Must not happen")
  const violationPenalty = (weeklyViolations.length + reqViolations.length) * 10000;

  // 2. Fairness (PGY-3 Only)
  // Cost = (100 - fairnessScore) * Weight
  const pgy3 = fairness.find(f => f.level === 3);
  const pgy3Fairness = pgy3 ? pgy3.fairnessScore : 0;
  const fairnessCost = (100 - pgy3Fairness) * 100;

  // 3. Streak Equity
  // Penalize if some residents have much harder streaks than others
  // We use the Standard Deviation of max streaks across ALL residents
  const allStreaks: number[] = [];
  fairness.forEach(g => g.residents.forEach(r => allStreaks.push(r.maxIntensityStreak)));
  const meanStreak = allStreaks.reduce((a, b) => a + b, 0) / (allStreaks.length || 1);
  const streakSD = Math.sqrt(allStreaks.reduce((s, n) => s + Math.pow(n - meanStreak, 2), 0) / (allStreaks.length || 1));

  const streakCost = streakSD * 1000;

  // Total Cost
  return violationPenalty + fairnessCost + streakCost;
};
