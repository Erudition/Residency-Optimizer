# Selection of Winning Schedules

The Residency Scheduler uses a **Tournament Leaderboard** model to determine the best possible schedule across multiple competing algorithms.

## Scoring Heuristics (The "Fitness" Function)
Schedules are ranked by a total score where **higher is better**. The score is composed of:

1.  **Hard Constraint Penalty (Staffing)**: -10,000 points for every resident-week violation of `min/max` staffing floors.
2.  **Educational Requirement Penalty**: -50,000 points for every missing mandatory rotation for any resident.
3.  **Fairness Bonus (PGY-3)**: Up to +10,000 points based on the fairness coefficient of the senior class.
4.  **Streak Penalty**: Negative points for long stretches of high-intensity rotations.

## Independent Solver Exhaustion
To ensure computational efficiency, each solver (algorithm) stops independently when it is statistically unlikely to find further improvements.

### The "Max Gap" Logic
1.  Each solver tracks the **longest gap** ($N_{max}$) in iterations between any two consecutive improvements it has found.
2.  The initial $N_{max}$ is set to **20** to allow for a bootstrap phase.
3.  Every time a solver finds a new best score, the gap since its last improvement is calculated. If this gap is larger than the current $N_{max}$, $N_{max}$ is updated.
4.  A solver is marked as **Exhausted** only when it has failed to find a new best for $N_{max} \times 10$ iterations.
5.  The global competition ends when all active solvers are exhausted or the user manually promotes the leaderboard.

This logic ensures that solvers that struggle initially but eventually find a path to improvement are given enough time to explore, while efficient solvers that plateau early can stop quickly to save resources.
