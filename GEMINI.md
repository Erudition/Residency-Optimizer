# Scheduling & Algorithmic Rules

## 1. Vacation Scheduling (Human-Only)
See @specification/MHS Curriculum Proposal.md

# Residency Optimizer App
This project is a collaboration between Github users @Erudition (developer) and @AHWright (Medical Resident). It's developed within a shared Antigravity workspace. You should always update this GEMINI.md (and the files it embeds) with context about the requirements given to you during conversation, especially when you're not specifically asked to put it in a specific file. Keep this document up to date with as much domain knowledge as possible.

The project is built to a Github pages site available at `https://erudition.github.io/Residency-Optimizer/`, built from the main branch. Make sure I am always working in a dedicated feature branch when making changes. 

After any code modification, you MUST run `npx tsc --noEmit` and confirm zero errors before claiming completion. Vite's dev server does not perform type checking—it only transpiles—so runtime ReferenceErrors and missing imports will not surface until the user hits them in the browser. Once the code compiles cleanly, please commit your changes with a descriptive commit messages. If code changes are involved, prefer to only commit when tests pass, but if documentation or just GEMINI.md is updated, commit and push immediately after editing. If there is a backlog of many files to commit, try to break them down into separate commits with related files grouped.

All work should be done in short-lived feature branches. WHen you have a plan, create a branch, commit the changes in atomic batches, and if you are not the repository owner,open a pull request when done.

If NTS tools are available, use them entirely for reads, edits, searches -- but you MUST use absolute paths for all file references in tool calls.


# Additional ACGME & Scheduling Constraints

The core curriculum proposal outlines *what* blocks the residents must take, but there are several critical operational and ACGME scheduling constraints discussed during our conversation that must be factored into the underlying logic of the `Residency-Optimizer` application. 

Here are the rules that must govern the schedule generation:

## 1. 4+1 Cohort Division Logic
Refer to the complete cohort constraints in the curriculum proposal above.

## 2. Inpatient Patient Census Caps (Wards)
See @specification/simplified_acgme_requirements.md

## 3. Clinic Faculty Ratios
See @specification/faculty_orientation_analysis.md

## 4. Duty Hours
See @specification/MHS_GME_Policy_Analysis.md

## 5. Subspecialty Auditing List
Refer to the simplified ACGME requirements for auditing domains.

## 6. Rotation Month Minimums & Maximums
Refer to the simplified ACGME requirements for overall month requirements.

## 7. Mandatory Multidisciplinary Clinical Experiences
Refer to the simplified ACGME requirements for multidisciplinary experiences.

## 8. Faculty & Attending Scope
Refer to the faculty orientation analysis for detailed scope restrictions.

## 9. Reminders
Refer to the complete curriculum proposal for important reminders.

## 10. UI Presentation Standards
See @specification/interface

## 11. Process Management & Background Tasks
*   **Vitest Testing:** When running Vitest tests via the shell, always use `--run` (or equivalent) to disable watch mode. This is especially critical when piping output to a file or running in the background, as watch mode can prevent the IDE from correctly terminating the process, leading to stale background tasks.

## 12. Deficit Recovery & Scheduling Engine Logic
Refer to the complete curriculum proposal for details.

## 13. Year-Specific Cohort Mapping
Refer to the complete curriculum proposal for details.

## 14. Jeopardy & Backup Coverage Logic
Refer to the complete curriculum proposal for details.

## 15. Start Year vs PGY Level Logic
Refer to the complete curriculum proposal for details.

## 16. Database Purity
*   **No Placeholders**: Initial data generation and "Factory Reset" logic must not create placeholder resident records for future years. Only residents with explicitly defined names or manually added data should exist in the database.

## 17. Dynamic Academic Year Labeling
Refer to the complete curriculum proposal for details.

## 18. Unauthorized Constraint Modification
*   **Hard Constraint**: The AI must NOT change staffing ratios (e.g., `maxSeniors`, `maxInterns`) or educational requirement targets (e.g., `minWeeks`) without explicit human permission.
*   **Impossibility Reporting**: If the existing constraints create a mathematical impossibility (e.g., requirement > capacity), the AI must report this as a bottleneck (see `bottlenecks_discovered.md`) but must attempt to generate the most compliant schedule possible under the *original* constraints.

> [!IMPORTANT]
> **Authoritative Source of Truth**
> The MHS Curriculum Proposal.md serves as the absolute and final authority for all scheduling structures, rotation lengths, target PGY distributions, and curriculum logic. In the event of any disagreement or conflict between this document and other files (such as `constants.ts`, `Rotation_Reference.md`, or historical records), **this document supersedes them.** Schedule algorithms and programmatic definitions must be updated to match the rules established here.

## 19. Multi-Year Generation Architecture
*   **Current approach (stepping stone)**: The generator runs sequentially — Year 1 first, its output feeds as `historicalSchedules` into Year 2, then Year 3. Each year is a separate worker invocation. This satisfies cumulative ACGME requirement tracking but does not globally optimize across years.
*   **Future goal**: A unified multi-year generator that accepts a partially-locked Year 1 (e.g., after residents fill in vacation days) and regenerates the remaining schedule across all future years simultaneously, satisfying cumulative 3-year constraints holistically. The `locked` flag infrastructure and `historicalSchedules` passthrough already exist as foundations for this.
*   **Key use case**: After residents specify their vacation weeks for the current year, the system should recalculate remaining requirements and regenerate Years 2-3 to satisfy them — without disturbing locked assignments.

## 20. Generator Seed Data & Testing Parity
*   **Fresh Start Parity**: When testing the scheduling generators, tests must not manually seed cohort mappings. They must match the UI's behavior on fresh starts exactly, passing `{}` or empty cohort mappings to exercise the internal generator fallbacks properly and reliably.
