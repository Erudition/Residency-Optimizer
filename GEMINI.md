# Residency Optimizer App
This project is a collaboration between Github users @Erudition (developer) and @AHWright (Medical Resident). It's developed within a shared Antigravity workspace. You should always update this GEMINI.md (and the files it embeds) with context about the requirements given to you during conversation, especially when you're not specifically asked to put it in a specific file. Keep this document up to date with as much domain knowledge as possible.

The project is built to a Github pages site available at `https://erudition.github.io/Residency-Optimizer/`, built from the main branch. Make sure I am always working in a dedicated feature branch when making changes. 

After any code modification, you MUST run `npx tsc --noEmit` and confirm zero errors before claiming completion. Vite's dev server does not perform type checking—it only transpiles—so runtime ReferenceErrors and missing imports will not surface until the user hits them in the browser. Once the code compiles cleanly, please commit your changes with a descriptive commit messages. If code changes are involved, prefer to only commit when tests pass, but if documentation or just GEMINI.md is updated, commit and push immediately after editing. If there is a backlog of many files to commit, try to break them down into separate commits with related files grouped.

All work should be done in short-lived feature branches. WHen you have a plan, create a branch, commit the changes in atomic batches, and if you are not the repository owner,open a pull request when done.



# Additional ACGME & Scheduling Constraints

The core curriculum proposal outlines *what* blocks the residents must take, but there are several critical operational and ACGME scheduling constraints discussed during our conversation that must be factored into the underlying logic of the `Residency-Optimizer` application. 

Here are the rules that must govern the schedule generation:

## 1. 4+1 Cohort Division Logic
To seamlessly execute a 4+1 block schedule while keeping both the inpatient services and the outpatient clinics staffed properly year-round:
*   The residency class must be divided into **5 equal cohorts** (e.g., Cohorts A, B, C, D, and E), or as close to equal as possible.
*   Each week, exactly one cohort will be rotating through their `+1` ambulatory continuity clinic, while the other four are on their 4-week core inpatient assignments. 

## 2. Inpatient Patient Census Caps (Wards)
When your program generates daily team assignments and accepts admissions, ACGME enforces strict patient volume limits based on PGY level:

**PGY-1 (Interns):**
*   **Admissions:** Maximum 5 new patients assigned per admitting day (plus up to 2 in-house transfers).
*   **Short-term cap:** Maximum 8 new patients in any 48-hour period.
*   **Ongoing scale:** Maximum 10 total patients for ongoing care at any given time.

**PGY-2 or PGY-3 (Residents) Supervising PGY-1s:**
*   *If supervising ONE intern:* Maximum 14 total patients for ongoing care.
*   *If supervising MULTIPLE interns:* 
    *   Maximum 10 new patients (+4 transfers) per admitting day.
    *   Maximum 16 new patients in any 48-hour period.
    *   Maximum 20 total patients for ongoing care.

## 3. Clinic Faculty Ratios
During outpatient staffing, specific ratios must be maintained:
*   Standard precepting: **1 faculty member to 4 learners**.
*   If the faculty member is concurrently managing their own patient panel: **1 faculty member to 2 learners**.

## 4. Duty Hours
Any algorithms mapping shifts (especially for Night Float and ICU) must adhere to:
*   Maximum **80 hours** per week, averaged over a 4-week period.
*   Maximum **24 consecutive hours** of scheduled clinical assignments (plus up to 4 additional hours for care transition).
*   Residents must be provided at least **1 day off in 7**, averaged over a 4-week period.

## 5. Subspecialty Auditing List
While the curriculum leaves space for "Subspecialties", the ACGME requires that the program offers and successfully rotates residents through experiences covering all nine ABIM internal medicine subspecialties. Your app should ensure the availability/tracking of:
1.  Cardiology
2.  Endocrinology
3.  Gastroenterology
4.  Hematology 
5.  Medical Oncology (Usually paired as Heme-Onc)
6.  Infectious Disease
7.  Nephrology
8.  Pulmonology
9.  Rheumatology

