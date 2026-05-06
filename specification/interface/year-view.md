# Future candidate schedules tabs
Tab bar along the bottom, excel spreadsheet-style, that is *only* visible when an acedemic year containing dates in the future is active.

# Schedule Grid
- slots should use posthog-lemon-style colored buttons in each cell, with locked cells having the depressed style (button disabled) and unlocked cells being normal pressable buttons
- all lemon-slot borders and shadows should be derived from the slot background color using CSS relative colors (e.g., oklch(from var(--slot-bg) l c h)) for premium visual fidelity
- Ensure double-click-to-lock works on week headers (locks entire column) and resident names in the list (locks entire row)

## Block Colors
Each rotation/assignment type should have only a Hue associated with it. The oklab/oklch color space will be used to generate the final color, with uniform perceptual lightness among the hues used.

The lightness will be used to indicate whether a block is in the past.

The chroma will vary with the intensity level assigned, which is important for expanding the available colors, given that assignments must otherwise avoid overlapping hues. High-intensity assignments will have high chroma.

Thus:
- All rotations must have a hue that is unique among all other rotations *among the same intensity level*.
- The hues should be roughly equally spaced around the color wheel for the most common intensity levels.
- As an exception to this, since there are only a few rotations in the highest intensity levels, we don't need to use all the hues, and the resulting colors should make sense given the rotation. For example, Cardiology should be deep red, and Night Float should be deep purple.
- remember that intensity level 0 is just vacation, which will be grey, so there are only 4 chroma levels needed.
- The lightness for future blocks and the darkness for past blocks should be far enough apart to be visually obvious, but not enough to run into the limits of the color space for maximum hue variety.

## Blank/Disabled Slots

Use placeholder text:
- `⇢` for slots blank because the week is before their residency begins
- `🏥⇢` for slots blank because they have started their residency by that week, but at another institution, and have not yet transfered in
- `⇠🏥` for slots blank because their residency was ongoing that week, but at another institution; they have already transferred out
- `🎓` for slots blank because they have graduated by that point
- `⤵︎` for slots blank because by that week they dropped out
- `⦸` for slots blank because they had been expelled by that week

Use a greyscale filter so that emoji do not appear in color.


# ACGME Audit Tab
- Must have a red badge next to tab label showing total number of violations - number must exactly match the total in that tab
- Create table summarizing each requirement, the year, its type (PC, HC, II, etc.), and the status (Violated, Satisfied, N/A) with an appropriate color
- Per-year requirements have just one progress bar for the current year, but requirements based on the full 3 years should have 3 stacked progress bars
- In all cases where there is a "minimum" requirement and a "current" count, show in `current / minimum` format universally, even if greater than 100%; numerator should be bold and colored red when in violation

# Coverage tab
- Must have a red badge next to tab label showing total number of violations - number must exactly match the total in that tab

