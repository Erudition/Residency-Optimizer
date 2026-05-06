## Autopilot Cycle 1: Stability & Calibration
- **Stage Result**: Success
- **Tasks**: T2.3 (Ghost UI Removal), T5.2 (Healer Parameter Fix)
- **Status**: Frontend crash resolved. Healer now receives correct activeYear for PGY calculations.
- **Evidence**: `tsc` passed. Manual audit of `App.tsx` confirms surgical removal of "exact" algorithm and correction of `healSchedule` call.

## Autopilot Cycle 2: Healer Evolution
- **Objective**: Implement 4-block/2-block Hill Climbing in `healer.ts` (T4.2).
- **Strategy**: 
    1. Update `types.ts` to include `year` in violations for better diagnostics.
    2. Refactor `healer.ts` to use block-aware swapping (respecting 4+1 clinic alignment).
    3. Add "Staffing Safety" check to prevent the healer from introducing understaffing while trying to fix requirements.
- **Status**: Success
- **Evidence**: TSC passes, T6.3 verified via script, stochastic/education generators updated with startYear logic.

## Autopilot Cycle 2: Healer Convergence & Generator Compliance
- **Objective**: Resolve 15 staffing and 145 requirement violations in `scheduler.test.ts`.
- **Strategy**:
    1. Debug `HealerConstraintGenerator` annealing parameters (W_STAFFING, W_REQUIREMENT).
    2. Investigate why PGY1 Electives (CARDS) are underscheduled in `EducationFirstGenerator`.
    3. Ensure `healSchedule` in `services/healer.ts` correctly integrates the new solver with multi-year context.
- **Status**: In-Progress

