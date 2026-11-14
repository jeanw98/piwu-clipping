/**
 * Canvas helpers — direct port of docs/motion-graphics/lib/helpers.js.
 * Every function takes the 2D context `X` explicitly (no globals).
 * Deterministic: never use Math.random, use rng(seed).
 */

export type Ctx = CanvasRenderingContext2D;
export type Pair = [string, string];

export const W = 1080;
export const H = 1920;
/** Single bold family (Poppins Bold) registered by MotionGraphicsClip. */
export const FONT = 'PoppinsMG';

export const C = {
  yellow: '#FFD23F',
  navy: '#14213D',
  red: '#FF3B3B',
  cyan: '#3FD0FF',
  green: '#2BB673',
  white: '#FFFFFF',
  ink: '#0B0B0B',
} as const;

export const font = (px: number) => `${px}px ${FONT}`;

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const back = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

/** mulberry32 — seeded PRNG. */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rr(
  X: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | number[],
) {
  X.beginPath();
  if (typeof X.roundRect === 'function') {
    X.roundRect(x, y, w, h, r);
    return;
  }
  const rad = Array.isArray(r) ? r[0] : r;
  X.moveTo(x + rad, y);
  X.arcTo(x + w, y, x + w, y + h, rad);
  X.arcTo(x + w, y + h, x, y + h, rad);
  X.arcTo(x, y + h, x, y, rad);
  X.arcTo(x, y, x + w, y, rad);
  X.closePath();
}

export function lg(
  X: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: string[],
): CanvasGradient {
  const g = X.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}

export function ell(
  X: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string | CanvasGradient,
) {
  X.beginPath();
  X.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
  X.fillStyle = fill;
  X.fill();
}

export function zoom(X: Ctx, s: number, cx: number, cy: number) {
  X.translate(cx, cy);
  X.scale(s, s);
  X.translate(-cx, -cy);
}

export function vignette(X: Ctx, a: number) {
  const g = X.createRadialGradient(W / 2, H * 0.45, 300, W / 2, H * 0.45, 1250);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  X.fillStyle = g;
  X.fillRect(0, 0, W, H);
}

