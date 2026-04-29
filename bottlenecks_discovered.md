# Bottlenecks Discovered

## 1. Greedy Algorithm Performance (CARDS/NEPH Staffing)
The legacy `GreedyGenerator` (now renamed and modernized as `WeekByWeekGenerator`) was identified as a major source of staffing violations, particularly for subspecialty rotations like "CARDS" (Cardiology) and "NEPH" (Nephrology).

### Findings:
- **Myopic Selection**: The algorithm filled weeks sequentially without looking ahead. It would fill core rotations (Wards/ICU) first, often consuming the "Senior" residents who were also needed for subspecialty targets.
- **Alignment Mismatch**: Subspecialty rotations often require 4-week blocks starting at specific intervals (aligned with the 4+1 cohort schedule). The greedy approach frequently assigned residents to other duties during these alignment windows, making it mathematically impossible to fit the required 4-week subspecialty block later in the year.
- **Requirement Blindness**: The original algorithm didn't track "remaining requirements" during its loop. It simply filled hospital gaps, treating all residents as equivalent regardless of their educational needs.

### Mitigation:
- **Modernized WeekByWeek**: The updated generator now uses a **Staffing Foundation** pass that respects **4+1 Alignment**. It also incorporates an **Educational Requirement Fill** pass that prioritizes residents with the largest requirement gaps.
- **Seeded RNG**: Benchmarking is now deterministic, allowing for precise measurement of violation reductions.

## 2. PGY-Level Discrepancies in Tests
Stress tests were previously reporting high violations because the `GENERATE_RESIDENTS_FOR_YEAR` utility was incorrectly assigning PGY levels for the test year (2026), leading to an oversupply of interns or seniors that didn't match the hospital's staffing metadata. This was fixed by normalizing the `startYear` relative to the `activeYear`.