## 6. Rotation Month Minimums & Maximums
Based on ACGME Program Requirements (Section 4):
*   **Total Clinical Experiences:** Minimum of 30 months overall.
*   **Inpatient and Critical Care Elements:** Minimum of 10 months.
*   **Critical Care Specifics:** Minimum of 2 months and a Maximum of 6 months. Must not occur solely in PGY-1.
*   **Outpatient/Ambulatory:** Minimum of 10 months foundational experiences.
*   **Individualized Experiences:** At least 6 months directed to future practice.

## 7. Mandatory Multidisciplinary Clinical Experiences
The program rules require that your application include routing logic ensuring that every single resident accomplishes dedicated clinical experiences in:
*   Geriatric Medicine
*   Hospice and Palliative Medicine
*   Addiction Medicine
*   Emergency Medicine
*   Neurology

## 8. Faculty & Attending Scope
Based on new faculty orientation materials:
*   **Out of Scope Tracking:** The application will not natively track daily admissions caps, rolling 48-hour totals, running patient census, daily 12-hour shift duty hours limits, the 1-day-off-in-7 rule, or Thursday Academic Half-Day (AHD) intra-day coverage. These will be managed organically by the teams.
*   **In-house 24/7 Supervision:** The system requires that whenever a resident is scheduled for Night Float (NF), MICU, or weekend Wards, a corresponding attending schedule must map exactly 1-to-1 to ensure there are no gaps in 24/7 coverage.

## 9. Reminders
*   **Important:** Make Pulmonology a staffed rotation.
*   **Naming update:** Use "AMCS Consults" instead of "CVICU" when referring to advanced cardiovascular mechanical support to avoid accidental triggering of the ACGME critical care limits.
*   **Staffing strategy:** Pair interns (PGY-1s) and Seniors (PGY-2 or PGY-3) to rotate together on the pulmonology consult/procedural service.
*   **ICU Staffing:** The ideal complement of residents at MICU is 4 interns (PGY1s) and 2 senior residents (PGY2s or PGY3s). Due to native intern supply limits, the 4th intern slot will be backfilled by a dedicated NP/PA.
*   **Subspecialty Capacities:** Both Nephrology (Renal) and Hematology-Oncology (Heme-Onc) rotations can accept a maximum of 2 residents at any given time.

## 10. UI Presentation Standards
*   **Resident Sorting:** The default resident display order must prioritize PGY-1s (Interns) at the top of the list, followed by PGY-2s and PGY-3s. Within each PGY level, residents should be sorted alphabetically. In Cohort view, this same seniority-last (PGY 1 → 2 → 3) sub-sort must apply within each cohort.
*   **Academic Year Display:** Toggle buttons and labels for academic years must display the full academic year range (e.g., "2026 - 2027") rather than a single starting year.

## 11. Process Management & Background Tasks
*   **Vitest Testing:** When running Vitest tests via the shell, always use `--run` (or equivalent) to disable watch mode. This is especially critical when piping output to a file or running in the background, as watch mode can prevent the IDE from correctly terminating the process, leading to stale background tasks.

## 12. Deficit Recovery & Scheduling Engine Logic
The application must programmatically enforce the following recovery rules when a resident takes PTO or extended leave:
*   **Competency Override:** If PTO reduces a 4-week mandatory block to 3 weeks, do NOT force a makeup.
*   **Minimum Threshold Flag:** If PTO reduces a 2-week mandatory split block to 1 week or less, the engine must trigger a **Subspecialty Deficit Flag** and automatically overwrite the resident's next available "Pure Elective" block to recover the mandated time.
*   **Leave of Absence Re-calc:** For extended leaves, the engine must drop conflicting core blocks. Upon return, it must automatically cannibalize future pure elective time to fulfill missing ACGME mandatory minimums. If insufficient elective time remains, the engine must flag the resident for a "Training Extension".

## 13. Year-Specific Cohort Mapping
*   **Constraint**: Residents do not have a persistent `cohort` property. Cohort assignments are strictly year-specific and must be managed via external mapping (e.g., `ScheduleSession.cohortAssignments`).
*   **Historical Data**: Cohorts for 2024 and 2025 are hardcoded in `historyPreloader.ts` to ensure historical accuracy and prevent UI crashes during navigation.
*   **UI Stability**: Components (like `ScheduleTable`) must handle optional or missing cohort data defensively (e.g., fallback to 'N/A') to maintain functionality across different academic years.

