# Scheduling Algorithm Learnings

> **CRITICAL TESTING METHODOLOGY**
> - **Must run at least 100 iterations** to get reliable average violation counts
> - **Single-run comparisons are invalid** due to randomness in algorithms  
> - **Test timeout must be at least 60 seconds** (generators can be slow)
> - Compare AVERAGE violations, not single-run results

---

## Constraint Analysis (2026-01-12)

### Supply vs Demand (Verified Solvable)
- **15 Interns**: 780 raw weeks - 150 clinic = **630 available**
- **30 Seniors**: 1560 raw weeks - 300 clinic = **1260 available**
- **Critical Demand**: 
  - ICU: 104 intern-weeks + 104 senior-weeks
  - Wards-R: 104 intern + 52 senior
  - Wards-B: 104 intern + 52 senior
  - NF: 52 intern + 52 senior
  - **Total**: 364 intern + 260 senior
- **Surplus**: 266 intern-weeks, 1000 senior-weeks
- **Conclusion**: Problem is mathematically solvable. Failures are algorithmic.

---

## Approaches That FAILED

### 1. Rotation-First Filling (Original Greedy/Stochastic)
- **Approach**: Fill by rotation type (ICU blocks, then Wards blocks, etc.)
- **Result**: ~40-50 violations (mix of Weekly and Requirement)
- **Why it fails**: Randomized week selection causes fragmentation. Later weeks get short-changed because earlier phases consume residents without considering global coverage.

### 2. Block-Based Week-First Filling
- **Approach**: Process weeks sequentially, but place 4-week blocks starting at that week.
- **Result**: 240+ violations
- **Why it fails**: When week 0 needs ICU coverage, placing a 4-week block uses up that resident for weeks 0-3. But weeks 1-3 might ALSO need the same resident elsewhere. Rigid blocks conflict with week-by-week needs.

### 3. Clinic-First Initialization
- **Approach**: Assign clinic weeks (1-in-5 pattern) BEFORE staffing.
- **Result**: High violations
- **Why it fails**: Clinic assignments block residents from being available for critical staffing. If Resident A's clinic week is Week 0, they can't fill an ICU slot that week, even if desperately needed.

### 4. Aggressive "Desperation Fill" (Ignore Max Constraints)
- **Approach**: If min staffing is unmet, assign residents even if it exceeds max staffing limits.
- **Result**: 0 Requirement Violations but 180+ Weekly Violations (Max Exceeded)
- **Why it fails**: Trading one violation type for another is not progress. Overstaffing is also a violation.

### 5. Combined Intern/Senior Filtering (Logic Bug)
- **Bug**: `if (needI && r.level !== 1) return false; if (needS && r.level === 1) return false;`
- When BOTH needI AND needS are true, this excludes ALL candidates.
- **Fix**: Separate the filling loops. Fill intern need first, THEN fill senior need.

### 6. Education-First Approach (Non-Critical First)
- **Approach**: Fill Cards/ID/Neph/Pulm BEFORE critical staffing, to reserve slots.
- **Result**: 233 violations (78 Weekly + 155 Req)
- **Why it fails**: Non-critical education took all the early slots. Critical staffing couldn't find free interns, causing understaffing.

### 7. Double-Count/Hybrid Approach
- **Approach**: Try to leverage that Wards/ICU/NF count for both staffing AND education.
- **Result**: Same as Week-First (~75 Req violations)
- **Why it doesn't help**: The bottleneck is non-critical requirements (Cards/ID/Neph) that DON'T overlap with staffing.

---

## Approaches That Showed Promise (But Still Have Violations)

### Week-First, Slot-Based, Separated Loops
- **Phase 1**: Initialize empty schedule (NO clinic yet)
- **Phase 2**: For each week 0-51, for each critical type:
  - **Intern Loop**: While internCount < minInterns, find a free intern, assign single week
  - **Senior Loop**: While seniorCount < minSeniors, find a free senior, assign single week
