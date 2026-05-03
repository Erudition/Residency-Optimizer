
# Residency Optimizer App
This project is a collaboration between Github users @Erudition (developer) and @AHWright (Medical Resident). It's developed within a shared Antigravity workspace. You should always update this GEMINI.md (and the files it embeds) with context about the requirements given to you during conversation, especially when you're not specifically asked to put it in a specific file. Keep this document up to date with as much domain knowledge as possible.

The project is built to a Github pages site available at `https://erudition.github.io/Residency-Optimizer/`, built from the main branch. Make sure I am always working in a dedicated feature branch when making changes. 

After any code modification (code only, not documentation), you MUST run `npx tsc --noEmit` and confirm zero errors before claiming completion. Vite's dev server does not perform type checking—it only transpiles—so runtime ReferenceErrors and missing imports will not surface until the user hits them in the browser. Once the code compiles cleanly, and you have performed any relevant browser-based tasks, stop and ask me if the outcome is approved. If I approve, please commit your changes with a descriptive commit message. If there is a backlog of many files to commit, try to break them down into separate commits with related files grouped.

All work should be done in short-lived feature branches. WHen you have a plan, create a branch, commit the changes in atomic batches, and if you are not the repository owner,open a pull request when done.

If NTS tools are available, use them entirely for reads, edits, searches -- but you MUST use absolute paths for all file references in tool calls.


# Specification
The files found in the `specification/` folder are the authoritative sources of truth for the application code you write. Report, and then correct, any code that is out of sync with the spec.


Here are the rules that must govern the schedule generation:

See @specification/MHS Curriculum Proposal.md
> The MHS Curriculum Proposal.md serves as the absolute and final authority for all scheduling structures, rotation lengths, target PGY distributions, and curriculum logic. In the event of any disagreement or conflict between this document and other files (such as `constants.ts`, `Rotation_Reference.md`, or historical records), **this document supersedes them.** Schedule algorithms and programmatic definitions must be updated to match the rules established here.

## Engine Rules
See @specification/engine.md

## Clinic Faculty Ratios
See @specification/faculty_orientation_analysis.md

## Duty Hours
See @specification/MHS_GME_Policy_Analysis.md

## Future Schedules
The generator needs residents for the following two years to produce compliant schedules, even though the future juniors may not be known yet. In this case, if and only if there are no residents defined for a given year, you may insert new PGY-1 residents named "New [YEAR] Resident [#]" for that year. The number of new PGY-1 residents should exactly match the number of PGY-1 residents that joined in the last year with known residents.

## UI Presentation Standards
See @specification/interface

# Process Management & Background Tasks
*   **Vitest Testing:** When running Vitest tests via the shell, always use `--run` (or equivalent) to disable watch mode. This is especially critical when piping output to a file or running in the background, as watch mode can prevent the IDE from correctly terminating the process, leading to stale background tasks.


## Unauthorized Constraint Modification
*   **Hard Constraint**: The AI must NOT change staffing ratios (e.g., `maxSeniors`, `maxInterns`) or educational requirement targets (e.g., `minWeeks`) without explicit human permission.
*   **Impossibility Reporting**: If the existing constraints create a mathematical impossibility (e.g., requirement > capacity), the AI must report this as a bottleneck (see `bottlenecks_discovered.md`) but must attempt to generate the most compliant schedule possible under the *original* constraints.

