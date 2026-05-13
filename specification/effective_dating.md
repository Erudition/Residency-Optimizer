# Effective Dating of Requirements

This document specifies how scheduling rules are versioned over time and which version applies in a given context. The design goal is **lazy updateability**: rules persist indefinitely once defined, and only need a new entry when the rule actually changes.

---

## Terminology

- **Matriculation Year**: The academic year a resident entered PGY-1 (stored as `startYear` on the Resident object). This is the anchor point for graduation requirements.
- **Schedule Year**: The academic year of the schedule slice being generated or evaluated (e.g., the 2027 slice of a 2026–2028 multi-year schedule).
- **Effective Year**: The `academicYear` attached to a requirement rule. It means "this rule applies starting in this year and continues until superseded by a newer rule for the same tag."

---

## Three Temporal Scopes

### 1. Graduation Requirements — Frozen at Matriculation

Graduation requirements are cumulative across the full residency (e.g., "complete at least 8 weeks of ICU across 3 years"). The governing rules are those in effect **when the resident matriculated**.

**Resolution**: For a given resident and tag, find the graduation requirement where `effectiveYear <= resident.startYear`, picking the **latest** such entry. If ACGME updates the ICU minimum from 8 to 10 weeks in 2028, residents who matriculated in 2026 are still evaluated against the 8-week standard. Only the class of 2028 and beyond sees the new 10-week rule.

```
gradRule = gradRequirements
  .filter(r => r.tag === tag && r.effectiveYear <= resident.startYear)
  .sort((a, b) => b.effectiveYear - a.effectiveYear)[0]
```

> **Caveat**: While the assumption is that graduation requirements are frozen at matriculation, ACGME may in rare cases retroactively apply new standards to residents already in training. The system assumes matriculation-frozen semantics by default; any exceptions would require manual override.

### 2. Annual/Operational Requirements — Effective for the Schedule Year

Annual requirements are per-year minimums (e.g., "PGY-1s do 4 weeks Night Float this year"). If MHS changes the NF policy from 4 to 3 weeks starting in 2028, then the 2028 slice of *every* resident's schedule uses the new 3-week rule, regardless of when the resident matriculated.

**Resolution**: For a given schedule year and tag, find the annual requirement where `effectiveYear <= scheduleYear`, picking the **latest** such entry.

```
annualRule = annualRequirements
  .filter(r => r.tag === tag && r.effectiveYear <= scheduleYear)
  .sort((a, b) => b.effectiveYear - a.effectiveYear)[0]
```

### 3. Staffing Preferences — Effective for the Schedule Year

Staffing preferences (e.g., "Wards Red needs 2 interns and 1 senior per week") use the same temporal scope as annual requirements: they apply to the schedule year being generated.

**Resolution**: For a given schedule year and rotation, find the staffing preference where `effectiveYear <= scheduleYear`, picking the **latest** such entry.

```
staffingRule = staffingPreferences
  .filter(r => r.rotation === rotation && r.effectiveYear <= scheduleYear)
  .sort((a, b) => b.effectiveYear - a.effectiveYear)[0]
```

---

## Uniqueness Constraint

Each combination of `(effectiveYear, tag, tenant)` — or `(effectiveYear, rotation, tenant)` for staffing — must be unique. There can only be one rule per tag per year. If no rule exists for a given year, the latest prior rule applies automatically.

---

## Interaction with Special Circumstances

- **Transfer students**: A transfer student's graduation requirements are resolved using their original matriculation year at MHS (or their `transferInYear` if they transferred mid-residency). Their prior program's completed rotations are tracked via transfer credits, but the *rules* they must satisfy come from the matriculation-year lookup.
- **Residents held back / extended**: Graduation requirements remain frozen at the original matriculation year. If a resident extends to a 4th year, they are still evaluated against the same graduation rules — just with more time to satisfy them.
- **Leave of absence**: Annual requirements for the year of absence may be partially waived via the Competency Override / Minimum Threshold Flag logic (see `MHS Curriculum.md`). Graduation requirements are unaffected — they are cumulative and can be satisfied in subsequent years using elective time.
