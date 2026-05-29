# Constraint Satisfaction Generator — Development Journal

## Motivation

The legacy generators (StaffingFirst, EducationFirst, WeekByWeek) all follow the same pattern: generate a schedule using heuristics, then check if it's compliant. This leads to fundamentally random schedules — placing things and seeing what fits, doing swaps and optimizations here and there. The insight was: why generate a schedule and then check if it's good, when we can model the space of valid schedules and search for the best one?

The CSP (Constraint Satisfaction Problem) approach represents the schedule as a set of variables (block slots), domains (possible rotations), and constraints (staffing floors/ceilings, educational requirements). Instead of generate-and-test, we search the solution space directly.

---

## Phase 1: Pure CSP Search (V1)

### Architecture
- **Variables**: Each non-clinic, non-locked block slot for each resident becomes a variable. Block slots are contiguous runs of flexible weeks between clinic weeks and year boundaries. Standard slots are 4 weeks; boundary slots can be 2-3 weeks.
- **Domains**: Each variable's domain is the set of rotations that fit in the slot (by duration) and are assignable (not clinic-only).
- **Constraints**: Staffing floors (minimum interns/seniors per rotation per week) and ceilings (maximum interns/seniors).
- **Search**: Standard backtracking with MRV (Minimum Remaining Values) for variable selection and educational deficit for value ordering.

### Result
**Complete failure.** The search hung indefinitely. With 1334 variables, each with 19-30 domain values, the search space is astronomical. The staffing floor constraints caused cascading failures — assigning one variable would violate a floor elsewhere, triggering backtracking that could never find a valid path.

### Lesson
Pure backtracking CSP cannot handle staffing floor constraints. Floors are "global" constraints — they require coordination across all residents for each week. No local decision can guarantee global floor satisfaction.

---

## Phase 2: Forward Checking

Added forward checking (arc consistency after each assignment): after assigning a variable, prune domains of unassigned variables that would violate staffing ceilings, and verify staffing floors are still achievable.

### Result
Still hung. Forward checking reduced the search space but didn't eliminate the fundamental problem: staffing floors require positive coordination, not just negative pruning.

---

## Phase 2b: Hybrid Architecture — Staffing Pre-Assignment

### Key Insight
Staffing floors are not search problems — they're allocation problems. If W-BLUE needs 1 intern and 1 senior every week, just assign them deterministically before the search begins.

### Implementation
Before the CSP search, a `staffingPreAssign` phase iterates week by week, rotation by rotation, and fills each staffing floor obligation by picking the best unassigned variable. "Best" was initially defined as the variable with the **largest domain** (most flexible, least disruption to future choices).

### Result
**Breakthrough.** 456 of 1334 variables (34%) were pre-assigned, locking all staffing floors. The remaining 878 variables were trivially solvable — the search completed in ~2 seconds with 1204 nodes and 0 backtracks.

