# Regret & Scoring Specification

This document defines the fitness function used by the Tournament Leaderboard to rank schedule candidates. The system uses a weighted point model where **higher total score is better**. Each component is calculated independently for each schedule, and then normalized to be a percentage out of the best possible outcome for that component. The components then have weights applied based on importance. The weights are fractions that all add up to `1.0`. Finally, the weighted components are summed to produce a final score out of 100. 

## Scoring Components

| Component | Weight | Overview |
| :--- | :--- | :--- |
| **Education Requirements** | 0.490 | Normalizes all resident-level minimum and maximum requirements. |
| **Staffing Requirements** | 0.490 | Normalizes all week-level minimum and maximum service staffing limits. |
| **Total Intensity** | 0.006 | Normalizes the sum of all assigned block intensities to minimize total program burden. |
| **Streak Equity** | 0.004 | Normalizes the standard deviation of maximum high-intensity streaks. |
| **Relationship Diversity** | 0.003 | Normalizes the percentage of unique residents a person has shared a team with (prioritizing PGY-1 > PGY-2 > PGY-3). |
| **Jeopardy Pool Stability** | 0.001 | Normalizes the variance of the available Jeopardy pool size across all weeks. |
| **PGY-3 Fairness** | 0.003 | Normalizes the equity of desirable/undesirable block distribution among PGY-3s. |
| **PGY-2 Fairness** | 0.002 | Normalizes the equity of desirable/undesirable block distribution among PGY-2s. |
| **PGY-1 Fairness** | 0.001 | Normalizes the equity of desirable/undesirable block distribution among PGY-1s. |

The extreme weights on Education and Staffing ensure that any single schedule violation will drastically lower the score compared to any potential gains in Fairness or Streak Equity, providing a strong gradient for optimization algorithms to recover valid schedules.

### 1. Education Requirements
Calculates adherence to individual ACGME and program requirements across all residents.

To establish the 100% baseline, we sum the possible "success points" (the denominator) and the actual achieved points (the numerator) across all rules for all residents.

*   **Minimum Requirements:**
    *   `Denominator`: The minimum required weeks.
    *   `Numerator`: The number of weeks assigned, capped at the minimum limit. 
    *   *Example:* Requirement is 4 weeks of wards. Resident gets 3 weeks. Score is 3/4 (75%). If resident gets 5 weeks, score is 4/4 (100%).
*   **Maximum Requirements:**
    *   `Denominator`: Theoretical worst case violation. Calculated as `Total Schedule Weeks - Maximum Limit` (e.g., 52 weeks - 6 max weeks = 46).
    *   `Numerator`: `Denominator - Max(0, Assigned Weeks - Maximum Limit)`.
    *   *Example:* Max limit is 6. Resident gets 7. Denominator is 46. Numerator is `46 - 1 = 45`. Score is 45/46 (97.8%). Worst case (52 assigned) results in 0/46 (0%).

### 2. Staffing Requirements
Calculates adherence to weekly service coverage limits across all rotations.

*   **Minimum Staffing:**
    *   `Denominator`: The minimum required residents for the shift/week.
    *   `Numerator`: The number of residents assigned, capped at the minimum limit.
*   **Maximum Staffing:**
    *   `Denominator`: Theoretical worst case violation. Calculated as `Total Available Residents - Maximum Limit`.
    *   `Numerator`: `Denominator - Max(0, Assigned Residents - Maximum Limit)`.

### 3. Total Intensity
Normalizes the overall difficulty of the schedule to prevent algorithms from "achieving fairness" by uniformly assigning everyone to high-intensity rotations when lower-intensity options are available.

*   **Perfect Score (100%)**: The theoretical minimum sum of intensity points across the entire schedule (every flexible block is assigned the lowest available intensity rotation).
*   **Worst Score (0%)**: The theoretical maximum sum of intensity points (every flexible block is assigned the highest available intensity rotation).
*   **Percentage**: `Max(0, 100 - ((Actual Total Intensity - Min Possible Intensity) / (Max Possible Intensity - Min Possible Intensity)) * 100)`

### 4. Streak Equity
Penalizes uneven distribution of high-intensity rotation runs to prevent individual burnout.

*   **Intensity Streak**: A consecutive run of rotations with an intensity rating of 3 or higher.
*   **Perfect Score (100%)**: Standard Deviation of the maximum streak length across all residents is 0 (everyone's longest streak is identical).
*   **Worst Score (0%)**: Maximum possible Standard Deviation (e.g., one resident has a 52-week streak, all others have 0).
*   **Percentage**: `Max(0, 100 - (Actual SD / Worst Case SD) * 100)`

### 5. Relationship Diversity
Measures the percentage of unique residents each person has shared a team with. High diversity ensures cross-cohort collaboration and prevents team isolation. The score calculation gives higher weight to diversity in earlier years (PGY-1 > PGY-2 > PGY-3).

*   **Perfect Score (100%)**: Every resident shares a team with 100% of the other residents in the program at least once during the year.
*   **Worst Score (0%)**: Every resident shares a team with 0% of the other residents (e.g., they work completely alone all year).
*   **Percentage**: `(Weighted Actual Unique Teammates / Weighted Total Possible Teammates) * 100`

### 6. Jeopardy Pool Stability
Evaluates the consistency of the available backup/jeopardy pool (PGY-2s and PGY-3s on flexible blocks) to ensure there are no weeks with severe coverage shortages.

*   **Perfect Score (100%)**: The standard deviation of the jeopardy pool size across all weeks is exactly 0.
*   **Worst Score (0%)**: The maximum theoretical standard deviation (e.g., all seniors on flexible blocks during a single week, leaving 0 for all other weeks).
*   **Percentage**: `Max(0, 100 - (Actual SD / Worst Case SD) * 100)`

### 7. PGY-3 Fairness
Evaluates the equitable distribution of desirable and undesirable assignments among the PGY-3 class.

*   **Perfect Score (100%)**: Standard Deviation of these assignments across the class is exactly 0.
*   **Worst Score (0%)**: The theoretical maximum Standard Deviation, which occurs when exactly half the class receives 100% of the desirable assignments, and the other half receives 0%.
*   **Percentage**: `Max(0, 100 - (Actual SD / Worst Case SD) * 100)`

### 8. PGY-2 Fairness
Evaluates the equitable distribution of desirable and undesirable assignments among the PGY-2 class. Same math as PGY-3 Fairness.

### 9. PGY-1 Fairness
Evaluates the equitable distribution of desirable and undesirable assignments among the PGY-1 class. Same math as PGY-3 Fairness.