/** Radial glow behind a hero object. */
export function glow(X: Ctx, x: number, y: number, r: number, rgb: string, a = 0.4) {
  const g = X.createRadialGradient(x, y, r * 0.1, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  X.fillStyle = g;
  X.fillRect(x - r, y - r, r * 2, r * 2);
}

export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

// ---------- text ----------
export type Word = { t: string; k: boolean; w?: number };

export function toWords(text: string, kw: string): Word[] {
  const out: Word[] = [];
  const lo = text.toLowerCase();
  const ki = kw ? lo.indexOf(kw.toLowerCase()) : -1;
  let pos = 0;
  text
    .split(' ')
    .filter(Boolean)
    .forEach((t) => {
      const st = lo.indexOf(t.toLowerCase(), pos);
      pos = st + t.length;
      out.push({ t, k: ki >= 0 && st < ki + kw.length && st + t.length > ki });
    });
  return out;
}

export function wrapWords(X: Ctx, words: Word[], f: string, maxW: number): Word[][] {
  X.font = f;
  const lines: Word[][] = [[]];
  let w = 0;
  const sp = X.measureText(' ').width;
  words.forEach((wd) => {
    const ww = X.measureText(wd.t).width;
    if (w + ww > maxW && lines[lines.length - 1].length) {
      lines.push([]);
      w = 0;
    }
    lines[lines.length - 1].push({ ...wd, w: ww });
    w += ww + sp;
  });
  return lines;
}

export function drawLines(
  X: Ctx,
  lines: Word[][],
  f: string,
  cx: number,
  cy: number,
  lh: number,
  stroke: number,
  scale = 1,
  colors: { base?: string; key?: string } = {},
) {
  X.save();
  X.translate(cx, cy);
  X.scale(scale, scale);
  X.font = f;
  X.textBaseline = 'middle';
  X.textAlign = 'left';
  X.lineJoin = 'round';
  const sp = X.measureText(' ').width;
  const tot = lines.length * lh;
  lines.forEach((ln, i) => {
    const lw = ln.reduce((a, b) => a + (b.w ?? 0), 0) + sp * (ln.length - 1);
    let x = -lw / 2;
    const y = -tot / 2 + lh * (i + 0.5);
    ln.forEach((wd) => {
      X.lineWidth = stroke;
      X.strokeStyle = C.ink;
      X.strokeText(wd.t, x, y);
      X.fillStyle = wd.k ? (colors.key ?? C.yellow) : (colors.base ?? '#fff');
      X.fillText(wd.t, x, y);
      x += (wd.w ?? 0) + sp;
    });
  });
  X.restore();
}

/** Kinetic headline: bounce-in, black stroke = 16% of size, keyword yellow. */
export function headline(
  X: Ctx,
  items: Pair[],
  y: number,
  t0: number,
  t: number,
  size = 96,
  t1 = 1e9,
) {
  if (t < t0 || t > t1) return;
  const s = size * 0.88;
  const sc = back(clamp((t - t0) / 0.28));
  const lines: Word[][] = [];
  items.forEach(([text, k]) => lines.push(...wrapWords(X, toWords(text.toUpperCase(), k.toUpperCase()), font(s), 960)));
  drawLines(X, lines, font(s), W / 2, y, s * 1.12, s * 0.16, Math.max(0.01, sc));
}

export function pill(
  X: Ctx,
  text: string,
  x: number,
  y: number,
  t0: number,
  t: number,
  o: { t1?: number; fs?: number; bg?: string; dot?: string } = {},
) {
  if (t < t0 || (o.t1 && t > o.t1)) return;
  const sc = back(clamp((t - t0) / 0.25));
  X.save();
  X.translate(x, y);
  X.scale(sc, sc);
  const fs = (o.fs ?? 38) * 0.9;
  X.font = font(fs);
  const tw = X.measureText(text).width;
  const pw = Math.min(tw + 70, 1000);
  const ph = fs * 1.8;
  X.fillStyle = o.bg ?? C.navy;
  X.shadowColor = 'rgba(0,0,0,.35)';
  X.shadowBlur = 18;
  rr(X, -pw / 2, -ph / 2, pw, ph, ph / 2);
  X.fill();
  X.shadowBlur = 0;
  X.fillStyle = o.dot ?? C.yellow;
  X.beginPath();
  X.arc(-pw / 2 + 30, 0, 9, 0, Math.PI * 2);
  X.fill();
  X.fillStyle = '#fff';
  X.textBaseline = 'middle';
  X.textAlign = 'center';
  X.fillText(text, 12, 2, pw - 60);
  X.restore();
}

export function bigX(X: Ctx, x: number, y: number, s: number, p: number) {
  if (p <= 0) return;
  X.save();
  X.translate(x, y);
  X.scale(s * p, s * p);
  X.lineCap = 'round';
  (
    [
      ['#fff', 58],
      [C.red, 40],
    ] as const
  ).forEach(([col, w]) => {
    X.strokeStyle = col;
    X.lineWidth = w;
    X.beginPath();
    X.moveTo(-150, -150);
    X.lineTo(150, 150);
    X.moveTo(150, -150);
    X.lineTo(-150, 150);
    X.stroke();
  });
  X.restore();
}

export function check(X: Ctx, x: number, y: number, s: number, p: number) {
  if (p <= 0) return;
  X.save();
  X.translate(x, y);
  X.scale(s * back(p), s * back(p));
  ell(X, 0, 0, 44, 44, C.green);
  X.strokeStyle = '#fff';
  X.lineWidth = 12;
  X.lineCap = 'round';
  X.beginPath();
  X.moveTo(-20, 2);
  X.lineTo(-4, 18);
  X.lineTo(22, -14);
  X.stroke();
  X.restore();
}

export function stamp(
  X: Ctx,
  txt: string,
  x: number,
  y: number,
  t0: number,
  t: number,
  col: string = C.red,
  fs = 60,
) {
  if (t < t0) return;
  const p = clamp((t - t0) / 0.2);
  X.save();
  X.translate(x, y);
  X.rotate(-0.18);
  X.scale(lerp(1.8, 1, p), lerp(1.8, 1, p));
  X.globalAlpha = p;
  X.font = font(fs);
  const w = X.measureText(txt).width + 60;
  X.strokeStyle = col;
  X.lineWidth = 10;
  rr(X, -w / 2, -fs * 0.87, w, fs * 1.73, 16);
  X.stroke();
  X.fillStyle = col;
  X.textAlign = 'center';
  X.textBaseline = 'middle';
  X.fillText(txt, 0, 6);
  X.restore();
}

export function dateBadge(X: Ctx, txt: string, x: number, y: number, t0: number, t: number) {
  pill(X, txt, x, y, t0, t, { bg: C.red, dot: '#fff', fs: 40 });
}

/** Outlined label (white fill, black stroke) — for small on-object captions. */
export function label(
  X: Ctx,
  txt: string,
  x: number,
  y: number,
  fs = 38,
  col = '#fff',
  maxW = 1000,
) {
  X.save();
  X.font = font(fs);
  X.textAlign = 'center';
  X.textBaseline = 'middle';
  X.lineJoin = 'round';
  X.lineWidth = fs * 0.22;
  X.strokeStyle = '#000';
  X.strokeText(txt, x, y, maxW);
  X.fillStyle = col;
  X.fillText(txt, x, y, maxW);
  X.restore();
}

/** Bounce-in scale helper for staggered entries. */
export const pop = (t: number, t0: number, dur = 0.3) => back(clamp((t - t0) / dur));
