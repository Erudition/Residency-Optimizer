
# Residency Optimizer App
This project is a collaboration between Github users @Erudition (developer) and @AHWright (Medical Resident). It's developed within a shared Antigravity workspace. You should always update this GEMINI.md (and the files it embeds) with context about the requirements given to you during conversation, especially when you're not specifically asked to put it in a specific file. Keep this document up to date with as much domain knowledge as possible.

## Backend
A Payload CMS backend lives in a sibling repo at `/home/adroit/Projects/residency-backend/` (GitHub: `Erudition/dency`). It stores program configuration (rotations, tags, requirements, staffing preferences, residents) in PostgreSQL with multi-tenant support. See `data_model.md` in this repo for the Directus-era prototype and the Payload collections in `residency-backend/src/collections/` for the current implementation.

### API Integration
The frontend communicates with the backend via **GraphQL** (Payload's built-in endpoint at `/api/graphql`). TypeScript types are auto-generated from the Payload schema using `graphql-codegen`. **No hardcoded program data in the frontend** — all rotations, residents, requirements, staffing preferences, and cycle configurations come from the API. CORS is configured to allow `https://erudition.github.io` and `localhost:5173`.

### Automated Staffing Configuration Generation
When creating or editing a rotation in the Payload admin panel, defining a range of interns and seniors (e.g. Min Interns to Max Interns and Min Seniors to Max Seniors) in a staffing configuration block triggers a backend hook that automatically pre-populates all valid combination permutations as ranked preferences in the database (ordered by increasing total resource intensity). This eliminates the need to manually enter every permutation.

### Rotation Identity
The `codename` field on Rotations is the universal identifier used across both repos. Codenames are short abbreviations (e.g., `CCIM`, `NIMA`, `ICU`) displayed directly in the schedule grid — there is no separate display abbreviation. The frontend's `AssignmentType` enum is being replaced with runtime strings matching these codenames. **Format constraint:** codenames must be ≤8 characters and consist only of capital letters (`A-Z`) and dashes (`-`). This is enforced by backend validation.

### Placeholder Rotations
Rotations with `isPlaceholder` set (a relationship to a `Tag`) are scheduled by the engine as proxies for their tag category. Examples: `ELEC` → Elective tag, `CLINIC` → Clinic tag. Their display title is `"Unspecified {Tag}"` (e.g., "Unspecified Elective"). The schedule grid appends `?` to their codename (e.g., `ELEC?`). The admin or resident resolves them to a specific rotation afterward. Placeholder cells remain unlocked even in historical/past views. See `specification/engine.md` for the scheduling constraint.

### X+Y Clinic Cycle Model
Clinic scheduling uses an X+Y model stored in `ClinicCycles` (cohort documents) and `AcademicYears.clinicWeeksPerCycle` (Y):
*   **Z** (total cycle length) = number of ClinicCycle docs × Y
*   **X** (inpatient block length) = Z - Y
*   Clinic week formula: `Math.floor((week % Z) / Y) === cohortIndex`
*   Standard 4+1: 5 cycle docs, Y=1. Programs using 4+2: 3 cycle docs, Y=2.
*   Residents are assigned directly to ClinicCycle documents for a given AY.
*   **Cohort Indexing & Clinic Week Constraints**:
    *   To prevent off-by-one errors and scheduling mismatches, all cohort indices (active, historical, fallback) must be represented as **0-based** (range `0` to `cohortCount - 1`) in memory.
    *   Clinic week checking and pre-population across all generators, healer solvers, continuity scoring, and requirements engines must generically resolve clinic weeks using the cycle-length (`Z`) and weeks-per-cycle (`Y`) values: `Math.floor((week % Z) / Y) === cohortIndex`. Hardcoding `% 5` or `% cohortCount` for clinic checks is strictly prohibited.
    *   Clinic assignments (`CLINIC`) must never be scheduled, mutated, or generated on non-clinic weeks (flexible weeks).

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

# Academic Year Convention
All year keys, variables, and data structures across both the frontend and backend use the **starting calendar year** of the academic year. Academic years begin on July 1.

*   AY 2025-26 → year key `2025` (July 2025 – June 2026)
*   AY 2024-25 → year key `2024` (July 2024 – June 2025)

This applies to: schedule data keys, `activeYear` state, `ACTIVE_START_YEAR`, `deriveActiveStartYear()`, `Resident.startYear`, `AcademicYear.startingYear` (backend), historical schedule keys, and any new code that references academic years. Never use the ending calendar year as a key.

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

## Schedule Lifecycle & Historical Promotion
The `Schedules` collection stores both candidate and historical schedules in the same schema (single-year, weeks 1–52). Candidate schedules are grouped into 3-year planning horizons via a `Candidates` collection for real-time collaboration.

*   **`AcademicYear.canonicalSchedule`** — a nullable relationship pointing to the one `Schedule` doc that represents the official historical record for that year. If null, the year has no finalized schedule.
*   **Promotion trigger** — when the PD exports or shares a schedule, the export dialog includes a defaulted-on checkbox: *"Set as official schedule for AY [year]?"*. Checking it copies year 1's assignments into a locked historical `Schedule` and sets `canonicalSchedule`. This piggybacks on the PD's natural workflow (generate → review → export) rather than requiring a separate finalization ceremony.
*   **Access control** — historical schedules (those referenced by `canonicalSchedule`) have all assignments marked `locked: true`. Only super-admins can unlock/edit them. Candidate schedules are editable by anyone with `manageSchedules` access.
*   **Conflict resolution** — if multiple candidates are exported with the checkbox, the latest one wins (overwrites the canonical pointer). A warning is shown if an existing canonical schedule would be replaced.

## Realtime Schedule Sync
Candidate schedules are synchronized between multiple frontend clients and the Payload backend using **Server-Sent Events (SSE)** for push notifications and **GraphQL mutations** for writes.

*   **Architecture** — Writes go through GraphQL mutations (individual cell upserts or bulk saves). The backend broadcasts SSE events to all connected clients via `afterChange` hooks on `Schedules` and `ScheduleAssignments` collections.
*   **SSE Endpoint** — `GET /api/sync/stream/:candidateId` maintains persistent `text/event-stream` connections per candidate ID. Each client generates a unique `clientId` to deduplicate its own echoed events.
*   **Bulk Endpoint** — `POST /api/sync/bulk` creates a Schedule with all assignments in one request, bypassing individual `afterChange` hooks and broadcasting a single `bulk-sync` event.
*   **Frontend Service** — `services/api/sync.ts` exports `ScheduleSyncService` (singleton via `getScheduleSyncService()`). It manages EventSource connections, debounced cell upserts (300ms), transparent candidate auto-creation, and exponential-backoff reconnection.
*   **Offline-first** — The app works fully without a backend. localStorage remains as a fallback cache. Backend sync is opportunistic.
*   **Identity Mapping** — Schedules have a frontend `id` (string, e.g. `sched-...`) and an optional `backendId` (Payload Schedule doc ID). Unauthenticated users can generate and interact with schedules locally without ever touching the backend.
*   **Candidate Transparency** — `Candidates` are internal backend groupings (3-year planning horizons). Users never see or manage them directly — the sync service auto-creates them on first save via `ensureCandidate()`.
*   **Conflict Resolution** — Last-write-wins for simultaneous cell edits. No conflict UI.
*   **Sync Status UI** — A status indicator in the header shows: 🟣 Live (SSE streaming), 🟢 Connected (authenticated), ⚪ Local Only (no auth).

## Clinic Block Scheduling Guardrail
*   **Clinic Assignment Exclusivity**: Clinic assignments (`CLINIC` or specific clinic codenames) must never be scheduled, generated, or mutated on non-clinic (flexible) weeks.
*   **Continuity Clinic Tag Integration**: The scheduling helper `isClinicRotation` must check for both `'Clinic'` and `'Continuity Clinic'` tags to align with the seeded tag titles in the database.
*   **Generator Requirement Checks**: All generator algorithms must explicitly filter out clinic rotations from their educational block-placement loops to prevent clinic assignments from being scheduled as blocks on non-clinic weeks.
## Unified Educational Requirements Spreadsheet Grid
*   **Grid layout and columns**: All individual ACGME and Curriculum educational requirements from the backend are represented as columns, and residents as rows. Old ACGME, Curriculum, and ACGME Audit screens are consolidated into this single screen.
*   **Sticky row header resizing**: The resident name row header column is sticky and can be horizontally resized by dragging the right border of the column.
*   **Dynamic sorting**: In 1-year view, sorting can be toggled between "PGY Level" (consisting of PGY groups, cohorts, and then alphabetically) and "Cohort" (consisting of Cohort groups, PGYs, and then alphabetically). In 3-year unified view, the group controls are hidden, and residents are always sorted by matriculation year `startYear` first, then cohort, then alphabetically.
*   **Color coding**: Cells are color-coded based on compliance status: satisfied cells are emerald green (`bg-emerald-50 text-emerald-800 border-b border-emerald-100 font-bold`), unsatisfied annual soft targets/ideals in 1-year view are soft orange (`bg-orange-50 text-orange-800 border-b border-orange-100 font-bold`), and unsatisfied hard graduation minimums in 3-year view are rose/red (`bg-rose-50 text-rose-800 border-b border-rose-100 font-bold`). Non-applicable requirements (0 minimum/ideal weeks) display a simple dash (`-`).
*   **Diagonally Tilted Headers**: Resident column headers across both the Requirements and Totals (Rotation Totals) grids must be tilted diagonally at a `-45deg` angle with absolute positioning (`absolute bottom-3`, `left-4` / `left-3`, `transform-origin: left bottom`) to optimize legibility and facilitate compact columns. To prevent subsequent column backgrounds from clipping or painting over the overflowing rotated text of preceding columns, the resident headers must be assigned a decreasing `zIndex` from left to right (`style={{ zIndex: 100 - idx }}`), while the sticky left row header must retain the highest z-index (`zIndex: 150`) to remain on top of scrolled resident columns.
