
import { Resident, ScheduleGrid, AssignmentType, ScheduleCell, ScheduleStats, CohortFairnessMetrics, RequirementViolation, WeeklyViolation, ResidentFairnessMetrics } from '../types';
import { TOTAL_WEEKS, COHORT_COUNT, ROTATION_METADATA, CORE_TYPES, REQUIRED_TYPES, ELECTIVE_TYPES, VACATION_TYPE, REQUIREMENTS } from '../constants';

/**
 * Helper: Check if a block can be placed without hitting a locked cell or already assigned cell
 */
const canFitBlock = (schedule: ScheduleGrid, residentId: string, start: number, duration: number): boolean => {
  if (start < 0 || start + duration > TOTAL_WEEKS) return false;
  const row = schedule[residentId];
  if (!row) return false;
  for (let i = 0; i < duration; i++) {
    if (row[start + i].assignment !== null) return false;
  }
  return true;
};

/**
 * Helper: Place an assignment block
 */
const placeBlock = (schedule: ScheduleGrid, residentId: string, start: number, duration: number, type: AssignmentType) => {
  for (let i = 0; i < duration; i++) {
    schedule[residentId][start + i] = { assignment: type, locked: false };
  }
};

const shuffle = <T>(array: T[]): T[] => [...array].sort(() => Math.random() - 0.5);

/**
 * Helper: Is this type a Wards rotation?
 */
const isWards = (type: AssignmentType | null) => type === AssignmentType.WARDS_RED || type === AssignmentType.WARDS_BLUE;

/**
 * Helper: Get the current count of weeks for a specific requirement type
 */
const getRequirementCount = (row: ScheduleCell[], type: AssignmentType, level: number): number => {
    if (isWards(type)) {
        return row.filter(c => isWards(c.assignment)).length;
    }
    return row.filter(c => c.assignment === type).length;
};

/**
 * Main Scheduling Engine
 */
const generateSingleAttempt = (residents: Resident[], existingSchedule: ScheduleGrid): ScheduleGrid => {
  const newSchedule: ScheduleGrid = JSON.parse(JSON.stringify(existingSchedule));

  residents.forEach(r => {
    if (!newSchedule[r.id] || newSchedule[r.id].length !== TOTAL_WEEKS) {
      newSchedule[r.id] = Array(TOTAL_WEEKS).fill(null).map(() => ({ assignment: null, locked: false }));
    } else {
      newSchedule[r.id] = newSchedule[r.id].map(cell => cell.locked ? cell : { assignment: null, locked: false });
    }
    
    for (let w = 0; w < TOTAL_WEEKS; w++) {
      if (w % 5 === r.cohort) {
        newSchedule[r.id][w] = { assignment: AssignmentType.CLINIC, locked: true };
      }
    }
  });

  const findBestBalancedWindow = (resId: string, types: AssignmentType[], duration: number): { start: number, type: AssignmentType } => {
    let bestStart = -1;
    let bestType: AssignmentType = types[0];
    let minLoad = Infinity;

    const candidates: number[] = [];
    for (let w = 0; w <= TOTAL_WEEKS - duration; w++) {
        if (canFitBlock(newSchedule, resId, w, duration)) {
            candidates.push(w);
        }
    }

    if (candidates.length === 0) return { start: -1, type: types[0] };

    shuffle(candidates).forEach(w => {
        types.forEach(type => {
            let totalHeadcountInWindow = 0;
            for (let i = 0; i < duration; i++) {
                totalHeadcountInWindow += residents.filter(r => newSchedule[r.id]?.[w + i]?.assignment === type).length;
            }

            if (totalHeadcountInWindow < minLoad) {
                minLoad = totalHeadcountInWindow;
                bestStart = w;
                bestType = type;
            }
        });
    });

    return { start: bestStart, type: bestType };
  };

  const coreStaffingTypes = [AssignmentType.ICU, AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE, AssignmentType.NIGHT_FLOAT, AssignmentType.EM];
  
  for (let w = 0; w < TOTAL_WEEKS; w++) {
    shuffle(coreStaffingTypes).forEach(type => {
      const meta = ROTATION_METADATA[type];
      const duration = meta.duration || 4;

      let safety = 0;
      while (safety < 10) {
        const currentlyAssigned = residents.filter(r => newSchedule[r.id]?.[w]?.assignment === type);
        let interns = currentlyAssigned.filter(r => r.level === 1).length;
        let seniors = currentlyAssigned.filter(r => r.level > 1).length;

        const needsIntern = interns < meta.minInterns;
        const needsSenior = seniors < meta.minSeniors;

        if (!needsIntern && !needsSenior) break;

        const candidate = shuffle(residents).find(r => {
            if (needsIntern && r.level !== 1) return false;
            if (needsSenior && r.level === 1) return false;
            return canFitBlock(newSchedule, r.id, w, duration);
        });

        if (candidate) {
          placeBlock(newSchedule, candidate.id, w, duration, type);
          if (candidate.level === 1) interns++; else seniors++;
        } else break;
        safety++;
      }
    });
  }

  [1, 2, 3].forEach(level => {
      const pgyRequirements = REQUIREMENTS[level as 1|2|3] || [];
      
      pgyRequirements.forEach(req => {
          shuffle(residents.filter(r => r.level === level)).forEach(res => {
              let current = getRequirementCount(newSchedule[res.id], req.type, level);
              const meta = ROTATION_METADATA[req.type];
              if (!meta) return;

              const duration = (req.type === AssignmentType.NIGHT_FLOAT) ? 2 : meta.duration;
              const typesToTry = isWards(req.type) 
                  ? [AssignmentType.WARDS_RED, AssignmentType.WARDS_BLUE] 
                  : [req.type];

              while (current < req.target) {
                  const best = findBestBalancedWindow(res.id, typesToTry, duration);
                  if (best.start === -1) break;

                  const currentStaff = residents.filter(r => newSchedule[r.id]?.[best.start]?.assignment === best.type).length;
                  const typeMeta = ROTATION_METADATA[best.type];
                  const maxAllowed = (res.level === 1 ? typeMeta.maxInterns : typeMeta.maxSeniors) + 1;

                  if (currentStaff < maxAllowed) {
                      placeBlock(newSchedule, res.id, best.start, duration, best.type);
                      current += duration;
                  } else break;
              }
          });
      });
  });

  residents.forEach(r => {
    for (let w = 0; w < TOTAL_WEEKS; w++) {
      if (newSchedule[r.id][w].assignment === null) {
        if (w < TOTAL_WEEKS - 1 && newSchedule[r.id][w + 1].assignment === null) {
          placeBlock(newSchedule, r.id, w, 2, AssignmentType.ELECTIVE);
          w++;
        } else {
          newSchedule[r.id][w] = { assignment: AssignmentType.ELECTIVE, locked: false };
        }
      }
    }
  });

  return newSchedule;
};

