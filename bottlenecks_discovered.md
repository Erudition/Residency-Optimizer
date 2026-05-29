# Systemic Scheduling Bottlenecks (Mathematical Audit)

This document outlines structural constraints discovered while auditing the residency curriculum requirements against the hospital's rotation capacity. 

## 1. No Staffing Bottlenecks Identified
A comprehensive audit of the 15-intern and 22-senior roster against the core inpatient requirements (MICU and Wards) confirms that the program has a consistent surplus of available residents every week.

### The Supply/Demand Math:
*   **Availability**: Under the 4+1 model, 12 interns and 17-18 seniors are available for inpatient staffing every week.
*   **Mandatory Core Demand**: 
    *   Interns: 5 (MICU: 2, Wards R/B/M: 3)
    *   Seniors: 5 (MICU: 1, Wards R/B/M: 3, EM: 1)
*   **Surplus**: The program has a surplus of **7 interns** and **12+ seniors** every week to cover subspecialties, electives, and jeopardy.

## 2. Generator Fluidity (Implementation Note)
The scheduling engine must be configured for "Week-by-Week" staffing rather than "Rigid 4-Week Block" staffing. Because clinic weeks are staggered, trying to force every rotation to be a contiguous 4-week block starting on a specific date creates artificial conflicts. Allowing rotations to be fulfilled across the 4-week core windows ensures 100% compliance with both staffing and graduation mandates.

## 3. Elective Squeeze & Jeopardy Gap (Night Float Policy)
Increasing the Night Float requirement from 2 weeks (1 block) per year to 4 weeks (2 blocks) per year creates a significant mathematical bottleneck for PGY-2 and PGY-3 residents. This policy consumes 2 additional weeks of their pure elective time pool. Because the Jeopardy system requires at least one PGY-2 and PGY-3 resident to be actively assigned to `ELECTIVE` time every week to maintain the gap coverage, this massive reduction in available elective weeks triggers widespread "Jeopardy Gap" weekly violations across the generated schedules. The algorithm generates a compliant schedule with regard to core staffing (zero critical staffing violations), but mathematically cannot satisfy all Jeopardy constraints under these requirements.

## 4. The Week 1 4+1 Clinic Startup Bottleneck
When generating schedules with continuous 4-week blocks at the start of the academic year (Week 1), there is a mathematical impossibility in staffing all core 4-week rotations simultaneously due to the 4+1 clinic cycle.
*   **The Clinic Conflict**: In a 4+1 system, 4 out of the 5 cohorts will hit their 1 clinic week during the first 4 weeks (Weeks 1, 2, 3, 4). This means **only 1 cohort** is completely free to take a continuous 4-week block starting at Week 1.
*   **The Intern Capacity**: With 15 interns evenly distributed, that 1 free cohort contains only **3 interns**.
*   **The Staffing Demand**: Core rotations (ICU, NF, W-MET, W-BLUE, W-RED) require **6 interns on duty** every week. 
*   **The Result**: The program physically lacks the 6 interns required to start continuous 4-week blocks at Week 1 without a clinic conflict. The generator intelligently resolves this by staggering the start dates of these blocks across the following weeks as other cohorts finish their first clinic. This naturally covers the remainder of the year, but inherently leaves 3 required intern slots unmet exclusively in Week 1. This is a physical scheduling reality, not an algorithmic defect.

## 5. Unified 3-Year Grid Alignment (Algorithmic Resolution)
Historically, the `RequirementsEngine` evaluated 3-year unified multi-year grids by mapping grid weeks to a continuous, infinite `globalWeek` timeline. However, since the generator bounds residents' "active window" explicitly against a 0-indexed grid-relative schedule (`activeWeekStart` based on `startYear`), the evaluator's use of `globalWeek` caused massive false-positive filtering. For instance, current PGY-2/3 residents were completely excluded from the active pool at the start of a multi-year grid because the evaluator incorrectly compared `globalWeek` (e.g., 104) against their grid-relative `activeWeekStart` (e.g., 0) and `activeWeekEnd` (e.g., 52). This filtered them out, leading to thousands of "ghost" violations (`Min Seniors unmet: 0`). 
*   **Resolution**: The `RequirementsEngine` active resident filter now properly correlates grid bounds utilizing the local grid offset (`week`), completely eliminating the thousands of spurious 3-year violations. The physical 3 violations in week 1 (due to the 4+1 Clinic conflict) correctly remain.
