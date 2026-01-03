
# Scheduling Rules & Constraints

This document outlines the logic and constraints used by the **Residency Scheduler Pro** algorithm.

## 1. The 4+1 Model (Cohorts)
*   **Structure**: Residents are divided into 5 cohorts (0-4), corresponding to groups A through E.
*   **Clinic Weeks**: Every 5th week is a guaranteed **Clinic (CCIM)** week.
    *   *Formula*: `Week % 5 == Cohort ID`
    *   *Constraint*: Clinic weeks are fixed and cannot be overwritten by other rotations.

## 2. Rotation Requirements

The scheduler attempts to fill shifts based on the following minimum and maximum staffing requirements per week.

| Rotation | Duration | Min Interns | Max Interns | Min Seniors | Max Seniors | Total Team Size |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Night Float** | 2 Weeks | 1 | 2 | 1 | 3 | 2 - 5 |
| **ICU** | 4 Weeks | 2 | 2 | 2 | 2 | 4 |
| **Wards (Red)** | 4 Weeks | 2 | 3 | 1 | 2 | 3 - 5 |
| **Wards (Blue)** | 4 Weeks | 2 | 3 | 1 | 2 | 3 - 5 |
| **Emergency** | 2 Weeks | 1 | 2 | 0 | 2 | 1 - 4 |

### PGY1 Required Electives
In addition to the above, Interns (PGY1) are required to complete the following electives.

*   **Cardiology (CARDS)**: 4 Weeks
*   **Emergency (EM)**: 4 weeks
*   **Infectious Disease (ID)**: 2 Weeks
*   **Nephrology (NEPH)**: 2 Weeks
*   **Pulmonology (PULM)**: 2 Weeks

### PGY2 Required Rotations
Residents in their second year (PGY2) have a specific set of required blocks that must be fulfilled:

*   **Hematology-Oncology (ONC)**: 4 Weeks
*   **Neurology (NEURO)**: 4 Weeks
*   **Rheumatology (RHEUM)**: 4 Weeks
*   **Gastroenterology (GI)**: 4 Weeks
*   **Night Float**: 2 Weeks

### PGY3 Required Electives
Residents in their third year (PGY3) are required to complete the following electives:

*   **Addiction Medicine (Add Med)**: 2 Weeks
*   **Endocrinology (Endo)**: 2 Weeks
*   **Geriatrics (Geri)**: 2 Weeks
*   **Palliative Care (HPC)**: 2 Weeks
*   **Night Float**: 2 Weeks


## 4. Gaps & Electives
*   Any week left unassigned after all mandatory and required rotations are processed is automatically filled with **Generic Elective**. Electives are good, add as many as possible - evenly among PGYs!

## 5. Team Diversity
*   The system tracks co-working relationships.
*   While not a hard constraint during generation, the `Relationship Stats` tab monitors diversity to ensure residents work with a broad mix of colleagues.
