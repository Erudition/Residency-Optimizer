# Taskboard

| Task ID | Priority | Status | Owner | Dependency | Worktree | Baseline | Lane Health | Summary | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1.1 | p1 | verified | omg-executor | - | root | feat/unified-scheduling | clean | [Infrastructure] Update `utils.ts` for `locked` & dynamic lengths | TSC passed |
| T2.1 | p0 | verified | omg-executor | T1.1 | root | feat/unified-scheduling | clean | [Architecture] Refactor `scheduler.ts` for Unified 156-week Grid | Vitest passed (3-year stability) |
| T2.3 | p0 | verified | omg-executor | - | root | feat/unified-scheduling | clean | [Fix] Remove "Annealed Solver" Ghost UI entries in App.tsx | Grep confirmed removal |
| T4.2 | p1 | verified | omg-executor | T3.1 | root | feat/unified-scheduling | clean | [Service] Replace Healer stub with 4-block/2-block Hill Climbing | Implementation in healer.ts |
| T5.2 | p0 | verified | omg-executor | - | root | feat/unified-scheduling | clean | [Fix] Correct `healSchedule` parameter mismatch in App.tsx | Parameters match signature |
| T2.2 | p0 | verified | omg-executor | T2.1 | root | feat/unified-scheduling | clean | [Logic] Implement Graduation-Aware Placement in generators | TSC passed, segmenting logic applied |
| T3.1 | p1 | verified | omg-executor | T2.2 | root | feat/unified-scheduling | clean | [Refactor] Update `getYearRequirementCount` & Deficit Logic | stochastic.ts uses getYearRequirementCount |
| T4.1 | p1 | verified | omg-executor | T3.1 | root | feat/unified-scheduling | clean | [Service] Finalize Staffing-Safe Healer Logic | Staffing safety check in healer.ts |
| T5.1 | p2 | verified | omg-executor | T4.1 | root | feat/unified-scheduling | clean | [UI] Wire Healer status and handle `unifiedResidents` | Healer Progress wired in App/Dashboard |
| T6.1 | p2 | ready | omg-executor | - | root | feat/unified-scheduling | clean | [Terminology] Rename `target` to `minWeeks` in `constants.ts` & generators | - |
| T6.2 | p1 | verified | omg-executor | - | root | feat/unified-scheduling | clean | [Logic] Implement Jeopardy Pool monitoring in `getWeeklyViolations` | TSC passed |
| T6.3 | p1 | ready | omg-executor | - | root | feat/unified-scheduling | clean | [Logic] Enforce PGY-specific clinic sites (NIMA vs CCIM) | - |
| T6.4 | p2 | ready | omg-executor | - | root | feat/unified-scheduling | clean | [Validation] Implement PTO Policy Validator (blackouts, prohibited rotations) | - |
| T6.5 | p2 | ready | omg-executor | - | root | feat/unified-scheduling | clean | [Logic] Implement Deficit Recovery (Subspecialty Deficit Flag) | - |
| T6.6 | p2 | ready | omg-executor | - | root | feat/unified-scheduling | clean | [Logic] Verify Vacation constraint (Human-only) in all generators | - |
| T6.7 | p2 | ready | omg-executor | - | root | feat/unified-scheduling | clean | [UI] Resident Manager: Expose `startYear` in CSV template/import | - |
| T6.8 | p3 | ready | omg-executor | - | root | feat/unified-scheduling | clean | [Spec] Cleanup `target` terminology in `specification/` and docs | - |

## Board Summary
Phases 1-5 verified. Phase 6 covers specification conformance gaps (Jeopardy, PTO, Deficit Recovery, Terminology) and UI/UX alignment with the "Start Year" primary source of truth. Task T6.2 (Jeopardy monitoring) is now complete and verified.

## Priority Queue
1. **T6.3**: PGY-specific Clinics (**P1**)
2. **T6.7**: Resident Manager `startYear` UX (**P2**)
3. **T6.1**: Terminology Refactor (**P2**)
4. **T6.4**: PTO Policy Validator (**P2**)

## Ready Tasks
- T6.1, T6.3, T6.4, T6.5, T6.6, T6.7, T6.8

## Next Command
`/omg:executor --task=T6.3 --intent="Enforce PGY-specific clinic sites (NIMA vs CCIM)"`