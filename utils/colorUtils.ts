export const oklchToHex = (l: number, c: number, h: number): string => {
  const labL = l * 100;
  const a = c * Math.cos((h * Math.PI) / 180) * 100;
  const b = c * Math.sin((h * Math.PI) / 180) * 100;

  let y = (labL + 16) / 116;
  let x = a / 500 + y;
  let z = y - b / 200;

  const y3 = Math.pow(y, 3);
  const x3 = Math.pow(x, 3);
  const z3 = Math.pow(z, 3);

  y = y3 > 0.008856 ? y3 : (y - 16 / 116) / 7.787;
  x = x3 > 0.008856 ? x3 : (x - 16 / 116) / 7.787;
  z = z3 > 0.008856 ? z3 : (z - 16 / 116) / 7.787;

  x *= 0.95047;
  y *= 1.0;
  z *= 1.08883;

  let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
  let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
  let b_rgb = x * 0.0557 + y * -0.204 + z * 1.057;

  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
  b_rgb = b_rgb > 0.0031308 ? 1.055 * Math.pow(b_rgb, 1 / 2.4) - 0.055 : 12.92 * b_rgb;

  const toHex = (c: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(c * 255))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return '#' + toHex(r) + toHex(g) + toHex(b_rgb);
};

export const getAssignmentColor = (hue: number, isCompleted: boolean) => {
  return oklchToHex(isCompleted ? 0.95 : 0.85, 0.1, hue);
};
