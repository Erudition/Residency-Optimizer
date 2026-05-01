# Regret & Scoring Specification

This document defines the "Regret" (Cost Function) used by the Global Optimizer to compare and rank schedule candidates. The scoring system is designed as a "Lower is Better" cost function.

## Cost Components

The total score of a schedule is the sum of three primary components:

| Component | Weight | Logic |
| :--- | :--- | :--- |
| **Violations** | 10,000 | `(weeklyViolations + requirementViolations) * 10,000` |
| **PGY-3 Fairness** | 100 | `(100 - pgy3FairnessScore) * 100` |
| **Streak Equity** | 1,000 | `streakStandardDeviation * 1,000` |

### 1. Violations (Dominant Factor)
Violations are the most critical factor. A single violation is significantly more expensive than any possible fairness or streak optimization.
*   **Weekly Violations**: Staffing gaps (Min/Max interns/seniors) or jeopardy pool deficiencies.
*   **Requirement Violations**: ACGME minimum week counts for specific rotations (e.g., MICU, Wards).

### 2. PGY-3 Fairness
The system currently prioritizes fairness for PGY-3 residents.
*   **Fairness Score**: A normalized score (0-100) representing how evenly "high intensity" rotations are distributed among the class.
*   **Cost Calculation**: If the fairness score is 95%, the cost is `(100 - 95) * 100 = 500`.

### 3. Streak Equity
Streak Equity measures how "equitable" the difficulty spikes are across the entire resident body.
*   **Max Intensity Streak**: The longest consecutive run of "High Intensity" rotations (Wards, ICU, NF) for a single resident.
*   **Standard Deviation (SD)**: We calculate the SD of these maximum streaks across all residents.
*   **Cost Calculation**: A high SD indicates that some residents have much longer grueling stretches than others. This is penalized heavily to ensure no single resident is "sacrificed" for the group's average fairness.

## Implementation Details

The scoring is implemented in `services/scheduler.ts` within the `calculateScheduleScore` function.

```typescript
export const calculateScheduleScore = (residents: Resident[], schedule: ScheduleGrid, historicalSchedules?: ScheduleHistory): number => {
  const weeklyViolations = getWeeklyViolations(residents, schedule);
  const reqViolations = getRequirementViolations(residents, schedule, historicalSchedules);
  const fairness = calculateFairnessMetrics(residents, schedule);

  const violationPenalty = (weeklyViolations.length + reqViolations.length) * 10000;
  
  const pgy3 = fairness.find(f => f.level === 3);
  const pgy3Fairness = pgy3 ? pgy3.fairnessScore : 0;
  const fairnessCost = (100 - pgy3Fairness) * 100;

  const allStreaks: number[] = [];
  fairness.forEach(g => g.residents.forEach(r => allStreaks.push(r.maxIntensityStreak)));
  const meanStreak = allStreaks.reduce((a, b) => a + b, 0) / (allStreaks.length || 1);
  const streakSD = Math.sqrt(allStreaks.reduce((s, n) => s + Math.pow(n - meanStreak, 2), 0) / (allStreaks.length || 1));

  const streakCost = streakSD * 1000;

  return violationPenalty + fairnessCost + streakCost;
};
```
