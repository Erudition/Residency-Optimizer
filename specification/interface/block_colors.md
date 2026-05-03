Each rotation/assignment type should have only a Hue associated with it. The oklab/oklch color space will be used to generate the final color, with uniform perceptual lightness among the hues used.

The lightness will be used to indicate whether a block is in the past.

The chroma will vary with the intensity level assigned, which is important for expanding the available colors, given that assignments must otherwise avoid overlapping hues. High-intensity assignments will have high chroma.

Thus:
- All rotations must have a hue that is unique among all other rotations *among the same intensity level*.
- The hues should be roughly equally spaced around the color wheel, with the spacing determined by the number of rotation types at each intensity level.
- The lightness for future blocks and the darkness for past blocks should be far enough apart to be visually obvious, but not enough to run into the limits of the color space for maximum hue variety.