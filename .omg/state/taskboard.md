# Unified Multi-Year Scheduling Taskboard

This taskboard outlines the implementation of the Unified Multi-Year Scheduling Overhaul as defined in `scratch/unified-scheduling-plan.md`.

## Phase 1: Locked-Cell Infrastructure Support
*Goal: Ensure all generators respect pre-existing and manual assignments.*

- [x] **Task 1.1**: Update `utils.ts`: `canFitBlock` and `placeBlock` must check `cell.locked`.
- [x] **Task 1.2**: Decouple `TOTAL_WEEKS` in `utils.ts`; derive length from `row.length` or pass as parameter.
- [x] **Task 1.3**: Update Generators: `weekByWeek.ts`, `staffingFirst.ts`, `stochastic.ts`, `educationFirst.ts` must check `locked` before clinic initialization.
- [x] **Task 1.4**: Dynamic Week Count: Replace all hardcoded `TOTAL_WEEKS` usage in generators with dynamic length checks.
- [x] **Task 1.5**: **Verification Gate**: `npx tsc --noEmit` + Unit tests for `locked` cell preservation.

## Phase 2: Unified Multi-Year Grid Architecture
*Goal: Refactor pipeline to handle 156-week residency spans as a single unit.*

- [x] **Task 2.1**: Update `types.ts`: Update `ScheduleGenerator` interface and add `activeWeekStart/End` to `Resident`.
- [x] **Task 2.2**: Refactor `scheduler.ts`: Replace year-by-year loop with unified grid orchestration.
- [x] **Task 2.3**: Implement Helpers in `scheduler.ts`: `buildUnifiedGrid`, `buildUnifiedResidents`, `prependContinuityPrefix`, `computePriorRequirementCounts`, `sliceIntoYears`.
- [x] **Task 2.4**: Scoring Update: Update `calculateScheduleScore` and `getWeeklyViolations` for dynamic grid lengths.
- [ ] **Task 2.5**: Cleanup: Remove `ExactConstraintGenerator` from the generation pipeline.
- [x] **Task 2.6**: Constants: Add `WEEKS_PER_YEAR = 52` to `constants.ts`. (Verified in scheduler.ts)
- [x] **Task 2.7**: **Verification Gate**: `npx tsc --noEmit` + Test unified grid slicing/merging integrity.

## Phase 3: Per-Year vs. Whole-Program Requirement Refactoring
*Goal: Fix cumulative counting bugs by enforcing per-year minimums during generation.*

- [x] **Task 3.1**: Update `utils.ts`: Replace `getCumulativeRequirementCount` with `getYearRequirementCount` and `getPriorRequirementCount`. (Co-exists currently)
- [x] **Task 3.2**: Deficit-Aware Priority: Update generators to sort residents based on `priorRequirementCounts`.
- [x] **Task 3.3**: Violation Logic: Update `getRequirementViolations` in `scheduler.ts` to check per-year targets.
- [x] **Task 3.4**: **Verification Gate**: `npx tsc --noEmit` + Test per-year vs. cumulative count separation.

## Phase 4: Phase 2 Healer Service Implementation (COMPLETE)
*Goal: Post-generation hill-climbing optimization to resolve remaining violations.*

- [x] **Task 4.1**: Create `services/healer.ts`: Implement base hill-climbing algorithm.
- [x] **Task 4.2**: Swap Logic: Implement Cross-Resident (structure-preserving) and Intra-Resident swaps.
- [x] **Task 4.3**: Hard Constraints: Ensure the healer never introduces staffing violations. (Graduation aware)
- [x] **Task 4.4**: Locked Preservation: Ensure healer respects all `locked` cells.
- [x] **Task 4.5**: **Verification Gate**: `npx tsc --noEmit` + Convergence tests.

## Phase 5: UI Integration (PARTIAL)
*Goal: Expose healer status and manual healing capability to the user.*

- [x] **Task 5.1**: `GenerationDashboard`: Add Phase 2 (Healer) progress tracking. (Needs Fix: Progress reset glitch)
- [x] **Task 5.2**: `ScheduleTable`: Add "Heal Schedule" button for manual violation resolution.
- [x] **Task 5.3**: `GlobalOptimizer`: Wire Healer to run automatically. (Off-thread implementation in worker)
- [x] **Task 5.4**: **Verification Gate**: `npx tsc --noEmit` + End-to-end generation smoke test.

## Critical Files for Implementation
1. `services/generators/utils.ts`
2. `services/scheduler.ts`
3. `services/healer.ts`
4. `types.ts`
5. `services/generators/stochastic.ts` (Primary generator for validation)

## Mandatory Constraints
- **Staffing Ratios**: `minInterns`, `minSeniors`, etc., must NEVER be changed by any generator or the healer.
- **Clinic Cycle**: The 4+1 structure (clinic every 5th week) must be preserved and aligned to an absolute grid index.
- **Locked Cells**: Cells with `locked: true` are immutable to the engine.