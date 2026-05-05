# Selection of Winning Schedules

The Residency Scheduler uses a **Tournament Leaderboard** model to determine the best possible schedule across multiple competing algorithms.

## Scoring Model
Candidate schedules are ranked using a multi-factor fitness function. For a detailed breakdown of point values, penalties, and fairness bonuses, see [Scoring Specification](./scoring.md).

## Independent Solver Exhaustion
To ensure computational efficiency, each solver (algorithm) stops independently when it is statistically unlikely to find further improvements.

### The "Max Gap" Logic
1.  Each solver tracks the **longest gap** ($N_{max}$) in iterations between any two consecutive improvements it has found.
2.  The initial $N_{max}$ is set to **20** to allow for a bootstrap phase.
3.  Every time a solver finds a new best score, the gap since its last improvement is calculated. If this gap is larger than the current $N_{max}$, $N_{max}$ is updated.
4.  A solver is marked as **Exhausted** only when it has failed to find a new best for $N_{max} \times 10$ iterations.
5.  The global competition ends when all active solvers are exhausted or the user manually promotes the leaderboard.

When a solver is terminated, the line in the graph terminates at that iteration with an X marker. All other proceed to the right with circular markers.

This logic ensures that solvers that struggle initially but eventually find a path to improvement are given enough time to explore, while efficient solvers that plateau early can stop quickly to save resources.

## Two-Phase Generation Pipeline
*   **Phase 1 (Competition)**: The 4 stateless generators (WeekByWeek, StaffingFirst, Stochastic, EducationFirst) compete to produce the best baseline schedule. This phase uses the exhaustion logic described above.
*   **Phase 2 (Healing)**: A hill-climbing optimizer takes the Phase 1 winner and resolves remaining violations through block swaps (4-block → 2-block → 1-block). This phase also powers the "Heal" button for post-manual-edit repair.
*   **ExactConstraintGenerator removal**: The "Annealed Core Constraint Solver" is removed from the Phase 1 competition loop — its role is fully replaced by Phase 2.

