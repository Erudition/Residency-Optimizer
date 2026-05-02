
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

  const selectedGenerators = algorithmIds.map(id => allGenerators.find(g => g.id === id)).filter(Boolean) as any[];
  if (selectedGenerators.length === 0) {
    selectedGenerators.push({ id: 'experimental', generator: StaffingFirstGenerator, name: 'Staffing First' });
  }

  const results: CompetitionResult[] = [];
  const algorithmBestScores: Record<string, number> = {};
  // Standardizing on Score: Higher is Better. Initial best is -Infinity.
  selectedGenerators.forEach(g => algorithmBestScores[g.id] = -Infinity);

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
        currentBestScores.push(algorithmBestScores[g.id]);
        continue;
      }

      try {
        let attemptTotalViolations = 0;
        let attemptUnderstaffing = 0;
        let attemptFullData: Record<number, ScheduleGrid> = existing ? { ...existing } : {};
        let runningHistory = { ...historicalSchedules };
        let totalScore = 0;

        // Generate each year in sequence for this attempt
        for (let y = startYear; y < startYear + totalYears; y++) {
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
          
          const yearScore = calculateScheduleScore(yearResidents, yearSchedule, runningHistory);
          const reqViolations = getRequirementViolations(yearResidents, yearSchedule, runningHistory);
          const weekViolations = getWeeklyViolations(yearResidents, yearSchedule);
          
          attemptTotalViolations += reqViolations.length + weekViolations.length;
          attemptUnderstaffing += weekViolations.filter(v => v.issue.includes('Min')).length;
          attemptFullData[y] = yearSchedule;
          totalScore += yearScore;
          
          // Update running history for the next year in the block
          runningHistory[y] = yearSchedule;
        }
        
        const score = totalScore;

        // Check if this multi-year package qualifies for Top N (Higher is Better)
        const currentWorstScore = results.length >= (params.topN || 1) ? results[results.length - 1].score : -Infinity;
        
        if (score >= currentWorstScore || results.length < (params.topN || 1)) {
          const result: CompetitionResult = {
            schedule: attemptFullData,
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

        if (score > algorithmBestScores[g.id]) {
          algorithmBestScores[g.id] = score;
        }
      } catch (e) {
        console.error(`Generator ${g.name} failed attempt ${i}`, e);
      }
      currentBestScores.push(algorithmBestScores[g.id] === -Infinity ? -1000000 : algorithmBestScores[g.id]);
    }

    onProgress(i, currentBestScores, i);

    if (i % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    i++;
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

  residents.forEach(r => {
    const reqs = REQUIREMENTS[r.level] || [];
    reqs.forEach(req => {
      const count = getCumulativeRequirementCount(r.id, safeGrid[r.id] || [], req.type, filteredHistory);
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

    Object.values(AssignmentType).forEach(type => {
      const meta = ROTATION_METADATA[type];
      if (!meta) return;

      const assignees = residents.filter(r => safeGrid[r.id]?.[week]?.assignment === type);
      const interns = assignees.filter(r => r.level === 1).length;
      const seniors = assignees.filter(r => r.level > 1).length;

      if (interns < meta.minInterns) {
        violations.push({ week, type, issue: `Min Interns (${meta.minInterns}) unmet: ${interns}` });
      }
      if (interns > meta.maxInterns) {
        violations.push({ week, type, issue: `Max Interns (${meta.maxInterns}) exceeded: ${interns}` });
      }
      if (seniors < meta.minSeniors) {
        violations.push({ week, type, issue: `Min Seniors (${meta.minSeniors}) unmet: ${seniors}` });
      }
      if (seniors > meta.maxSeniors) {
        violations.push({ week, type, issue: `Max Seniors (${meta.maxSeniors}) exceeded: ${seniors}` });
      }
    });
  }

  return violations;
};

export const getAuditViolations = (residents: Resident[], history: ScheduleHistory, activeYear?: number): number => {
    let violationCount = 0;

    residents.forEach(r => {
        let outpatient = 0;
        let criticalCareCore = 0;
        let nightFloat = 0;

        Object.entries(history).forEach(([yStr, grid]) => {
            const y = parseInt(yStr);
            if (activeYear !== undefined && y > activeYear) return;

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

  // Total Score
  return violationPenalty + fairnessBonus + streakPenalty;
};
