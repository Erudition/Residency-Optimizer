export const oklchToHex = (L: number, C: number, H: number): string => {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855378 * b;

  const l = Math.pow(Math.max(0, l_), 3);
  const m = Math.pow(Math.max(0, m_), 3);
  const s = Math.pow(Math.max(0, s_), 3);

  const r_linear = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g_linear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b_linear = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const r_val = r_linear <= 0.0031308 ? 12.92 * r_linear : 1.055 * Math.pow(r_linear, 1 / 2.4) - 0.055;
  const g_val = g_linear <= 0.0031308 ? 12.92 * g_linear : 1.055 * Math.pow(g_linear, 1 / 2.4) - 0.055;
  const b_val = b_linear <= 0.0031308 ? 12.92 * b_linear : 1.055 * Math.pow(b_linear, 1 / 2.4) - 0.055;

  const toHex = (c: number) => {
    const value = Math.max(0, Math.min(255, Math.round(c * 255)));
    return value.toString(16).padStart(2, '0').toUpperCase();
  };

  return `#${toHex(r_val)}${toHex(g_val)}${toHex(b_val)}`;
};

export const getAssignmentColor = (
  hue: number,
  intensityOrIsPast?: number | boolean,
  isPast?: boolean
): string => {
  let intensity = 1;
  let past = false;

  if (typeof intensityOrIsPast === 'boolean') {
    past = intensityOrIsPast;
    intensity = 1;
  } else if (typeof intensityOrIsPast === 'number') {
    intensity = intensityOrIsPast;
    past = isPast ?? false;
  }

  const chroma = intensity === 0 ? 0.015 : 0.01 + intensity * 0.038;
  const lightness = past ? 0.62 : 0.84;
  return oklchToHex(lightness, chroma, hue);
};
