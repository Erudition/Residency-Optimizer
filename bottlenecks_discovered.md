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