export const calculateStats = (residents: Resident[], schedule: ScheduleGrid): ScheduleStats => {
  const stats: ScheduleStats = {};
  residents.forEach(r => {
    stats[r.id] = {} as Record<AssignmentType, number>;
    Object.values(AssignmentType).forEach(t => stats[r.id][t] = 0);
    (schedule[r.id] || []).forEach(cell => { if (cell.assignment) stats[r.id][cell.assignment]++; });
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
        if (!c.assignment) return;
        const m = ROTATION_METADATA[c.assignment];
        if (CORE_TYPES.includes(c.assignment)) core++;
        if (ELECTIVE_TYPES.includes(c.assignment)) elec++;
        if (REQUIRED_TYPES.includes(c.assignment)) req++;
        if (c.assignment === VACATION_TYPE) vac++;
        if (c.assignment === AssignmentType.NIGHT_FLOAT) nf++;
        intensity += m.intensity;

        // Streak logic: Intensity >= 3 is "Heavy"
        if (m.intensity >= 3) {
            currentStreak++;
            currentStreakSummary.push(`${c.assignment} (W${idx+1})`);
            if (currentStreak > maxStreak) {
                maxStreak = currentStreak;
                streakSummary = [...currentStreakSummary];
            }
        } else if (m.intensity < 2) { 
            // Grace period: Intensity 2 (Clinic) doesn't break a streak necessarily, but < 2 does.
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

    // Composite Fairness Score: 100 - Penalties for variation
    // Penalty based on Coefficient of Variation (CV = SD/Mean)
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

      // Percentage of program peers worked with
      diversity[r.id] = (partners.size / (residents.length - 1)) * 100;
  });

  return diversity;
};

export const calculateScheduleScore = (residents: Resident[], schedule: ScheduleGrid): number => {
  const weeklyViolations = getWeeklyViolations(residents, schedule);
  const reqViolations = getRequirementViolations(residents, schedule);
  const fairness = calculateFairnessMetrics(residents, schedule);
  const avgFairness = fairness.reduce((s, g) => s + g.fairnessScore, 0) / 3;

  return 1000000 
    + (avgFairness * 1000)
    - (weeklyViolations.length * 50000) 
    - (reqViolations.length * 10000);
};

export const generateSchedule = (residents: Resident[], existing: ScheduleGrid): ScheduleGrid => {
  return generateSingleAttempt(residents, existing);
};
