# Future candidate schedules tabs
Tab bar along the bottom, excel spreadsheet-style, that is *only* visible when an acedemic year containing dates in the future is active.

# Schedule Grid
- slots should use posthog-lemon-style colored buttons in each cell, with locked cells having the depressed style (button disabled) and unlocked cells being normal pressable buttons
- all lemon-slot borders and shadows should be derived from the slot background color using CSS relative colors (e.g., oklch(from var(--slot-bg) l c h)) for premium visual fidelity
- Ensure double-click-to-lock works on week headers (locks entire column) and resident names in the list (locks entire row)


# ACGME Audit Tab
- Must have a red badge next to tab label showing total number of violations - number must exactly match the total in that tab
- Create table summarizing each requirement, the year, its type (PC, HC, II, etc.), and the status (Violated, Satisfied, N/A) with an appropriate color
- Per-year requirements have just one progress bar for the current year, but requirements based on the full 3 years should have 3 stacked progress bars
- In all cases where there is a "minimum" requirement and a "current" count, show in `current / target` format universally, even if greater than 100%; numerator should be bold and colored red when in violation

# Coverage tab
- Must have a red badge next to tab label showing total number of violations - number must exactly match the total in that tab