import {
  MG_THEME_ACCENT,
  type MotionGraphicsSpec,
  type MotionGraphicsTiming,
} from '@piwu/shared';
import { BACKGROUNDS } from './backgrounds';
import { COMPONENTS } from './components';
import {
  C,
  type Ctx,
  H,
  W,
  back,
  clamp,
  dateBadge,
  drawLines,
  ease,
  easeOut,
  font,
  headline,
  lerp,
  pill,
  rr,
  toWords,
  vignette,
  wrapWords,
  zoom,
} from './lib';

/**
 * Pure per-frame drawing for Motion Graphics. Used by the Remotion
 * composition (one CanvasLayer per layer) and by mg:preview stills.
 *
 * Layers: live background → hero object (glow/shadow) → secondary items →
 * text → vignette.
 */

/** Global scene indices (intro = 0) that enter with the white diagonal cut. */
export const DIAGONAL_CUT_SCENES = [2, 5, 7];
export const CUT_SEC = 0.4;
const HEADLINE_Y = 440;
const DATE_Y = 565;
const CAPTION_Y = 1150;

export function sceneAt(timing: MotionGraphicsTiming, t: number): number {
  if (t < timing.intro[1]) return -1;
  const i = timing.scenes.findIndex(([a, b]) => t >= a && t < b);
  return i < 0 ? timing.scenes.length - 1 : i;
}

function seedFor(index: number) {
  return 1000 + index * 97;
}

export function drawBackground(
  X: Ctx,
  spec: MotionGraphicsSpec,
  timing: MotionGraphicsTiming,
  t: number,
) {
  const i = sceneAt(timing, t);
  const dim =
    i < 0 ? 0.25 : (COMPONENTS[spec.scenes[i].component]?.dim ?? 0.1);
  BACKGROUNDS[spec.theme](X, t, dim);
}

/** Hero + secondary + headline for scene `i` at local time `lt`. */
export function drawSceneContent(
  X: Ctx,
  spec: MotionGraphicsSpec,
  i: number,
  lt: number,
  dur: number,
) {
  const scene = spec.scenes[i];
  const def = COMPONENTS[scene.component] ?? COMPONENTS.TitleCard;
  const accent = MG_THEME_ACCENT[spec.theme];
  X.save();
  // Something always moves: slow camera push.
  zoom(X, 1 + lt * 0.02, 540, 1000);
  try {
    def.draw(X, lt, scene.props as Record<string, unknown>, accent, {
      dur,
      seed: seedFor(i),
    });
  } catch {
    COMPONENTS.TitleCard.draw(X, lt, {}, accent, { dur, seed: seedFor(i) });
  }
  X.restore();
  const p = scene.props as { pill?: string; date?: string };
  if (p.date) dateBadge(X, p.date.toUpperCase(), W / 2, DATE_Y, 0.1, lt);
  if (p.pill) {
    const y = def.pillY ?? (p.date ? 660 : 640);
    pill(X, p.pill.toUpperCase(), W / 2, y, 0.45, lt, { fs: p.pill.length > 30 ? 30 : 36 });
  }
  headline(X, scene.headline, HEADLINE_Y, 0.08, lt, scene.headline.length > 1 ? 92 : 104);
}

/** Whole scene layer (background redrawn only inside the diagonal cut). */
export function drawSceneLayer(
  X: Ctx,
  spec: MotionGraphicsSpec,
  timing: MotionGraphicsTiming,
  i: number,
  t: number,
) {
  const [s0, s1] = timing.scenes[i];
  const lt = t - s0;
  drawSceneContent(X, spec, i, lt, s1 - s0);
  const globalIndex = i + 1;
  if (DIAGONAL_CUT_SCENES.includes(globalIndex) && i > 0 && lt < CUT_SEC) {
    const p = ease(lt / CUT_SEC);
    const xp = lerp(-500, W + 500, p);
    const k = 0.45;
    const [p0, p1] = timing.scenes[i - 1];
    X.save();
    X.beginPath();
    X.moveTo(xp, 0);
    X.lineTo(W + 600, 0);
    X.lineTo(W + 600, H);
    X.lineTo(xp - k * H, H);
    X.closePath();
    X.clip();
    const prevDim = COMPONENTS[spec.scenes[i - 1].component]?.dim ?? 0.1;
    BACKGROUNDS[spec.theme](X, p1 - 0.001, prevDim);
    drawSceneContent(X, spec, i - 1, p1 - p0 - 0.001, p1 - p0);
    X.restore();
    X.save();
    X.shadowColor = '#fff';
    X.shadowBlur = 40;
    X.strokeStyle = '#fff';
    X.lineWidth = 36;
    X.beginPath();
    X.moveTo(xp, 0);
    X.lineTo(xp - k * H, H);
    X.stroke();
    X.restore();
  }
}

