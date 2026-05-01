# Requirement vs. Implementation Comparison Report

This report identifies discrepancies between the project documentation and the actual implementation in the codebase, with a specific focus on "hidden" requirements that exist in code but are absent or conflicting in documentation.

## 1. Documentation File Redundancy & Inconsistency

There are duplicate markdown files with different casing (`RULES.md` vs `rules.md` and `ROTATIONS.md` vs `rotations.md`) that contain conflicting information.

### Discrepancies in `RULES.md` vs `rules.md`

| Feature | `RULES.md` (UPPERCASE) | `rules.md` (lowercase) | Code Implementation | Source of Truth |
| :--- | :--- | :--- | :--- | :--- |
| **Night Float Duration** | 4 Weeks | 2 Weeks | 4 Weeks | `RULES.md` |
| **PGY3 Elective Duration** | 4 Weeks | 2 Weeks | 4 Weeks | `RULES.md` |
| **PGY2 Required Rotations** | 2 - 4 Weeks | 4 Weeks | 4 Weeks | `rules.md` |
| **PGY2/3 NF Requirement** | Not explicitly listed in text | 2 Weeks | 4 Weeks | `RULES.md` (Table) |

### Discrepancies in `ROTATIONS.md` vs `rotations.md`

| Rotation | `ROTATIONS.md` (Max) | `rotations.md` (Max) | Code (`constants.ts`) | Source of Truth |
| :--- | :--- | :--- | :--- | :--- |
| **ICU** | 5 | 4 | 4 (2 Interns / 2 Seniors) | `rotations.md` |
| **Night Float** | 4 | 5 | 5 (2 Interns / 3 Seniors) | `rotations.md` |
| **Emergency (EM)** | 3 | 4 | 4 (2 Interns / 2 Seniors) | `rotations.md` |
| **ONC Setting** | Mix | Inpatient | Inpatient | `rotations.md` |

---

## 2. Specific Focus: Night Float Requirements

Night Float is the most inconsistent area, with conflicts existing not only between docs and code, but **within the code itself**.

### Staffing & Duration Conflicts
| Source | Block Duration | Max Seniors |
| :--- | :--- | :--- |
| `RULES.md` (UPPERCASE) | 4 weeks | 2 |
| `rules.md` (lowercase) | 2 weeks | 3 |
| **Code (`constants.ts`)** | **4 weeks** | **3** |

### Target Conflicts (Weeks per Year)
| Source | PGY1 | PGY2 | PGY3 |
| :--- | :--- | :--- | :--- |
| `RULES.md` | 4 | 4 (Table Only) | 4 (Table Only) |
| `rules.md` | 2 | 2 | 2 |
| `constants.ts`: `REQUIREMENTS` | **4** | **4** | **4** |
| `constants.ts`: `ROTATION_METADATA` | 2 | 2 | 2 |

> [!WARNING]
> **Generator vs. UI Drift**: The Scheduler Generator uses the `REQUIREMENTS` table (4 weeks), while the UI tooltips in `AssignmentStats.tsx` and `ACGMEAudit` may pull from `ROTATION_METADATA` (2 weeks), leading to the UI displaying targets that the algorithm is consciously trying to exceed or "violate".

---

## 3. Key Implementation Findings

### The "4+1" Cohort Model
- **Rule**: Every 5th week is Clinic (CCIM).
- **Logic**: `Week % 5 == Cohort ID`.
- **Status**: Correctly implemented in `BacktrackingGenerator` and enforced as a "Locked" assignment (line 19, `backtracking.ts`).

### Generator Behavior vs. Requirements
- **Strictness**: The `BacktrackingGenerator` treats durations in `ROTATION_METADATA` as absolute. It attempts to meet targets in `REQUIREMENTS` (not `ROTATION_METADATA`) by placing blocks of that duration.
- **Priority Logic (Code Only)**: The generator has hardcoded priority weights used to resolve constraints:
    - **Night Float**: 10 (Highest)
    - **Wards / ICU**: 8
    - **Required Electives**: 5
    - **Everything else**: 1
- **Generic Electives**: Anything not filled by requirements is filled with `ELECTIVE` blocks (usually 2 weeks).

### ACGME Audit (Monitored vs. Enforced)
- The `ACGMEAudit.tsx` component monitors rules that are **not** strictly enforced by the generator:
    - **Total Outpatient/Inpatient**: Target ~13.3 weeks/year.
    - **Crit Care Ceiling**: Max 8 weeks/year.
    - **Night Float Limit**: Max 8 weeks/year.
- The generator does not currently check these "Ceiling" or "Total Compliance" rules during placement, which may lead to audit violations in the UI.

---

## 3. Notable Deviations

1. **ICU Maxconcurrent**: Use of `maxInterns: 2, maxSeniors: 2` in code effectively limits ICU to 4 residents, while `ROTATIONS.md` suggests 5.
2. **PGY2 Requirements**: The code sets a hard target of 4 weeks for ONC, NEURO, RHEUM, and GI, ignoring the `2-4 week` range mentioned in `RULES.md`.
3. **Internal Priorities**: The generator has a hardcoded priority list for tie-breaking, which is not documented in any requirement file.
4. **HPC Name**: Documentation calls it "Palliative Care", but `types.ts` and code use initials "HPC" or "Hospice & Palliative Care".

> [!IMPORTANT]
> It is highly recommended to consolidate the `.md` requirement files to prevent future configuration drift.
