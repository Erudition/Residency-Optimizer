### Vacation Scheduling (Human-Only)
*   **Hard Constraint**: Algorithms and automated generators are FORBIDDEN from scheduling "Vacation" weeks. 
*   **Human Ownership**: Only human users may assign vacation time.
*   **Algorithmic Behavior**: The scheduling engine should only fill core inpatient blocks, mandatory subspecialties, and "Elective" blocks. Residents will manually replace elective blocks with their chosen subspecialties or vacation weeks.

### Deficit Recovery & Scheduling Engine Logic
The application must programmatically enforce the following recovery rules when a resident takes PTO or extended leave:
*   **Competency Override:** If PTO reduces a 4-week mandatory block to 3 weeks, do NOT force a makeup.
*   **Minimum Threshold Flag:** If PTO reduces a 2-week mandatory split block to 1 week or less, the engine must trigger a **Subspecialty Deficit Flag** and automatically overwrite the resident's next available "Pure Elective" block to recover the mandated time.
*   **Leave of Absence Re-calc:** For extended leaves, the engine must drop conflicting core blocks. Upon return, it must automatically cannibalize future pure elective time to fulfill missing ACGME mandatory minimums. If insufficient elective time remains, the engine must flag the resident for a "Training Extension".

### Year-Specific Cohort Mapping
*   **Constraint**: Residents do not have a persistent `cohort` property. Cohort assignments are strictly year-specific and must be managed via external mapping (e.g., `ScheduleSession.cohortAssignments`).
*   **Historical Data**: Cohorts for 2024 and 2025 are hardcoded in `historyPreloader.ts` to ensure historical accuracy and prevent UI crashes during navigation.
*   **UI Stability**: Components (like `ScheduleTable`) must handle optional or missing cohort data defensively (e.g., fallback to 'N/A') to maintain functionality across different academic years.

### Jeopardy & Backup Coverage Logic
The system must ensure a guaranteed backup pool exists every week to handle call-outs without breaking ACGME inpatient caps:
*   **Jeopardy Pool Definition**: Any PGY-2 or PGY-3 resident currently assigned to a **flexible block** (Elective or Subspecialty Consult).
*   **Exclusion**: Interns (PGY-1s) and residents on Core rotations (Wards, ICU, NF, EM, Clinic) are EXCLUDED from the jeopardy pool.
*   **Minimum Pool Size**: The engine should prioritize maintaining at least **one PGY-3 and one PGY-2** on a flexible block per week to serve as 1st and 2nd line jeopardy.
*   **Auditing**: A "Jeopardy Gap" violation must be flagged if a week has zero senior residents available on flexible time.

### Start Year vs PGY Level Logic
To maintain year-independent data integrity, the application treats **Start Year** as the primary source of truth for a resident's seniority.
*   **Storage**: The `Resident` object persists `startYear` (the calendar year they started PGY-1).
*   **Derivation**: PGY Level is calculated on-the-fly relative to the `activeYear` context (Formula: `activeYear - startYear + 1`).
*   **UI Constraint**: Resident management interfaces must expose and allow editing of `startYear` rather than static PGY levels to ensure consistency when navigating historical or future academic years.

### Dynamic Academic Year Labeling
*   **Constraint**: The "Current" academic year label must be determined dynamically based on the current calendar date, using **July 1st** as the transition point.
*   **Implementation**: `getYearLabel` in `App.tsx` calculates the offset relative to the current physical academic year rather than a hardcoded constant, ensuring UI accuracy without manual code updates each July.
