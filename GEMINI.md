
# Residency Optimizer App
This project is a collaboration between Github users @Erudition (developer) and @AHWright (Medical Resident). It's developed within a shared Antigravity workspace. You should always update this GEMINI.md (and the files it embeds) with context about the requirements given to you during conversation, especially when you're not specifically asked to put it in a specific file. Keep this document up to date with as much domain knowledge as possible.

## Backend
A Payload CMS backend lives in a sibling repo at `/home/adroit/Projects/residency-backend/` (GitHub: `Erudition/dency`). It stores program configuration (rotations, tags, requirements, staffing preferences, residents) in PostgreSQL with multi-tenant support. See `data_model.md` in this repo for the Directus-era prototype and the Payload collections in `residency-backend/src/collections/` for the current implementation.

### API Integration
The frontend communicates with the backend via **GraphQL** (Payload's built-in endpoint at `/api/graphql`). TypeScript types are auto-generated from the Payload schema using `graphql-codegen`. **No hardcoded program data in the frontend** — all rotations, residents, requirements, staffing preferences, and cycle configurations come from the API. CORS is configured to allow `https://erudition.github.io` and `localhost:5173`.

### Rotation Identity
The `codename` field on Rotations is the universal identifier used across both repos. It serves as both the schedule grid label and the primary key for lookups. The frontend's `AssignmentType` enum is being replaced with runtime strings matching these codenames.

### Placeholder Rotations
Rotations with `isPlaceholder` set (a relationship to a `Tag`) are scheduled by the engine as proxies for their tag category. Examples: `ELEC` → Elective tag, `CLINIC` → Clinic tag. Their display title is `"Unspecified {Tag}"` (e.g., "Unspecified Elective"). The schedule grid appends `?` to their codename (e.g., `ELEC?`). The admin or resident resolves them to a specific rotation afterward. Placeholder cells remain unlocked even in historical/past views. See `specification/engine.md` for the scheduling constraint.

### X+Y Clinic Cycle Model
Clinic scheduling uses an X+Y model stored in `ClinicCycles` (cohort documents) and `AcademicYears.clinicWeeksPerCycle` (Y):
*   **Z** (total cycle length) = number of ClinicCycle docs × Y
*   **X** (inpatient block length) = Z - Y
*   Clinic week formula: `Math.floor((week % Z) / Y) === cohortIndex`
*   Standard 4+1: 5 cycle docs, Y=1. Programs using 4+2: 3 cycle docs, Y=2.
*   Residents are assigned directly to ClinicCycle documents for a given AY.

The project is built to a Github pages site available at `https://erudition.github.io/Residency-Optimizer/`, built from the main branch. Make sure I am always working in a dedicated feature branch when making changes. 

After any code modification (code only, not documentation), you MUST run `npx tsc --noEmit` and confirm zero errors before claiming completion. Vite's dev server does not perform type checking—it only transpiles—so runtime ReferenceErrors and missing imports will not surface until the user hits them in the browser. Once the code compiles cleanly, and you have performed any relevant browser-based tasks, stop and ask me if the outcome is approved. If I approve, please commit your changes with a descriptive commit message. If there is a backlog of many files to commit, try to break them down into separate commits with related files grouped.

All work should be done in short-lived feature branches. When you have a plan, create a branch, commit the changes in atomic batches, and if you are not the repository owner,open a pull request when done.

If NTS tools are available, use them entirely for reads, edits, searches -- but you MUST use absolute paths for all file references in tool calls.


# Terminology Standards
Do not use the word "target" in code, comments, specs, or conversation — it conflates hard constraints with aspirational goals. Use these precise terms instead:

*   **Minimum** — a hard floor. Failing to meet a minimum is a violation (e.g., "minimum 2 weeks Night Float per year").
*   **Maximum** — a hard ceiling. Exceeding a maximum is a violation (e.g., "maximum 6 months critical care across residency").
*   **Limit** — umbrella term for either a minimum or maximum, when referencing both directions collectively.
*   **Ideal** — a soft goal. Getting closer improves the schedule score, but not reaching it is NOT a violation. Milestones (e.g., cumulative progress checkpoints at PGY-year boundaries) are ideals.
*   **Property Mapping** — Programmatically, minimum requirements are stored in the `minWeeks` property. The legacy `target` property has been deprecated and must not be used.
*   **Matriculation Year** — The academic year a resident entered PGY-1 (stored as `startYear`). Graduation requirements are resolved against this year. Prefer "matriculation year" in documentation and specs; `startYear` remains the code-level field name for brevity.

# Specification
The files found in the `specification/` folder are the authoritative sources of truth for the application code you write. Report, and then correct, any code that is out of sync with the spec.


Here are the rules that must govern the schedule generation:

See @specification/MHS Curriculum.md
> The MHS Curriculum.md serves as the absolute and final authority for all scheduling structures, rotation lengths, minimum PGY distributions, and curriculum logic. In the event of any disagreement or conflict between this document and other files (such as `constants.ts`, `Rotation_Reference.md`, or historical records), **this document supersedes them.** Schedule algorithms and programmatic definitions must be updated to match the rules established here.

## Engine Rules
See:

@specification/engine.md

For further engine rule development, add items to engine.md, not GEMINI.md.

## Effective Dating of Requirements
See:

@specification/effective_dating.md

For further effective-dating rule development, add items to effective_dating.md, not GEMINI.md.

## Clinic Faculty Ratios
See:

@specification/faculty_orientation_analysis.md

For further faculty rule development, add items to faculty_orientation_analysis.md, not GEMINI.md.

## Duty Hours
See:

@specification/MHS_GME_Policy_Analysis.md

For further duty hour rule development, add items to MHS_GME_Policy_Analysis.md, not GEMINI.md.

## Future Schedules
The generator needs residents for the following two years to produce compliant schedules, even though the future juniors may not be known yet. In this case, if and only if there are no residents defined for a given year, you may insert new PGY-1 residents named "New [YEAR] Resident [#]" for that year. The number of new PGY-1 residents should exactly match the number of PGY-1 residents that joined in the last year with known residents.

## UI Presentation Standards
See:

@specification/interface

For further UI presentation development, add items to interface.md, not GEMINI.md. Don't add items without permission from the developer - UI is particular.

# Process Management & Background Tasks
*   **Vitest Testing:** When running Vitest tests via the shell, always use `--run` (or equivalent) to disable watch mode. This is especially critical when piping output to a file or running in the background, as watch mode can prevent the IDE from correctly terminating the process, leading to stale background tasks.
*   **Host Commands (Flatpak):** On Erudition's machine, this workspace runs inside a Flatpak sandbox. `docker` and `git` are already routed to the host — use them directly. For all other host-side commands (e.g., `fuser`, `pkill`), use `host-spawn` — **never** `flatpak-spawn --host`.
*   **Dev Server Hygiene:** Before starting a new dev server, always kill any orphan processes occupying the expected port (e.g., `host-spawn fuser -k 3000/tcp`). Never start a duplicate server on a different port — stop the old one first.


## Unauthorized Constraint Modification
*   **Hard Constraint**: The AI must NOT change staffing ratios (e.g., `minInterns`, `minSeniors`, `maxInterns`, `maxSeniors`) or educational requirement minimums (e.g., `minWeeks`) without explicit human permission.
*   **Logical Guardrail (X+Y Availability)**: Under the X+Y model, exactly **X/Z** of the resident pool is available for inpatient service every week (where Z = X+Y is the total cycle length). For a 4+1 program with 15 residents, this means **12 residents** are always available. The AI must never assume that a service can only be staffed by a single cohort.
*   **Impossibility Reporting**: If the existing constraints create a mathematical impossibility, the AI must report this as a bottleneck (see `bottlenecks_discovered.md`) but must attempt to generate the most compliant schedule possible under the *original* constraints. Never "fix" an algorithm failure by zeroing out a requirement.

## Year-Boundary & Resident State Constraints
*   **Resident Level Calculation**: Resident PGY levels must be calculated dynamically per-week based on the academic year in question (or the start year of each resident) rather than relying on stale or static `resident.level` fields. This is especially critical during multi-year schedule generations at the week 52 boundary where PGY-1s transition to PGY-2 seniors.
*   **Simulated Annealing Healer**: During simulated annealing mutations and rollbacks, staffing and educational requirement metrics must be updated using the dynamic per-week PGY level for each individual week in a mutated block rather than using the first week's level for the entire block.
*   **Transfer-out Compliance**: The scheduling generator and history preloaders must respect each resident's `transferOutYear` property, excluding transferred residents from active assignment pools and cohort counts for years starting at or after their transfer-out date.
*   **Null Schedule Pre-population**: Any blank or `null` assignments loaded into the schedule grid must be pre-populated prior to healing, using appropriate clinic assignment locks for assigned clinic weeks, and default electives for non-clinic weeks.

