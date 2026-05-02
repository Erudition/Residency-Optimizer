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

## 5. Cardiology (CARDS) Senior Staffing Impossibility
The current curriculum rules require PGY-3 residents to rotate through Cardiology, but weekly staffing rules prevent senior residents from rotating.

### The Math:
*   **Curriculum Requirement (PGY-3)**: 8 residents × 2 weeks = **16 senior-weeks**.
*   **Staffing Limits (CARDS)**: `maxSeniors: 0` = **0 senior-weeks available**.
*   **Deficit**: **16 senior-weeks**.

### Impact:
*   Because seniors are restricted from rotating through Cardiology (`maxSeniors: 0`), there is no way to meet the PGY-3 curriculum requirement of 16 senior-weeks in Cardiology without generating weekly violations.

