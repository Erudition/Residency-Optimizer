# Systemic Scheduling Bottlenecks (Mathematical Audit)

This document outlines the fundamental mathematical impossibilities and structural constraints discovered while auditing the residency curriculum requirements against the hospital's rotation capacity. These are **systemic deficits**—they exist regardless of the scheduling algorithm used—and require policy or staffing adjustments to resolve.

## 1. Senior Resident Ward Capacity Deficit
The current curriculum requirements for PGY-2 and PGY-3 residents exceed the available minimum staffing capacity for core Ward teams.

### The Math:
*   **Total Senior Residents**: 22 (14 PGY-2, 8 PGY-3).
*   **Annual Requirement**:
    *   PGY-2: 14 residents × 12 weeks = 168 weeks.
    *   PGY-3: 8 residents × 4 weeks = 32 weeks.
    *   **Total Required**: **200 senior-weeks**.
*   **Total Minimum Capacity**:
    *   Wards Red/Blue: 2 teams × 1 senior/week × 52 weeks = **104 senior-weeks**.
*   **Deficit**: **96 weeks (48% shortfall)**.

> [!CAUTION]
> To meet the 200-week requirement, the program **must** consistently staff both Wards Red and Blue at their **maximum capacity** (2 seniors per team) for nearly the entire academic year, or utilize Metro Wards (max 2) for an additional 48 weeks. Any PTO or leave further exacerbates this shortfall.

## 2. Intern Ward Capacity Deficit
The intern class requirements also slightly exceed the standard minimum staffing of the core Ward teams.

### The Math:
*   **Total Interns (PGY-1)**: 15.
*   **Annual Requirement**: 15 residents × 16 weeks = **240 intern-weeks**.
*   **Total Minimum Capacity**:
    *   Wards Red/Blue: 2 teams × 2 interns/week × 52 weeks = **208 intern-weeks**.
*   **Deficit**: **32 weeks (13.3% shortfall)**.

> [!NOTE]
> This requires either over-staffing teams to 3 interns (max capacity) or utilizing Metro Wards interns to recover the missing 32 weeks.

## 3. Emergency Medicine (EM) Supply/Demand
EM is restricted to PGY-2/3 residents, creating a concentrated demand on a limited rotation.

*   **Requirement**: 22 seniors × 4 weeks = **88 weeks**.
*   **Minimum Capacity**: 0 residents/week (optional rotation per staffing rules).
*   **Challenge**: The scheduler must ensure at least 2 EM slots are filled for 36 weeks of the year to meet the target, which competes with the aforementioned Ward over-staffing needs.

## 4. Cohort Imbalance (The "Prime Number" Problem)
The 4+1 schedule relies on dividing the class into 5 equal cohorts. However, the current class sizes are not multiples of 5:
*   **Interns (15)**: Balanced (3 per cohort).
*   **PGY-2 (14)**: Imbalanced (Four cohorts of 3, one cohort of 2).
*   **PGY-3 (8)**: Imbalanced (Three cohorts of 2, two cohorts of 1).

### Impact:
This creates "Heavy Weeks" and "Light Weeks" where the supply of available residents fluctuates by up to 3 residents. In a "Light Week" with multiple seniors in clinic, it becomes mathematically impossible to fill all minimum core staffing slots (Wards + ICU + NF) without pulling from flexible electives, often violating educational targets.

## 6. Intern Core Supply Deficit (Critical)
The current core staffing requirements for interns exceed the total available supply when factoring in the 4+1 cohort clinic weeks.

### The Math:
*   **Total Interns**: 15.
*   **Cohort Logic**: 1/5th (3 residents) are in Clinic (+1 week) at all times.
*   **Available for Core**: **12 interns**.
*   **Minimum Core Requirements**:
    *   MICU: 4 (Per authoritative reference)
    *   Wards Red: 2
    *   Wards Blue: 2
    *   Met Wards: 3
    *   Night Float: 1
    *   Pulm: 1
    *   **Total Required**: **13 interns**.
*   **Deficit**: **1 intern per week (Systemic)**.

### Impact:
*   It is mathematically impossible to satisfy all core minimums simultaneously.
*   **Resolution Strategy**: Per `GEMINI.md`, the 4th intern slot at MICU is backfilled by an NP/PA. The scheduling engine must be configured to target **3 Interns** for MICU to achieve a zero-violation resident schedule.

## 8. Night Float & Pulmonology Supply Gap
The current curriculum assigns 2 weeks of Night Float (NF) and 2 weeks of Pulmonology to each intern. However, to staff these positions every week of the year, a larger pool of intern-weeks is required.

### The Math:
*   **Total Weeks in Year**: 52.
*   **Required Staffing (Min 1/week)**: 52 intern-weeks each for NF and Pulm.
*   **Total Available (15 residents * 2 weeks)**: **30 intern-weeks each**.
*   **Deficit**: **22 weeks per year (42% shortfall)**.

### Impact:
*   For approximately 22 weeks of the year, it is mathematically impossible to have an intern on Night Float or Pulmonology under the current 2-week-per-resident rule.
*   **Resolution Strategy**: The scheduling engine must accept 0 interns for these rotations during the "gap" weeks. Minimum constraints should be set to 0 in `constants.ts` for these specific rotations to avoid constant violations, or the curriculum must be adjusted to 4 weeks per resident.

