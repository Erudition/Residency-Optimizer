Each rotation/assignment type should have only a Hue associated with it. The oklab/oklch color space will be used to generate the final color, with uniform perceptual lightness/chroma among the hues used.

The lightness will be used to indicate whether a block is locked (typical for blocks in the past).

The chroma will vary with the intensity level assigned, which is important for expanding the available colors, given that assignments must otherwise avoid overlapping hues.