/** Intro: kicker banner ("¿QUÉ PASARÍA SI") + topic lines + white flash. */
export function drawIntro(
  X: Ctx,
  spec: MotionGraphicsSpec,
  timing: MotionGraphicsTiming,
  t: number,
) {
  const end = timing.intro[1];
  // Hero teaser: first scene's object, small, at the bottom.
  X.save();
  X.translate(540, 1420);
  X.scale(0.55, 0.55);
  X.translate(-540, -1000);
  const first = spec.scenes[0];
  const def = COMPONENTS[first.component] ?? COMPONENTS.TitleCard;
  try {
    // Teaser shows only the hero object: no ticker / pills / dates.
    const { ticker: _ticker, pill: _pill, date: _date, ...heroProps } =
      first.props as Record<string, unknown>;
    def.draw(X, t + 2, heroProps, MG_THEME_ACCENT[spec.theme], {
      dur: 6,
      seed: seedFor(0),
    });
  } catch {
    /* teaser is decorative */
  }
  X.restore();

  const [kicker, ...lines] = spec.intro.lines;
  const p1 = back(clamp(t / 0.28));
  X.save();
  X.translate(W / 2, 600);
  X.scale(p1, p1);
  X.font = font(76);
  const kw = Math.min(960, X.measureText(kicker[0].toUpperCase()).width + 110);
  X.fillStyle = C.yellow;
  rr(X, -kw / 2, -74, kw, 148, 40);
  X.fill();
  X.textAlign = 'center';
  X.textBaseline = 'middle';
  X.fillStyle = C.navy;
  X.fillText(kicker[0].toUpperCase(), 0, 6, 900);
  X.restore();

  lines.forEach(([text, k], idx) => {
    const t0 = 0.5 + idx * 0.22;
    if (t < t0) return;
    const p = back(clamp((t - t0) / 0.28));
    const size = text.length > 14 ? 96 : 104;
    const words = wrapWords(X, toWords(text.toUpperCase(), k.toUpperCase()), font(size), 980);
    drawLines(X, words, font(size), W / 2, 790 + idx * 128, size * 1.1, size * 0.17, p);
  });

  if (end > 0.6 && t > end - 0.25) {
    X.fillStyle = `rgba(255,255,255,${clamp((t - (end - 0.25)) / 0.25) * 0.85})`;
    X.fillRect(0, 0, W, H);
  }
}

/** Captions (keyword yellow, 110→100% zoom in 0.12 s) + vignette + disclaimer. */
export function drawOverlay(
  X: Ctx,
  spec: MotionGraphicsSpec,
  timing: MotionGraphicsTiming,
  t: number,
) {
  vignette(X, sceneAt(timing, t) === timing.scenes.length - 1 ? 0.6 : 0.45);
  if (t >= timing.intro[1]) {
    const k = timing.cues.findIndex(([a, b]) => t >= a && t < b);
    if (k > 0) {
      const [text, kw] = spec.cues[k];
      const p = clamp((t - timing.cues[k][0]) / 0.12);
      const sc = lerp(1.1, 1, easeOut(p));
      const lines = wrapWords(X, toWords(text, kw), font(57), 900);
      drawLines(X, lines, font(57), W / 2, CAPTION_Y, 74, 12, sc);
    }
  }
  const last = timing.scenes.at(-1);
  if (spec.disclaimer && last && t >= last[0]) {
    X.save();
    X.globalAlpha = clamp((t - last[0]) / 0.4) * 0.8;
    X.font = font(26);
    X.textAlign = 'center';
    X.fillStyle = '#fff';
    X.fillText(spec.disclaimer, W / 2, 1260, 900);
    X.restore();
  }
}

/** Full composite frame (preview / tests). */
export function drawFrame(
  X: Ctx,
  spec: MotionGraphicsSpec,
  timing: MotionGraphicsTiming,
  t: number,
) {
  X.setTransform(1, 0, 0, 1, 0, 0);
  X.clearRect(0, 0, W, H);
  drawBackground(X, spec, timing, t);
  const i = sceneAt(timing, t);
  if (i < 0) drawIntro(X, spec, timing, t);
  else drawSceneLayer(X, spec, timing, i, t);
  drawOverlay(X, spec, timing, t);
}