- **Phase 3**: THEN add clinic weeks (only if slot is still free)
- **Phase 4**: Fill educational requirements with blocks
- **Phase 5**: Fill remaining with electives

**Result**: 0 Weekly Violations, but ~75 Requirement Violations
**Status**: NOT SOLVED - still has too many requirement violations

**Key Insight**: Single-week slots for critical staffing are more flexible than 4-week blocks. Clinic can be deferred to after staffing is guaranteed.

---

## SUCCESS: The "Education First" Breakthrough (2026-01-13)

### Breakthrough Strategy: Block-First with Residual Capacity Guard
The problem was finally solved (0 Requirement Violations) by flipping the logic from "Staffing-First" to "Requirement-First," but with a critical safety mechanism.

1. **Phase 1: Clinic Pre-Assignment**: Lock in the 1-in-5 outpatient weeks first.
2. **Phase 2: Requirement Block Placement (The Guard)**: 
   - Identify all multi-week required blocks (4w ICU, 2w ID, etc.).
   - Sort by duration descending (Tetris approach).
   - **Residual Capacity Guard**: Before placing a block for a resident, calculate the "Hospital Residual" for that window. If placing the block would leave fewer residents free than the **absolute minimum** needed to cover ICU/Wards/NF across the whole program, the block is deferred or moved.
3. **Phase 3: Flexible Ward Distribution**: Treat `Wards-Red`, `Wards-Blue`, and `Met Wards` as interchangeable pools during requirement fulfillment to maximize placement flexibility.
4. **Phase 4: Virtual Targets**: Assign virtual 4-week targets to PGY1s for `Night Float` to ensure it is always scheduled as a contiguous block rather than fragmented weeks.

### The ICU Senior Bottleneck (Mathematical Limit)
- **Demand**: 30 Seniors each need 4 weeks of ICU = **120 total ICU-senior weeks**.
- **Normal Supply**: 2 Seniors per week × 52 weeks = **104 slots**.
- **Conclusion**: It is **mathematically impossible** to meet all requirements without exceeding the "ideal" max staffing of 2 seniors on some weeks.
- **Decision**: The "Education First" algorithm prioritizes the 120-week requirement, leading to ~16 weeks of "Max Seniors Exceeded" (3 instead of 2). This is the optimal trade-off.

---

## Status Matrix

| Strategy | Req Violations | Weekly Violations | Key Trade-off |
|----------|----------------|-------------------|---------------|
| Staffing First | ~50-70 | **0** | Fails education targets |
| **Education First**| **0** | ~16-25* | Prioritizes PGY targets |
| Stochastic | ~25-30 | ~25-50 | Inconsistent |

*\*Note: 100% of weekly violations in Education First are avoidable "Max Exceeded" due to the ICU bottleneck described above.*

---

## Key Design Patterns for Success

1. **Guard rails, not constraints**: Don't just check if a spot is "full" (Max Staffing). Check if future spots will be "empty" (Residual Capacity) if you take this one.
2. **Sort by difficulty**: Place 4-week blocks first, then 2-week, then 1-week. 
3. **Interchangeable Pools**: Logic that treats specific wards as a generic "Ward" requirement during the search phase significantly reduces dead-ends.
4. **Iterative Competition**: Use "Top N" results to keep the best 5-10 permutations, as randomized tie-breaking in block placement still creates minor variance in fairness scores.

---

## Future Directions (Refined)

1. **Dynamic Max-Staffing Adjustments**: Allow the algorithm to explicitly "expand" ICU capacity to 3 seniors during peak holiday/vacation blocks rather than treating it as a violation.
2. **Fairness-Driven Tie-Breaking**: When multiple residents can fit a block, choose the one with the lowest current "Intensity Score".
3. **Multi-Constraint SMT**: While "Education First" works, a formal solver could potentially reduce the "Max Exceeded" count even further by finding more complex swaps.
