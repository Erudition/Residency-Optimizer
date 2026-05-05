# PRD: Unified Multi-Year Scheduling Overhaul

## Problem Statement
The existing scheduling engine generates schedules in isolation for each academic year. This results in "edge effects" (discontinuities) at year boundaries, front-loaded educational requirements that ignore future needs, and an inability to maintain 4-week block integrity when a rotation crosses July 1st. Additionally, generators often reach "local minima" where staffing is met but educational requirements are not; a post-generation "Healer" phase is required to optimize these schedules without breaking hospital coverage.

## Scope and Non-goals
### Scope
- **Infrastructure**: Implement `locked` cell protection and dynamic grid length support (up to 156 weeks).
- **Architecture**: Refactor `scheduler.ts` to generate multi-year spans as a single unified grid.
- **Logic**: Transition from cumulative residency-wide counting to per-PGY-year requirement enforcement.
- **Optimization**: Implement a Phase 2 "Healer" (Hill-Climbing) service to resolve educational deficits.
- **UI**: Expose healer status and provide manual optimization triggers.

### Non-goals
- **Clinic Logic**: No changes to the 4+1 rotation structure or clinic week assignment logic.
- **Staffing Inputs**: The engine will NOT autonomously change staffing ratios (`minInterns`, etc.).
- **Vacation**: Vacation scheduling remains a human-only manual process.
- **Generator Replacement**: Existing generators (Stochastic, etc.) will be updated but not replaced.

## Acceptance Criteria

### Phase 1: Locked-Cell Infrastructure Support
- **Grid Integrity**: All core utility functions (`canFitBlock`, `placeBlock`) must explicitly check `cell.locked` and abort if true.
- **Preservation**: If a generator is initialized with a grid containing locked cells, those cells must remain identical in value, color, and `locked` status in the output.
- **Dynamic Length**: The engine must support grids of arbitrary length (52, 104, 156 weeks) without hardcoded `52` constants.
- **Verification**: Unit test confirming `locked` cells are immutable even when a generator attempts to overwrite them.

### Phase 2: Unified Multi-Year Grid Architecture
- **Unified Generation**: `scheduler.ts` must generate a single 156-week grid (3 years) in one pass for new residents.
- **Continuity Prefix**: The generator must prepend the last 4 weeks of the previous year (as locked cells) to the current mutable window to ensure block continuity across academic boundaries.
- **Historical Context**: `computePriorRequirementCounts` must correctly tally historical rotations to inform current-year priority.
- **Verification**: Visual/automated check that a 4-week block (e.g., Wards) can span from Week 51 of Year 1 to Week 2 of Year 2.

### Phase 3: Per-Year vs. Whole-Program Requirement Refactoring
- **Granular Counting**: Requirement violations must be calculated per-PGY-year (e.g., "Intern Wards" vs "Senior Wards").
- **Deficit Awareness**: Resident sorting during generation must prioritize those with the highest deficit for the *current* PGY-year's requirements.
- **Verification**: A resident who exceeded Wards requirements in PGY-1 must still be flagged if they fail to meet Wards requirements in PGY-2.

### Phase 4: Phase 2 Healer Service Implementation
- **Staffing Invariance**: The Healer (hill-climbing) must NEVER perform a swap that decreases the `Staffing Score` (hospital coverage).
- **Violation Reduction**: The Healer must measurably reduce the number of `Educational Requirement Violations` over successive iterations.
- **Immutability**: The Healer must respect all `locked` cells and clinic weeks.
- **Verification**: Convergence test: A schedule with 10 educational violations and 0 staffing violations must result in $<10$ educational violations and 0 staffing violations after healing.

### Phase 5: UI Integration
- **Feedback**: The `GenerationDashboard` must display a real-time status/progress indicator for the Healer phase.
- **Control**: A "Heal Schedule" button must be available in the `ScheduleTable` or `GlobalOptimizer` to trigger optimization on demand.
- **Verification**: Manually deleting a required block should be "fixable" by clicking the Heal button, assuming a valid swap exists.

## Constraints and Dependencies
- **Technical**: All changes must pass `npx tsc --noEmit`.
- **Constraint Hierarchy**: **Staffing Coverage > Educational Requirements > Ideal Preferences**. The Healer may never sacrifice Staffing for Education.
- **Locked Cell Semantics**: `locked: true` is the ultimate guardrail; if a schedule is 100% locked, the engine must return it unchanged without error.
- **4+1 Alignment**: Clinic weeks are fixed to `weekIndex % 5` and are implicitly "locked" for the purpose of rotation swaps.

## Non-Negotiable Constraints (Post-Phase Validation)
1. **Grid Integrity**: 156 weeks for a full residency; no orphaned or truncated weeks.
2. **Locked Immunity**: Zero instances of a `locked: true` cell being changed by the engine.
3. **Staffing Floor**: Staffing violations must not increase after any "Heal" or "Generate" operation.

## Handoff Checklist for Executor
- [ ] Update `utils.ts` to handle `locked` and dynamic lengths.
- [ ] Refactor `scheduler.ts` for unified 156-week grid orchestration.
- [ ] Implement `getYearRequirementCount` logic.
- [ ] Create `services/healer.ts` with staffing-safe swap logic.
- [ ] Update UI components to reflect multi-phase generation.
