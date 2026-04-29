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

## 3. Senior Capacity vs Ward Requirements
The current staffing constraints for "Wards" rotations (Red, Blue, Metro) create a mathematical impossibility for meeting the PGY2 educational targets.

### Findings:
- **Requirement Volume**: There are 38 PGY2 residents, each requiring 12 weeks of Wards (3 blocks). There are also 38 PGY3 residents, each requiring 4 weeks of Wards (1 block).
- **Total Senior-Weeks Needed**: (38 * 12) + (38 * 4) = **456 senior-weeks**.
- **Current Capacity**: There are 3 Ward teams (Red, Blue, Metro), each with a `maxSeniors` constraint of **2**. This provides a total capacity of 6 seniors per week.
- **Total Capacity Available**: 6 seniors * 52 weeks = **312 senior-weeks**.
- **The Deficit**: 456 needed vs 312 available. Even with perfect distribution, **144 senior-weeks (31.5%) of the required education cannot be fulfilled.**

### Mitigation (Algorithm Level):
- The algorithm will attempt to fill as many blocks as possible (up to 312) using the `Requirement Pass`, prioritizing residents with the highest deficits.
- However, unless `maxSeniors` is increased (e.g., to 3 or 4 per team) or the targets are reduced, the system will consistently report "Target Not Met" violations for Wards in the test suite.

### Status:
- **Pending Review**: Surfacing this to the project owners for guidance on whether to loosen the `maxSeniors` cap or adjust the educational minimums.
