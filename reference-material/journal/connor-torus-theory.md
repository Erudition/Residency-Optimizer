# Toroidal Schedule Theory

**Author:** Connor (Erudition)
**Date:** 2026-05-29

## Motivation

The existing schedule generators (StaffingFirst, EducationFirst, Stochastic, and the so-called "CSP") all operate by constructing a concrete 67×156 grid and then evaluating or tweaking it. None of them can:

- Prove that a better schedule exists (or doesn't)
- Identify *which* constraint is the actual bottleneck
- Guarantee deterministic, optimal output in a single run
- Distinguish isomorphic schedules (ones that differ only by swapping interchangeable residents or equivalent rotations)

The following theory proposes a fundamentally different approach: exploit the **cyclic symmetry** inherent in the X+Y clinic model to reduce the problem to a small, tractable, algebraically structured optimization on a toroidal surface.

---

## The Core Observation

### X+Y creates a torus

In a 4+1 model with 5 cohorts, the clinic schedule repeats every Z=5 weeks:

| Absolute week | Cohort on clinic | Available cohorts |
|---|---|---|
| w ≡ 0 (mod 5) | Cohort 0 | 1, 2, 3, 4 |
| w ≡ 1 (mod 5) | Cohort 1 | 0, 2, 3, 4 |
| w ≡ 2 (mod 5) | Cohort 2 | 0, 1, 3, 4 |
| w ≡ 3 (mod 5) | Cohort 3 | 0, 1, 2, 4 |
| w ≡ 4 (mod 5) | Cohort 4 | 0, 1, 2, 3 |

Re-index each resident's schedule by **relative week within their cycle** rather than absolute week:
- Relative week 0 = clinic (fixed, not a decision variable)
- Relative weeks 1–4 = flex weeks (the actual decisions)

The staffing constraint ("at absolute week w, enough residents must be on rotation X") now becomes a **diagonal constraint** across the (cohort × relative_week) grid. Each absolute week's staffing pool is a diagonal slice through this 2D plane.

Since the cohort dimension wraps (cohort 5 = cohort 0) and the cycle repeats every Z weeks, this structure is a **torus**:

- **Dimension 1:** Cohort index (wraps mod cohortCount)
- **Dimension 2:** Phase within cycle (wraps mod Z)
- **Staffing constraints:** Diagonal lines on the torus

### Vertical → diagonal transformation

In absolute-week coordinates, staffing is a "vertical" dependency: all residents in the same absolute week must collectively satisfy staffing minimums/maximums. This creates an awkward, interlocking constraint structure.

In (cohort, relative_week) coordinates, this becomes a diagonal dependency: each absolute week maps to one cell from each cohort, but at different relative positions. The grid itself is now rectangular and regular, with no holes or jagged edges — the clinic weeks are factored out into a uniform position (relative week 0) for all cohorts.

---

## Symmetry Reductions

### Cohort symmetry

If two cohorts have identical structural properties (same resident count, same PGY-level distribution), then any valid assignment template for one can be cyclically shifted to produce a valid assignment for the other. These schedules are **isomorphic** — they produce the same staffing profile and the same aggregate educational outcomes, just assigned to different humans.

A canonical representation should collapse all such cyclic permutations into a single equivalence class.

### Intra-cohort resident symmetry

Within a cohort, residents who share the same PGY level **and** the same unmet educational requirements are interchangeable. Swapping their flex-week assignments produces an isomorphic schedule. The symmetry group here is the permutation group on each equivalence class of residents.

### Rotation equivalence classes

Many rotations share the same operational profile:
- Same staffing requirements (minInterns, maxInterns, minSeniors, maxSeniors)
- Same intensity characteristics

For the purposes of the **template-solving** phase, these rotations are interchangeable. Instead of 30+ distinct rotation codenames, the solver works with a much smaller set of **equivalence classes** — perhaps 5–8.

The specific rotation name (W-MET vs W-BLUE vs W-RED) is assigned in a later phase, based on educational tag requirements. During template solving, they are all just "Wards-type."

### Intensity as a boolean

The full intensity rating system has 5 levels, but for the purpose of streak prevention (no consecutive high-intensity blocks), the solver only needs a **binary classification**: high enough to continue a streak, or low enough to break one. This further reduces the equivalence class count.

---

## Seamless Year Boundaries

### Conditions for torus wrapping across the 52-week seam

Under the following (common) conditions, the torus wraps seamlessly across academic year boundaries:

1. **Same X+Y configuration** — the cycle length and clinic weeks per cycle are unchanged
2. **Same total resident count** — the incoming PGY-1 class exactly replaces the graduating PGY-3 class
3. **Same cohort structure** — either all cohorts have the same size, or the same proportion of rounded-down to rounded-up cohorts
4. **Same PGY distribution within cohorts** — preserved by the replacement assumption

When these hold, a contiguous 4-week block (e.g., Wards Red) can straddle weeks 51–52 and 1–2 of the next year. The specific humans filling the "PGY-1 intern" and "PGY-2 senior" slots may change at the seam, but the **staffing constraint is still satisfied** — the slot shape is preserved even though the occupants swap.

The year-boundary truncated blocks (weeks before the first clinic of the new year) — already an accepted exception in the scheduling spec — are the only structural artifact. The torus itself is still valid for staffing purposes.

### When the assumptions break

- Residents transferring out or taking extended leave → cohort sizes become unequal → mild asymmetry, handleable as edge cases
- X+Y configuration changes between years → different cycle lengths → separate tori per year with coupling constraints at the boundary

---

## Hierarchical Solver Architecture

### Phase 1: Define equivalence classes

Group rotations by their operational profile:
- Staffing requirements (min/max interns, min/max seniors)
- Intensity (binary: streak-continuing or streak-breaking)

Result: ~5–8 abstract "slot types" instead of 30+ concrete rotations.

### Phase 2: Solve the staffing template on the torus

The decision problem: for each (cohort_class, relative_week, PGY_level), assign a slot type.

Constraints:
- **Staffing diagonals:** Each diagonal (absolute week) must satisfy min/max staffing for each slot type
- **Block contiguity:** Assignments should form contiguous blocks of the preferred duration (4 weeks, relaxable to 2)
- **Jeopardy pool:** At least one PGY-3 must be on a flexible/low-intensity slot type each week — this falls naturally out of the diagonal constraints on the torus, making jeopardy a **first-class citizen** rather than a post-hoc check
- **Intensity sequencing:** In a 2-cycle window, a high-intensity block must be followed by a low-intensity one (structurally prevents intensity streaks)

This is a small, well-structured combinatorial problem. The solver can:
- **Enumerate all valid templates** (or prove none exist)
- **Rank them** by secondary objectives (staffing margin, balance, diversity)
- **Identify the binding constraint** when infeasible — the exact bottleneck

### Phase 3: Compute the feasibility margin ("per-cycle slush fund")

Solve for both the **maximum-staffing** and **minimum-staffing** valid templates. The difference is the per-cycle budget for educational customization.

Additional margin considerations:
- Account for **maximum vacation usage** — if every resident takes their full vacation allowance, how much staffing slack remains?
- Account for **expected leave** — parental, medical, etc.
- Result: a conservative per-cycle deviation budget that holds even in worst-case absence scenarios

### Phase 4: Layer educational assignments

Within the template's equivalence classes, assign **specific rotations** to satisfy individual educational requirements.

Example: the template says "slot type = Wards-type" for a given cell. The educational layer decides whether that becomes W-MET, W-BLUE, or W-RED based on which specific tag the resident still needs.

Residents with **deficits from prior years** (a minority) are handled by "absenteeism" from the max-staffing template — they deviate from the default assignment to fulfill their specific need, spending from the per-cycle slush fund. As long as the deviation doesn't drop staffing below the minimum, it's valid.

### Phase 5: Assign specific residents to template slots

Map abstract "PGY-1 in cohort A, relative week 3" slots to actual humans. Break remaining symmetries by:
- Fairness (equal distribution of high-intensity rotations)
- Coworking Diversity (avoid same-resident-pair assignments)
- Preference satisfaction (if applicable)
- Rotation diversity (avoid same rotation appearing for the same resident multiple times)
- Educational Requirements that are also core rotations (where others within the equivalence class aren't)


---

## Why This Is Better

| Property | Current generators | Toroidal solver |
|---|---|---|
| Explores solution space | Greedy — finds first/random fit | Exhaustive within template space |
| Isomorphic schedules | Treated as distinct | Collapsed by symmetry |
| Identifies bottlenecks | Cannot | Yes — reports binding constraint |
| Deterministic | Only because heuristics are fixed | Provably — single canonical output |
| Jeopardy pool | Post-hoc violation count | First-class diagonal constraint |
| Run count needed | Multiple + healer | One |
| Search space size | ~67 × 156 × 30 ≈ 300k variables | ~8 classes × 4 phases × 3 PGY ≈ 96 variables per template |

---

## Open Questions

1. **Formal algebraic structure.** The diagonal constraints on a torus are related to Latin squares and balanced incomplete block designs. Are there known constructions that could generate valid templates directly (without search)?

2. **Multi-year coupling.** When the torus wraps across year boundaries, educational requirements that span multiple years create coupling between cycles. How should the solver handle cumulative graduation minimums vs per-year ideals?

3. **Non-uniform cohorts.** ✅ **Resolved.** Management guarantees cohorts are as balanced as possible, so sizes differ by at most 1: ⌊n/Z⌋ ("small") and ⌈n/Z⌉ ("large"). The torus has at most two cohort types. Any cyclic rotation of the small/large pattern (e.g., [S,S,S,L,L] → [L,S,S,S,L]) produces an isomorphic staffing profile, because diagonal constraints rotate with it. Fix one canonical arrangement (e.g., large cohorts first), solve the template once, and all rotations are covered. The full toroidal structure survives.

4. **Practical template size.** With ~8 equivalence classes, 4 flex phases, 3 PGY levels, and 5 cohort classes, the template has ~480 cells. Is this small enough for complete enumeration, or does it still need heuristic guidance?

5. **Vacation and leave modeling.** Can vacation/leave be modeled as a special "absence" slot type within the equivalence class framework, or does it need separate treatment?

6. **Implementation path.** Should this be built as a standalone solver (e.g., using an ILP library like HiGHS/GLPK) or as a custom search with the toroidal structure baked into the constraint propagation?
