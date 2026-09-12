/**
 * sRGB hex → OKLCH.
 *
 * The palette is written in OKLCH because lightness there is perceptual: two
 * colours at the same L look equally light whatever their hue, which is what
 * lets one set of tokens hold up across a wheel of accents. A colour picked
 * from a native swatch arrives as sRGB, so it has to be converted before it
 * can join that system.
 *
 * Conversion is sRGB → linear → LMS → Oklab → polar, per Björn Ottosson's
 * definition. The matrices are his.
 */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export function hexToOklch(hex: string): Oklch {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { l: 0.6, c: 0.14, h: 358 };
  const int = parseInt(m[1], 16);
  const toLinear = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = toLinear((int >> 16) & 255);
  const g = toLinear((int >> 8) & 255);
  const b = toLinear(int & 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s;

  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

/** OKLCH back to sRGB 0-255, clipped. */
function oklchToRgb(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const enc = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255)));
  };
  return [
    enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The accent a theme will actually use, given a colour someone picked.
 *
 * The hue is theirs exactly — that is what "pick the colour" means. Lightness
 * is not, and cannot be: the accent is used as text on a near-white card, and
 * OKLCH lightness is perceptual while WCAG contrast is not, so one fixed L
 * passes for red and fails for yellow-green. Measured at L=0.56: red 5.0:1,
 * yellow-green 4.24:1.
 *
 * So the lightness is searched rather than assumed — darkened in small steps
 * until the colour clears 4.5:1 against the card it will sit on. Someone can
 * pick any colour and the result is still readable, which is the only way a
 * free choice can be offered honestly.
 */
const CARD_LIGHT: [number, number, number] = [253, 250, 252];
const CARD_DARK: [number, number, number] = [40, 35, 39];

export function accentFromHex(hex: string): {
  light: string;
  dark: string;
  hue: number;
  chroma: number;
} {
  const { c, h } = hexToOklch(hex);
  // Their saturation, kept. There was a 0.04 floor here, which turned a soft
  // grey-blue into a confident one — someone who picks a muted colour gets a
  // muted accent. The cap is only there to stay inside sRGB at the lightness
  // the contrast search lands on.
  const chroma = Math.min(0.2, c);

  let lightL = 0.62;
  while (lightL > 0.3 && contrast(oklchToRgb(lightL, chroma, h), CARD_LIGHT) < 4.5) {
    lightL -= 0.01;
  }
  let darkL = 0.74;
  while (darkL < 0.95 && contrast(oklchToRgb(darkL, Math.min(0.12, chroma), h), CARD_DARK) < 4.5) {
    darkL += 0.01;
  }

  return {
    light: `oklch(${lightL.toFixed(3)} ${chroma.toFixed(3)} ${h.toFixed(1)})`,
    dark: `oklch(${darkL.toFixed(3)} ${Math.min(0.14, chroma).toFixed(3)} ${h.toFixed(1)})`,
    hue: Math.round(h),
    chroma,
  };
}


/**
 * A soft pastel at a given hue, as an "r g b" triple.
 *
 * The glass refraction is written as raw channels (`--refract-cyan: 255 223
 * 238`) because the CSS composes them with an alpha, so a custom accent has
 * to produce the same shape rather than a colour function.
 */
export function pastel(hue: number, l = 0.9, c = 0.055): string {
  const [r, g, b] = oklchToRgbPublic(l, c, hue);
  return `${r} ${g} ${b}`;
}

export function oklchToRgbPublic(L: number, C: number, h: number): [number, number, number] {
  return oklchToRgb(L, C, h);
}

/**
 * Every token a named accent theme overrides, expressed for one hue.
 *
 * A custom accent has no CSS block of its own, so it has to write the same
 * set the named themes declare — otherwise only the accent moves and the page
 * keeps the default theme's tinted paper, which reads as the colour not
 * applying at all.
 */
export function neutralTokens(
  hue: number,
  dark: boolean,
  chroma = 0.14
): Record<string, string> {
  const n = hue.toFixed(1);
  // The paper carries a fraction of the accent's saturation rather than a
  // fixed amount: a muted accent over vividly tinted paper is the mismatch
  // people describe as "that is not the colour I picked".
  const k = Math.max(0.25, Math.min(1.4, chroma / 0.14));
  const t = (base: number) => (base * k).toFixed(4);
  if (dark) {
    return {
      "--background": `oklch(0.170 ${t(0.010)} ${n})`,
      "--card": `oklch(0.224 ${t(0.012)} ${n})`,
      "--popover": `oklch(0.224 ${t(0.012)} ${n})`,
      "--secondary": `oklch(0.260 ${t(0.013)} ${n})`,
      "--muted": `oklch(0.250 ${t(0.013)} ${n})`,
      "--muted-foreground": `oklch(0.670 ${t(0.016)} ${n})`,
      "--accent": `oklch(0.284 ${t(0.014)} ${n})`,
      "--border": `oklch(0.332 ${t(0.016)} ${n})`,
      "--input": `oklch(0.350 ${t(0.016)} ${n})`,
      "--sidebar": `oklch(0.192 ${t(0.011)} ${n})`,
      "--sidebar-accent": `oklch(0.280 ${t(0.014)} ${n})`,
      "--sidebar-border": `oklch(0.332 ${t(0.016)} ${n})`,
      "--refract-cyan": pastel(hue, 0.4, 0.05),
      "--refract-blue": pastel(hue + 30, 0.4, 0.045),
      "--refract-lavender": pastel(hue - 30, 0.4, 0.045),
      "--refract-violet": pastel(hue + 60, 0.4, 0.04),
    };
  }
  return {
    "--background": `oklch(0.972 ${t(0.012)} ${n})`,
    "--foreground": `oklch(0.285 ${t(0.030)} ${n})`,
    "--card": `oklch(0.995 ${t(0.004)} ${n})`,
    "--card-foreground": `oklch(0.285 ${t(0.030)} ${n})`,
    "--popover": `oklch(0.995 ${t(0.004)} ${n})`,
    "--popover-foreground": `oklch(0.285 ${t(0.030)} ${n})`,
    "--secondary": `oklch(0.948 ${t(0.016)} ${n})`,
    "--muted": `oklch(0.955 ${t(0.014)} ${n})`,
    "--muted-foreground": `oklch(0.500 ${t(0.024)} ${n})`,
    "--accent": `oklch(0.940 ${t(0.020)} ${n})`,
    "--border": `oklch(0.915 ${t(0.016)} ${n})`,
    "--input": `oklch(0.915 ${t(0.016)} ${n})`,
    "--sidebar": `oklch(0.988 ${t(0.008)} ${n})`,
    "--sidebar-foreground": `oklch(0.400 ${t(0.026)} ${n})`,
    "--refract-cyan": pastel(hue),
    "--refract-blue": pastel(hue + 30),
    "--refract-lavender": pastel(hue - 30),
    "--refract-violet": pastel(hue + 60),
  };
}
