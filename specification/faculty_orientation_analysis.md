# Faculty Orientation Analysis: Scheduling Implications and ACGME Compliance

Based on the provided **New Faculty Orientation** presentation, the following are the primary requirements and constraints that must be incorporated into the Residency Optimizer scheduling algorithms, along with a review of ACGME compliance against our documented rules.

## 1. ACGME Patient Census Limits (Compliant)

The patient volume caps detailed in the presentation **perfectly match** the ACGME rules provided in your `GEMINI.md` context. 

### PGY-1 (Interns)
- **Daily Cap:** Max 5 new patients per admitting day.
- **48-Hour Cap:** Max 8 new patients in a 48-hour period.
- **Total Census:** Max 10 patients for ongoing care at any given time.

### PGY-2 & PGY-3 (Supervising)
- **Supervising 1 Intern:** Max 14 total patients for ongoing care.
- **Supervising >1 Intern:** 
  - Max 10 new patients (+ 4 transfers) per admitting day.
  - Max 16 new patients in a 48-hour period.
  - Max 20 total patients for ongoing care.

> [!TIP]
> **Implication for App:** Tracking daily admissions, rolling 48-hour totals, and active running census natively is **beyond the scope** of the scheduling engine at this stage. Instead, the program will rely on resident self-reporting and attending compliance to ensure these caps are not violated.

## 2. Shift Durations & Duty Hour Vigilance (Requires Constraint Logic)

The presentation outlines the primary Inpatient Medicine Rotation schedule as:
- **Days:** Monday to Sunday
- **Hours:** 6:00 AM – 6:00 PM (12-hour shifts)
- **Morning Report:** M, T, W, TH, F (7:15 AM – 8:00 AM)

> [!WARNING]
> **ACGME Compliance Note:** A strict 7-day, 12-hour schedule results in **84 hours per week**, which exceeds the ACGME maximum of 80 hours per week (averaged over 4 weeks). Furthermore, ACGME mandates **1 day off in 7** (averaged). 
> **Implication for App:** The app will **not** need to track or strictly enforce these duty hours or the "1 day off in 7" rule natively. The inpatient teams will dynamically coordinate time off among themselves and their attendings to ensure coverage and ACGME compliance.

## 3. Thursday Academic Half-Day (AHD)

The program features an Academic Half-Day every **Thursday from 12:00 PM to 5:00 PM**.

> [!IMPORTANT]
> The presentation explicitly states that during AHD, service lines are *"amply covered by faculty/attendings – not resident dependent."*
> **Implication for App:** Tracking the schedule at this level of intra-day granularity (such as Thursday afternoon AHD cross-coverage) is **beyond the scope** of the application. The program will only manage high-level block rotation scheduling.

## 4. Inpatient Team Structures

The slides illustrate a variable mix of heterogeneous team structures (e.g., 1 Senior + 3 Interns, 1 Senior + 1 Mid-level + 1 Intern) primarily to explain how ACGME patient caps fluctuate depending on the team makeup.

> [!NOTE]
> **Implication for App:** Despite these examples, the scheduling engine should strive to build the standard, typical ratios discussed previously (specifically the **1 Senior + 1 Intern** and **1 Senior + 2 Interns** models). Since the app will not natively track dynamic patient caps, establishing rigid, standard structural templates is the preferred approach.

## 5. Faculty Supervision

- **Requirement:** *"In-house 24/7 Supervision."*
- **Implication for App:** Whenever a resident is scheduled for Night Float (NF), MICU, or weekend Wards, a corresponding attending schedule must map exactly 1-to-1 to ensure there are no gaps in 24/7 in-house coverage.

## 6. Clinic Faculty Ratios
During outpatient staffing, specific ratios must be maintained:
*   Standard precepting: **1 faculty member to 4 learners**.
*   If the faculty member is concurrently managing their own patient panel: **1 faculty member to 2 learners**.

## 7. Faculty & Attending Scope
Based on new faculty orientation materials:
*   **Out of Scope Tracking:** The application will not natively track daily admissions caps, rolling 48-hour totals, running patient census, daily 12-hour shift duty hours limits, the 1-day-off-in-7 rule, or Thursday Academic Half-Day (AHD) intra-day coverage. These will be managed organically by the teams.
*   **In-house 24/7 Supervision:** The system requires that whenever a resident is scheduled for Night Float (NF), MICU, or weekend Wards, a corresponding attending schedule must map exactly 1-to-1 to ensure there are no gaps in 24/7 coverage.

