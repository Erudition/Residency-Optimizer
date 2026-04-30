- [ ] UI: remove whitespace below schedule table when scrolling down
- [ ] UI: Make weeks that are in the past have their slot assignments fill their table cell completely, without the padded whitespace around them, and don't show the lock icon or border -- they're presumed to be locked
- [ ] UI: Fix ACGME Audit tab not showing alert badge despite having compliance errors
- [ ] UI: Update ACGME Audit now that we cover a full 3-year span; requirements based on the full 3 years can remain as just one progress bar but per-year requirements should have 3 stacked progress bars
- [ ] UI: In all cases where there is a "target" requirement and a "current" count, show in `current / target` format universally, even if greater than 100%; numerator should be bold and colored red when in violation
- [ ] Nomenclature: Rename mentions of "cost" and "score" to standardize on "Regret"
- [ ] UI: Tooltips show hints that right-clicking a cell locks it but this has been broken for several iterations, change to double-click
- [ ] UI: Make sure double-click-to-lock works on week headers (locks entire column) and resident names in the list (locks entire row)
- [ ] UI: Get rid of the pulsing "! STAFFING VIOLATIONS" pill, it's redundant with the pulsing alert badge on the Assignments tab
- [ ] UI: Rename "Assignments" tab to "Coverage"
- [ ] UI: Make Settings pages into side panels that enter from the right and overlay until dismissed, rather than taking over the main view

TBD

- [ ] Assignment staffing: Move to weight-based system where some PGY-1/PGY-3 staffing levels within the min-max are preferred over others, to prioritize schedules that don't frequently staff rotations lightly or heavily
- [] Regret: Come up with way to integrate more factors into regret score, such as fairness for other PGY levels besides 3
- [ ] Residents: Determine how to handle transfers-in and -out