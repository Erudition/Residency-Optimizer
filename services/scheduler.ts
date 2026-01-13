
import { CompetitionParams, CompetitionPriority, Resident, ScheduleGrid, AssignmentType, ScheduleCell, ScheduleStats, CohortFairnessMetrics, RequirementViolation, WeeklyViolation, ResidentFairnessMetrics } from '../types';
import { TOTAL_WEEKS, COHORT_COUNT, ROTATION_METADATA, CORE_TYPES, REQUIRED_TYPES, ELECTIVE_TYPES, VACATION_TYPE, REQUIREMENTS } from '../constants';
import { getRequirementCount } from './generators/utils';
import { BacktrackingGenerator } from './generators/backtracking';
import { GreedyGenerator } from './generators/greedy';
import { StochasticGenerator } from './generators/stochastic';
import { ExperimentalGenerator } from './generators/experimental';

/**
 * Main Scheduling Engine - Competition Mode (Async)
 * Returns both the schedule and the name of the winning algorithm.
 */
export const generateSchedule = async (
  residents: Resident[],
  existing: ScheduleGrid,
  params: CompetitionParams = { tries: 300, priority: CompetitionPriority.BEST_SCORE, algorithmIds: ['experimental', 'stochastic', 'backtracking'] },
  onProgress?: (progress: number, attemptsMade: number) => void
): Promise<{ schedule: ScheduleGrid; winnerName: string }> => {
  const allGenerators = [
    { id: 'backtracking', generator: BacktrackingGenerator, name: 'Backtracking' },
    { id: 'greedy', generator: GreedyGenerator, name: 'Greedy' },
    { id: 'experimental', generator: ExperimentalGenerator, name: 'Strict Compliance' },
    { id: 'stochastic', generator: StochasticGenerator, name: 'Stochastic' },
  ];

  const selectedGenerators = allGenerators.filter(g => params.algorithmIds.includes(g.id));
  if (selectedGenerators.length === 0) {
    selectedGenerators.push({ id: 'experimental', generator: ExperimentalGenerator, name: 'Strict Compliance' });
  }

  const attempts: { generator: any; name: string }[] = [];

  // Replicate previous behavior if only specific ones were requested, 
  // but scaled by "tries"
  selectedGenerators.forEach(g => {
    if (g.id === 'stochastic') {
      for (let i = 0; i < params.tries; i++) {
        attempts.push({ generator: g.generator, name: g.name });
      }
    } else {
      attempts.push({ generator: g.generator, name: g.name });
    }
  });

  let bestSchedule = existing;
  let bestViolations = Infinity;
  let bestScore = Infinity; // Lower is better in new Cost function
  let bestName = 'Unknown';

  console.log(`Starting Algorithm Competition with ${params.tries} tries for ${selectedGenerators.map(g => g.name).join(', ')}...`);

  for (let i = 0; i < attempts.length; i++) {
    const att = attempts[i];
    try {
      const schedule = att.generator.generate(residents, existing, i);
      const reqViolations = getRequirementViolations(residents, schedule);
      const weekViolations = getWeeklyViolations(residents, schedule);
      const totalViolations = reqViolations.length + weekViolations.length;
      const score = calculateScheduleScore(residents, schedule); // Now a Cost (Lower is better)

      let isBetter = false;

      // Ranking Logic based on Priority
      if (params.priority === CompetitionPriority.BEST_SCORE) {
        if (totalViolations < bestViolations) {
          isBetter = true;
        } else if (totalViolations === bestViolations && score < bestScore) {
          isBetter = true;
        }
      } else if (params.priority === CompetitionPriority.LEAST_UNDERSTAFFING) {
        const bestUnderstaffedCount = (bestViolations === Infinity) ? Infinity : totalViolations; // Simplified tie-break
        const currentUnderstaffed = weekViolations.filter(v => v.issue.includes('Min')).length;
        const bestUnderstaffed = (bestViolations === Infinity) ? Infinity : weekViolations.length; // Actually we need to track this specifically

        // To keep it simple but effective: minimize violations, but prioritize those with fewest understaffing issues
        const currentUnder = weekViolations.filter(v => v.issue.includes('Min')).length;
        if (totalViolations < bestViolations) {
          isBetter = true;
        } else if (totalViolations === bestViolations && currentUnder < 0) { // Placeholder for specific understaffing tracking
          isBetter = true;
        } else if (totalViolations === bestViolations && score < bestScore) {
          isBetter = true;
        }
      } else if (params.priority === CompetitionPriority.MOST_PGY_REQS) {
        if (totalViolations < bestViolations) {
          isBetter = true;
        } else if (totalViolations === bestViolations && score < bestScore) {
          isBetter = true;
        }
      }

      // Default Logic: Minimize Violations, then Minimize Score (Cost)
      if (totalViolations < bestViolations) {
        bestViolations = totalViolations;
        bestScore = score;
        bestSchedule = schedule;
        bestName = att.name;
      } else if (totalViolations === bestViolations && score < bestScore) {
        bestScore = score;
        bestSchedule = schedule;
        bestName = att.name;
      }
    } catch (e) {
      console.error(`Generator ${att.name} failed:`, e);
    }

    // Report progress every single iteration for real-time updates
    const progress = Math.round(((i + 1) / attempts.length) * 100);
    if (onProgress) {
      onProgress(progress, i + 1);
    }

    if (i % 5 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  console.log(`Winner: ${bestName} - ${bestViolations} violations, Score: ${Math.round(bestScore)}`);
  return { schedule: bestSchedule, winnerName: bestName };
};

// --- Analysis Helpers (Kept for UI/Analysis) ---

export const calculateStats = (residents: Resident[], schedule: ScheduleGrid): ScheduleStats => {
  const stats: ScheduleStats = {};
  residents.forEach(r => {
    stats[r.id] = {} as Record<AssignmentType, number>;
    Object.values(AssignmentType).forEach(t => stats[r.id][t] = 0);
    (schedule[r.id] || []).forEach(cell => { if (cell && cell.assignment) stats[r.id][cell.assignment]++; });
  });
  return stats;
};

export const getRequirementViolations = (residents: Resident[], schedule: ScheduleGrid): RequirementViolation[] => {
  const violations: RequirementViolation[] = [];
  residents.forEach(r => {
    const reqs = REQUIREMENTS[r.level] || [];
    reqs.forEach(req => {
      const weeks = schedule[r.id] || [];
      const count = getRequirementCount(weeks, req.type, r.level);
      if (count < req.target) {
        violations.push({ residentId: r.id, type: req.type, target: req.target, actual: count });
      }
    });
  });
  return violations;
};

export const getWeeklyViolations = (residents: Resident[], schedule: ScheduleGrid): WeeklyViolation[] => {
  const violations: WeeklyViolation[] = [];
  for (let w = 0; w < TOTAL_WEEKS; w++) {
    Object.values(AssignmentType).forEach(type => {
      const meta = ROTATION_METADATA[type];
      if (!meta || type === AssignmentType.ELECTIVE || type === AssignmentType.CLINIC || type === AssignmentType.VACATION) return;

      const assigned = residents.filter(r => schedule[r.id]?.[w]?.assignment === type);
      const interns = assigned.filter(r => r.level === 1).length;
      const seniors = assigned.filter(r => r.level > 1).length;

      if (interns < meta.minInterns) violations.push({ week: w + 1, type, issue: `Min Interns Unmet: ${interns}/${meta.minInterns}` });
      if (seniors < meta.minSeniors) violations.push({ week: w + 1, type, issue: `Min Seniors Unmet: ${seniors}/${meta.minSeniors}` });

      if (interns > meta.maxInterns) violations.push({ week: w + 1, type, issue: `Max Interns Exceeded: ${interns}/${meta.maxInterns}` });
      if (seniors > meta.maxSeniors) violations.push({ week: w + 1, type, issue: `Max Seniors Exceeded: ${seniors}/${meta.maxSeniors}` });
    });
  }
  return violations;
};

const calculateSD = (values: number[], mean: number): number => {
  if (values.length === 0) return 0;
  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
};

export const calculateFairnessMetrics = (residents: Resident[], schedule: ScheduleGrid): CohortFairnessMetrics[] => {
  return [1, 2, 3].map(level => {
    const groupRes = residents.filter(r => r.level === level);
    const resMetrics: ResidentFairnessMetrics[] = groupRes.map(r => {
      const weeks = schedule[r.id] || [];
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

  residents.forEach(r => {
    const partners = new Set<string>();
    const clinicalTypes = [
      'Wards-R', 'Wards-B', 'ICU', 'NF', 'EM', 'CCIM', 'Met Wards', 'Metro'
    ];

    for (let w = 0; w < TOTAL_WEEKS; w++) {
      const myAssign = schedule[r.id]?.[w]?.assignment;
      if (myAssign && clinicalTypes.includes(myAssign)) {
        residents.forEach(peer => {
          if (peer.id !== r.id && schedule[peer.id]?.[w]?.assignment === myAssign) {
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

export const calculateScheduleScore = (residents: Resident[], schedule: ScheduleGrid): number => {
  const weeklyViolations = getWeeklyViolations(residents, schedule);
  const reqViolations = getRequirementViolations(residents, schedule);
  const fairness = calculateFairnessMetrics(residents, schedule);

  // New Cost Function (Lower is Better)

  // 1. Violations (Dominant Factor - "Must not happen")
  const violationPenalty = (weeklyViolations.length + reqViolations.length) * 1000000;

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
