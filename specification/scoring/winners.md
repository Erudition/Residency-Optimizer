# Selection of Winning Schedules

The Residency Scheduler uses a **Tournament Leaderboard** model to determine the best possible schedule across multiple competing algorithms.

## Scoring Model
Candidate schedules are ranked using a multi-factor fitness function. For a detailed breakdown of point values, penalties, and fairness bonuses, see [Scoring Specification](./scoring.md).

## Independent Solver Exhaustion
To ensure computational efficiency, each solver (algorithm) stops independently when it is statistically unlikely to find further improvements. The app should NOT use a hard limit on the number of rounds. It is explicitly okay that the process takes a long time and explores thousands of iterations.

In the competition, generators are "exhausted" (discontinue finding better schedules) when they've gone N*10 iterations without finding a new better schedule, where N is the highest seen iteration count before the next better schedule was found.

### The "Max Gap" Logic
1.  Each solver tracks the **longest gap** ($N_{max}$) in iterations between any two consecutive improvements it has found.
2.  The initial $N_{max}$ is set to **20** to allow for a bootstrap phase.
3.  Every time a solver finds a new best score, the gap since its last improvement is calculated. If this gap is larger than the current $N_{max}$, $N_{max}$ is updated.
4.  A solver is marked as **Exhausted** only when it has failed to find a new best for $N_{max} \times 10$ iterations.
5.  The global competition ends when all active solvers are exhausted or the user manually promotes the leaderboard.

When a solver is exhausted (and only at that point), the line in the graph terminates at that iteration with an X marker. All other lines proceed to the right with circular markers.

UI Note: Say the iteration at which a solver will be exhausted (iteration number of last improvement found + N_max*10) is `E` The graph should have its width (max X value) dynamically update to the current highest E among all current competitors.

## Two-Phase Generation Pipeline
*   **Phase 1 (Competition)**: The 4 stateless generators (WeekByWeek, StaffingFirst, Stochastic, EducationFirst) compete to produce the best baseline schedule. This phase uses the exhaustion logic described above.
*   **Phase 2 (Healing)**: A hill-climbing optimizer takes the Phase 1 winner and resolves remaining violations through block swaps (4-block → 2-block → 1-block). This phase also powers the "Heal" button for post-manual-edit repair. It can run indefinitely, always remembering the best improvement it has found, and never returning a lower-scoring schedule.

