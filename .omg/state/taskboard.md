# Taskboard

| Task ID | Priority | Status | Owner | Dependency | Worktree | Baseline | Lane Health | Summary | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1.1 | p1 | verified | omg-executor | - | root | feat/unified-scheduling | dirty | [Infrastructure] Update `utils.ts` for `locked` & dynamic lengths | TSC passed |
| T2.1 | p0 | ready | omg-executor | T1.1 | root | feat/unified-scheduling | dirty | [Architecture] Refactor `scheduler.ts` for Unified 156-week Grid | Partial implementation exists |
| T2.3 | p0 | ready | omg-executor | - | root | feat/unified-scheduling | dirty | [Fix] Remove "Annealed Solver" Ghost UI entries in App.tsx | Fixes dashboard crash |
| T4.2 | p1 | ready | omg-executor | T3.1 | root | feat/unified-scheduling | dirty | [Service] Replace Healer stub with 4-block/2-block Hill Climbing | Align with design spec |
| T5.2 | p0 | ready | omg-executor | - | root | feat/unified-scheduling | dirty | [Fix] Correct `healSchedule` parameter mismatch in App.tsx | Fixes rejected swaps |
| T2.2 | p0 | verified | omg-executor | T2.1 | root | feat/unified-scheduling | dirty | [Logic] Implement Graduation-Aware Placement in generators | TSC passed, segmenting logic applied |
| T3.1 | p1 | todo | omg-executor | T2.2 | root | feat/unified-scheduling | dirty | [Refactor] Update `getYearRequirementCount` & Deficit Logic | pending T2.2 |
| T4.1 | p1 | ready | omg-executor | T3.1 | root | feat/unified-scheduling | dirty | [Service] Finalize Staffing-Safe Healer Logic | implementation exists in healer.ts? |
| T5.1 | p2 | in-progress | omg-executor | T4.1 | root | feat/unified-scheduling | dirty | [UI] Wire Healer status and handle `unifiedResidents` | App.tsx/Dashboard updated |

## Board Summary
The project is recovering from a "graduation-blind" architectural failure. Phase 1 is stable. Phase 2 (Unified Grid) and Phase 3 (Counting) are partially implemented but need refactoring to handle PGY-specific segments. Phase 5 (UI) is surprisingly far ahead, with progress bars and resident-level handling already integrated.

## Priority Queue
1. **T2.3**: Remove Ghost UI Entries (**P0**)
2. **T5.2**: Correct `healSchedule` params (**P0**)
3. **T2.1**: Finalize `scheduler.ts` Refactor (**P0**)
4. **T4.2**: Replace Healer stub (**P1**)

## Ready Tasks
- **T2.3**: Remove Ghost UI Entries
- **T5.2**: Correct `healSchedule` params
- **T2.1**: Refactor `scheduler.ts` for Unified 156-week Grid

## Next Command
`/omg:executor --task=T2.3 --intent="Remove Annealed Solver ghost entries to fix UI crash"`
