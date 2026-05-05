
# Residency Optimizer App
This project is a collaboration between Github users @Erudition (developer) and @AHWright (Medical Resident). It's developed within a shared Antigravity workspace. You should always update this GEMINI.md (and the files it embeds) with context about the requirements given to you during conversation, especially when you're not specifically asked to put it in a specific file. Keep this document up to date with as much domain knowledge as possible.

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

# Specification
The files found in the `specification/` folder are the authoritative sources of truth for the application code you write. Report, and then correct, any code that is out of sync with the spec.


Here are the rules that must govern the schedule generation:

See @specification/MHS Curriculum Proposal.md
> The MHS Curriculum Proposal.md serves as the absolute and final authority for all scheduling structures, rotation lengths, target PGY distributions, and curriculum logic. In the event of any disagreement or conflict between this document and other files (such as `constants.ts`, `Rotation_Reference.md`, or historical records), **this document supersedes them.** Schedule algorithms and programmatic definitions must be updated to match the rules established here.

## Engine Rules
See:

@specification/engine.md

For further engine rule development, add items to engine.md, not GEMINI.md.

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


## Unauthorized Constraint Modification
*   **Hard Constraint**: The AI must NOT change staffing ratios (e.g., `minInterns`, `minSeniors`, `maxInterns`, `maxSeniors`) or educational requirement targets (e.g., `minWeeks`) without explicit human permission.
*   **Logical Guardrail (4+1 Availability)**: Under the 4+1 model, exactly **4/5ths** of the resident pool is available for inpatient service every week. For a class of 15, this means **12 residents** are always available. The AI must never assume that a service can only be staffed by a single cohort.
*   **Impossibility Reporting**: If the existing constraints create a mathematical impossibility, the AI must report this as a bottleneck (see `bottlenecks_discovered.md`) but must attempt to generate the most compliant schedule possible under the *original* constraints. Never "fix" an algorithm failure by zeroing out a requirement.