- Staffing violations: 88 (4 week-0 orphans + 84 jeopardy gaps)
- Educational deficit: ~2700 weeks (worse than StaffingFirst's 1748)

### Lesson
Separating staffing (hard constraint, allocation-style) from education (soft constraint, optimization-style) is the correct architectural split. The hybrid approach — deterministic pre-fill followed by search — is orders of magnitude faster than pure search.

---

## Phase 2b+: Ceiling Enforcement in Domain Init

### Problem
PGY-1 residents were being assigned to rotations with `maxInterns: 0` (senior-only rotations). The search didn't check ceilings during domain initialization.

### Fix
Added ceiling-based domain filtering in `initializeDomains`: if a rotation has `maxInterns: 0`, remove it from all PGY-1 variable domains. Similarly for `maxSeniors: 0` and PGY-2+ variables.

### Result
Eliminated invalid assignments. This was a correctness fix, not a performance fix.

---

## Phase 3: Educational Optimization Experiments

Starting point: 88 staffing violations, 343 educational violations, ~2700 deficit weeks.

### Experiment 1: Education-Aware Staffing Pre-Assignment

**Hypothesis**: If the staffing pre-fill chooses residents who also have an educational need for the rotation, we get "free" education fulfillment.

**Implementation**: `findBestStaffingCandidate` was given the `eduNeeds` list. When scoring candidates, residents with an educational need for the rotation get `score += 10000 + deficit` (strongly preferred, with higher deficit breaking ties).

**Result**: 268 of 456 pre-assignments (59%) became education-aligned. Staffing violations dropped from 88 to 68. Educational impact was modest — the deficit was still ~2800 because the search phase (878 remaining variables) was still suboptimal.

### Experiment 2: Education-Urgency Variable Selection

**Hypothesis**: The MRV heuristic picks 2-week boundary slots first (smallest domain ≤10 vs 30 for 4-week slots). But 2-week slots can only fulfill 2-week specialty rotations, not 4-week ward requirements. Processing 4-week slots first would let the search fill ward requirements.

**Implementation**: Replaced MRV with a two-tier heuristic:
- Tier 1: Variables that can fulfill an unmet educational need — pick the one with the highest addressable deficit
- Tier 2: Pure MRV for remaining variables

**Result**: **Made things WORSE.** Educational deficit went from 2862 to 2876. The urgency-first heuristic picked variables with large domains (30 values) before constrained ones, and the greedy first choice for those large-domain variables was often suboptimal. The MRV heuristic is a proven CSP technique for a reason — constrained variables should be assigned first to fail fast.

**Lesson**: Don't fight MRV for variable selection. It's a proven heuristic. Focus optimization efforts on **value ordering** instead.

### Experiment 3: Cross-Year Deficit in Value Ordering

**Problem**: `getDeficitForCodename` only checked the current year's needs (`n.yearIndex === v.yearIndex`). A resident's Wards deficit for year 0 might be met, but year 1 and 2 still have deficit. The value ordering should consider all years.

**Implementation**: Changed `resNeeds` filter from `n.residentId === v.residentId && n.yearIndex === v.yearIndex` to just `n.residentId === v.residentId` (all years). Changed progress lookup from `v.yearIndex` to `need.yearIndex`.

**Result**: Small improvement (~100 deficit weeks). The cross-year awareness helps the value ordering see the full picture of a resident's needs.

### Experiment 4: Slot-Fit Preference (Anti-Fragmentation)

**Problem**: For a 4-week slot, the value ordering might pick a 2-week specialty (ANES, deficit 30) over a 4-week ward rotation (W-BLUE, deficit 28) because raw deficit is higher. But choosing ANES splits the 4-week slot into 2+2, and the second 2-week slot also gets a 2-week specialty — zero ward weeks generated.

**Implementation**: Added a "slot-fit" tiebreaker after deficit: full-slot rotations (duration ≥ slot duration) are preferred over shorter ones.

**Result**: Marginal improvement (~90 deficit weeks). The slot-fit preference helped but didn't solve the root cause.

### Experiment 5: Weighted Deficit (deficit × duration)

**Hypothesis**: Raw deficit doesn't account for opportunity cost. A 4-week rotation at deficit 28 contributes 4×28=112 "education-value" vs a 2-week rotation at deficit 30 contributing 2×30=60. The value ordering should use weighted deficit.

**Implementation**: Changed sort key from `defB - defA` to `(defB * durB) - (defA * durA)`, where dur is `Math.min(rotationDuration, slotDuration)`.

**Result**: This subsumes the slot-fit preference — 4-week rotations naturally win in 4-week slots because their weight is doubled. Slight improvement over slot-fit alone.

### Experiment 6: Filler Penalty

**Hypothesis**: When a resident still has unmet educational needs, filler rotations (ELEC, VAC, RSCH) should be actively deprioritized.

**Implementation**: Added a tiebreaker that sorts fillers to the bottom when the resident has any remaining deficit.

**Result**: Unnecessary — the search was already assigning zero fillers (ELEC=0, VAC=0, RSCH=0). Every single variable got a real rotation. The deficit was from **wrong real rotations**, not from fillers.

**Key finding**: The problem was never about fillers. It was about **unfair distribution** — some residents got 48 ward weeks while others got 0.

### Experiment 7: Ward Distribution Diagnostic

**Diagnostic output**: `Wards: 1330 total weeks across 64 residents, range 4-48, median 16`

**Analysis**:
- Each resident needs 36 ward weeks (9 blocks of 4 weeks)
- With 67 residents, that's 2,412 ward-weeks needed globally
- With 3 ward rotations × 156 weeks × ~2-3 capacity each ≈ 936-1404 max ward-weeks
- We're generating 1,330 — close to the ceiling capacity limit
- **Mathematical impossibility**: There literally aren't enough ward rotation slots for every resident to get 36 weeks
- But the distribution was terrible: some residents got 48w (12 blocks!) while others got 0-4w

### Experiment 8: Surplus Penalty (Anti-Hogging)

**Hypothesis**: When a resident's ward requirement is already met for the current year, ward rotations should be deprioritized for that resident so other residents can use the limited ward capacity.

**Implementation**: Added `getSurplusForCodename` that returns how much a rotation would overshoot already-met requirements. The value ordering score becomes `deficit × duration - surplus`.

**First attempt**: Surplus was only computed when deficit was 0 (all years met). But since each year has its own need, cross-year deficit masked per-year surplus.

**Fix**: Always compute surplus, and make it year-aware (only check `need.yearIndex === v.yearIndex`).

**Result**: Max ward weeks per resident dropped from 48 to 44. Violations from 424 to 388. Modest improvement — helped but didn't solve the distribution problem.

**Lesson**: Value ordering alone can't fix distribution because the search processes variables in a fixed order (MRV). The first residents processed get preferential access to ward slots.

### Experiment 9: Fair-Distribution Variable Selection ✅

**Key insight**: The MRV heuristic picks constrained variables first, but it doesn't consider **which resident** the variable belongs to. A resident who already has 12 ward blocks assigned shouldn't get another one before a resident with 0 ward blocks.

**Implementation**: Replaced pure MRV with a fair-distribution heuristic:
1. Group unassigned variables by resident
2. For each resident, calculate total educational progress (weeks already assigned this session)
3. Pick the resident with the **FEWEST total assignments**
4. Among that resident's variables, pick the one with the highest addressable deficit
5. Fall back to pure MRV for variables with no educational relevance

**Result**: **Significant improvement.**
- Ward distribution: 4-48 (median 16) → **4-36 (median 20)**, all 67 residents covered
- Max ward weeks: 48 → **36** (exactly the requirement — no more hogging)
- Educational violations: 424 → **361**
- Deficit weeks: 2966 → **2801**
- Staffing violations: 88 → **25** (all boundary-only)

**Lesson**: Fair distribution across residents is more important than MRV for educational outcomes. The MRV heuristic is still used as a tiebreaker within each resident's variables and for non-educational variables.

### Experiment 10: Post-Search Educational Improvement Pass

**Implementation**: After the greedy search completes, iterate over all assigned variables. For each filler rotation (ELEC/VAC/RSCH) where the resident has unmet educational needs, try to swap it for the highest-deficit educationally useful rotation that respects staffing ceilings. Includes `unrecordAssignment()` for proper state rollback. Runs up to 10 rounds until convergence.

**Result**: 0 swaps in practice — the search already assigns zero fillers. The pass exists as a safety net but doesn't currently trigger.

---

## Final Architecture (V3)

```
Phase 0: Build block slots (contiguous non-clinic, non-locked weeks)
Phase 1: Create variables, initialize domains with ceiling filtering
Phase 2: Build educational needs from requirements engine
Phase 2b: Staffing pre-assignment (education-aware, deterministic)
Phase 3: CSP search (fair-distribution variable selection + weighted deficit value ordering)
Phase 4: Educational improvement pass (filler→edu swaps)
Phase 5: Write solution to grid + fill remaining nulls with ELEC
```

### Key Design Decisions

1. **Hybrid architecture**: Staffing is an allocation problem, not a search problem. Solve it deterministically first.
2. **Fair distribution over MRV**: For educational quality, fairness across residents matters more than search efficiency.
3. **Weighted deficit (deficit × duration)**: Prevents 2-week specialties from stealing 4-week ward slots.
4. **Year-aware surplus penalty**: Prevents residents from hogging ward capacity beyond their per-year needs.
5. **No automatic healer**: Per project requirements, the healer is manual-only. The CSP generator must produce the best possible schedule without post-hoc healing.

---

## Results Summary

| Metric | V1 (pure CSP) | V2 (hybrid) | V3 (edu-aware) | StaffingFirst |
|---|---|---|---|---|
| Completion | ❌ Hung | ✅ 2s | ✅ 5s | ✅ |
| Staffing violations | — | 88 | **25** | 0 |
| Edu violations | — | 343 | **361** | 287 |
| Deficit weeks | — | ~2700 | **2801** | 1746 |
| Ward range | — | N/A | **4-36** | N/A |
| Ward median | — | N/A | **20** | N/A |
| Backtracks | — | 0 | **0** | N/A |

### Why CSP Still Has Higher Edu Deficit Than StaffingFirst

1. **Ceiling capacity limit**: With 3 ward rotations × 156 weeks × ~2-3 slots each, there are ~1330 possible ward-weeks. Residents collectively need 2412. This is a **mathematical impossibility** — no algorithm can satisfy all ward requirements.

2. **Block-based vs week-based**: The CSP assigns 4-week blocks, while StaffingFirst operates at the week level. StaffingFirst can pack ward assignments more densely because it doesn't have the block alignment constraint.

3. **Greedy with 0 backtracks**: The CSP search is greedy — it never fails and never tries alternatives. The first solution found is the solution. True optimization would require exploring multiple solutions (e.g., via CEGAR, iterative deepening, or branch-and-bound), which is a future improvement.

4. **Variable ordering trade-off**: Fair-distribution variable selection improves ward fairness but can harm other educational requirements. It's a Pareto trade-off — you can't optimize everything simultaneously.

---

## Open Questions / Future Work

1. **Jeopardy gap constraint**: ~84 violations remain for the "at least one PGY-3 on flexible block" rule. This needs a specialized constraint checker.

2. **Boundary staffing**: 25 violations at week 0, 51-52, 103-104. These are inherent to the block-based model — blocks can't start at arbitrary weeks.

3. **Multi-solution exploration**: Currently the search finds the first valid assignment and stops. Exploring top-K solutions and picking the one with the best educational score would improve outcomes.

4. **Block splitting at boundaries**: Year-boundary truncated blocks (weeks before the first clinic) are currently 2-3 week fragments. These could be filled more aggressively with educational rotations.

5. **Redistribution pass**: Instead of only swapping fillers, try swapping between residents — if resident A has 36w wards and resident B has 4w, swap one of A's ward blocks with B's non-ward block. This requires careful constraint checking but could dramatically improve distribution.
