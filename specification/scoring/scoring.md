# Regret & Scoring Specification

This document defines the fitness function used by the Tournament Leaderboard to rank schedule candidates. The system uses a weighted point model where **higher total score is better**. Scores are typically negative because violations carry massive penalties.

## Scoring Components

| Component | Weight | Logic |
| :--- | :--- | :--- |
| **Hard Violations** | -10,000 | `(weeklyViolations + requirementViolations) * -10,000` |
| **Fairness Bonus** | +100 | `pgy3FairnessScore * 100` |
| **Streak Penalty** | -1,000 | `streakStandardDeviation * -1,000` |

### 1. Hard Violations (Priority #1)
Violations are the dominant factor in the competition. A single staffing violation (e.g., an understaffed Wards team) or a single missing graduation requirement is designed to be more expensive than any possible fairness or streak optimization.
*   **Weekly Staffing**: Minimum/Maximum interns and seniors per rotation floor.
*   **ACGME Requirements**: Minimum total weeks for core rotations (ICU, Wards, Subspecialties).

### 2. PGY-3 Fairness Bonus (Priority #2)
For schedules that have achieved 0 violations, the system optimizes for fairness among the senior class.
*   **Fairness Score**: A normalized metric (0-100) based on the Coefficient of Variation for Core and Elective weeks.
*   **Bonus**: Each point of fairness adds 100 points to the total score (Max +10,000).

### 3. Streak Equity Penalty (Priority #3)
To prevent "burnout" streaks, the system penalizes uneven distribution of high-intensity rotation runs.
*   **Intensity Streak**: A consecutive run of rotations with an intensity rating of 3 or higher.
*   **Equity**: We calculate the Standard Deviation of the maximum streak length across all residents.
*   **Penalty**: Each point of SD (variation in streak length) subtracts 1,000 points from the total score. This ensures that no single resident is "sacrificed" with a grueling 12-week streak while others have 4-week streaks.
