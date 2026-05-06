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
| T6.1 | p2 | verified | omg-executor | - | root | feat/unified-scheduling | clean | [Terminology] Rename `target` to `minWeeks` in `constants.ts` & generators | Property mapping updated |
| T6.2 | p1 | verified | omg-executor | - | root | feat/unified-scheduling | clean | [Logic] Implement Jeopardy Pool monitoring in `getWeeklyViolations` | TSC passed |
| T6.3 | p1 | verified | omg-executor | - | root | feat/unified-scheduling | clean | [Logic] Enforce PGY-specific clinic sites (NIMA vs CCIM) | verified via scripts/verify_t63.ts |
| T6.4 | p2 | verified | omg-executor | - | root | feat/unified-scheduling | clean | [Validation] Implement PTO Policy Validator (blackouts, prohibited rotations) | blackouts & core-block checks added |
| T6.5 | p2 | verified | omg-executor | - | root | feat/unified-scheduling | clean | [Logic] Implement Deficit Recovery (Subspecialty Deficit Flag) | Healer auto-recovery implemented |
| T6.6 | p2 | verified | omg-executor | - | root | feat/unified-scheduling | clean | [Logic] Verify Vacation constraint (Human-only) in all generators | Solver excludes VACATION |
| T6.7 | p2 | verified | omg-executor | - | root | feat/unified-scheduling | clean | [UI] Resident Manager: Expose `startYear` in CSV template/import | startYear in template & import |
| T6.8 | p3 | verified | omg-executor | - | root | feat/unified-scheduling | clean | [Spec] Cleanup `target` terminology in `specification/` and docs | Updated specification files & GEMINI.md |

## Board Summary
Phases 1-5 verified. Phase 6 covers specification conformance gaps (Jeopardy, PTO, Deficit Recovery, Terminology) and UI/UX alignment with the "Start Year" primary source of truth. Phase 6 is now complete and verified.

## Priority Queue
1. **Project Review**: Conduct a final review of the integrated features. (**P3**)

## Ready Tasks
- None (All tasks verified)

## Next Command
`Handover to user for final approval`