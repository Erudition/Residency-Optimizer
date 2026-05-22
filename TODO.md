Frontend:

- [ ] A way to edit historical schedules and have it persist in the database properly


Payload Admin:
 - Rotations screen - set default columns to Title, Codename, Outpatient Percentage, Is Flexible, Tags
 - Clinic Cycles screen - add `Residents` to default columns
 - Add `canonicalSchedule` relationship field to AcademicYears collection (nullable → Schedules)
 - Add `CandidatePlans` collection to group 3-year collaborative planning sessions
 - Export dialog: default-on checkbox to promote year 1 as canonical historical schedule

Seed Data:
    - Set "Clinic" tag's title to "Continuity Clinic"

TBD

- [ ] Assignment staffing: Move to weight-based system where some PGY-1/PGY-3 staffing levels within the min-max are preferred over others, to prioritize schedules that don't frequently staff rotations lightly or heavily
- [] Regret: Come up with way to integrate more factors into regret score, such as fairness for other PGY levels besides 3

- Add a group of toggle buttons group with multiple buttons that can be toggled in or out for what to unlock:
    - Historical data
    - Clinic blocks
    - Electives (all non-core electives, not just the ELEC placeholder)
    - Core blocks


- "July 1st is a wednesday" problem - how are week-shift starts decided?

- a way to swap two residents' assignments entirely for a given week range