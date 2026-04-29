# Scheduling Bottlenecks Discovered

This document tracks technical and mathematical constraints identified during the algorithmic hardening of the Residency Optimizer.

## 1. Mathematical Saturation (PGY-1)
The primary bottleneck for PGY-1 residents is the sheer density of mandatory requirements relative to the academic year.

| Component | Weeks |
| :--- | :--- |
| Mandatory Rotations (Red/Metro/MICU/NF/EM/Cards/Neph) | 38.0 |
| Ambulatory Clinic (+1 Weeks) | ~10.4 |
| **Total Mandatory Demand** | **48.4** |
| Total Available | 52.0 |
| **Remaining Slack (Elective/Vacation)** | **3.6** |

**Finding**: Since interns are entitled to up to 4 weeks of vacation (which must replace "Pure Elective" time), the schedule is mathematically "at capacity." Any sub-optimal placement in the first 10 weeks of the year can make a resident's requirement set unachievable by the final quarter.

## 2. Cohort Overlap & Slot Competition
The 4+1 block schedule creates a "sliding window" of availability that induces heavy competition for low-capacity rotations.

*   **Constraint**: Rotations like `CARDS` and `NEPH` have a `maxInterns: 2` limit.
*   **The Problem**:
    *   **Cohort A** is available weeks 1-4.
    *   **Cohort B** is available weeks 2-5.
    *   **Cohort C** is available weeks 3-6.
*   **Conflict**: If two residents from Cohort A occupy the 2 available `CARDS` slots for their 4-week block (weeks 1-4), Cohort B and Cohort C are **completely blocked** from starting `CARDS` during their primary availability window, as the slots are occupied for 3/4 of their open time.

**Recommendation**: The scheduler must implement a "Diagonal Filling" strategy where cohorts are prioritized for specific rotations in non-overlapping phases of the year to prevent these "Window Collisions."

## 3. Aggregation Blindness (Resolved)
Prior to the April 2026 hardening, the generators were "Aggregation Blind."
*   **The Issue**: The system was trying to satisfy a 16-week `WARDS_RED` target by only looking for `WARDS_RED` slots.
*   **The Reality**: `WARDS_BLUE` and `WARDS_METRO` also fulfill this requirement.
*   **Impact**: This caused the scheduler to flag violations despite available capacity on the Blue and Metro teams.
*   **Fix**: Implemented "Aggregation Awareness" in all generators, allowing them to utilize all compatible teams to satisfy a single educational requirement.

## 4. Foundation Fragmentation (Resolved)
The foundation pass (Step 3 in the `StrictGenerator`) was previously allowed to place 1-week or 2-week "stunt" assignments to satisfy mandatory staffing minimums.
*   **The Issue**: A 1-week `WARDS_RED` assignment in week 10 would "poison" the surrounding weeks, making it impossible to place a standard 4-week aligned block for that resident for the rest of that month.
*   **Fix**: Enforced **Strict Alignment** in the foundation pass. Assignments are now only placed in 4-week blocks that align with the resident's clinic-free windows.
