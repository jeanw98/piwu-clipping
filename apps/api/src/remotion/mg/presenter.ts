import type {
  MotionGraphicsHostMood,
  MotionGraphicsHostSide,
  MotionGraphicsSpec,
  MotionGraphicsTiming,
} from '@piwu/shared';
import { getImage } from './images';
import { C, type Ctx, back, clamp, ease, ell, font, lerp } from './lib';

/**
 * On-screen presenter (what-if format): the user's character image (e.g. a
 * robot) standing at the bottom of the frame, "explaining" the video.
 *
 * It is one still image, so all life comes from transforms driven by the
 * voice and the scene directions:
 * - talking: squash & stretch on every spoken word (spec.presenter.talk)
 * - idle: float + breathing
 * - per-scene mood: explain / point / surprised / think / happy / worried
 * - hops to the other side when a scene asks for it
 *
 * Drawn on its own layer above the scenes and below the captions, so it stays
 * continuous across scene cuts. Deterministic (pure function of t).
 */

const FOOT_Y = 1885;
const BOX_H = 600;
const BOX_W = 470;
const SIDE_X: Record<MotionGraphicsHostSide, number> = { left: 245, right: 835 };
const HOP_SEC = 0.55;
const DEG = Math.PI / 180;

type Mood = MotionGraphicsHostMood | 'wave';

interface Direction {
  side: MotionGraphicsHostSide;
  mood: Mood;
  /** Empty scene (no hero, no elements): the presenter is the hero, centred and bigger. */
  center: boolean;
}

const CENTER_SCALE = 1.2;
const posX = (d: Direction) => (d.center ? 540 : SIDE_X[d.side]);

function directionFor(spec: MotionGraphicsSpec, i: number): Direction {
  if (i < 0) {
    return { side: spec.scenes[0]?.host?.side ?? 'right', mood: 'wave', center: false };
  }
  const scene = spec.scenes[i];
  const host = scene?.host;
  const center = Boolean(scene && scene.component === 'None' && !scene.elements?.length);
  return { side: host?.side ?? 'right', mood: host?.mood ?? 'explain', center };
}

function sceneIndexAt(timing: MotionGraphicsTiming, t: number): number {
  if (t < timing.intro[1]) return -1;
  const i = timing.scenes.findIndex(([a, b]) => t >= a && t < b);
  return i < 0 ? timing.scenes.length - 1 : i;
}

/** 0..1 bump while a word is being spoken (0 between words). */
export function talkAmount(talk: Array<[number, number]> | undefined, t: number): { bump: number; index: number } {
  if (!talk?.length) return { bump: 0, index: -1 };
  let lo = 0;
  let hi = talk.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [s, e] = talk[mid];
    if (t < s) hi = mid - 1;
    else if (t > e) lo = mid + 1;
    else {
      const p = clamp((t - s) / Math.max(0.06, e - s));
      return { bump: Math.sin(Math.PI * p), index: mid };
    }
  }
  return { bump: 0, index: -1 };
}

function star(X: Ctx, x: number, y: number, r: number, color: string) {
  X.save();
  X.translate(x, y);
  X.fillStyle = color;
  X.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const rad = k % 2 === 0 ? r : r * 0.32;
    X.lineTo(Math.sin(a) * rad, -Math.cos(a) * rad);
  }
  X.closePath();
  X.fill();
  X.restore();
}

function bubble(X: Ctx, x: number, y: number, s: number, text: string, bg: string, fg: string) {
  if (s <= 0.01) return;
  X.save();
  X.translate(x, y);
  X.scale(s, s);
  X.shadowColor = 'rgba(0,0,0,.3)';
  X.shadowBlur = 16;
  ell(X, 0, 0, 58, 58, bg);
  X.shadowBlur = 0;
  X.fillStyle = fg;
  X.font = font(76);
  X.textAlign = 'center';
  X.textBaseline = 'middle';
  X.fillText(text, 0, 6);
  X.restore();
}

/** Decorations that sell the mood (drawn next to the head, toward the centre). */
function drawMoodFx(
  X: Ctx,
  mood: Mood,
  lt: number,
  t: number,
  head: { x: number; y: number },
  toCenter: number,
  w: number,
) {
  const hx = head.x + toCenter * w * 0.32;
  const hy = head.y - 30;
  switch (mood) {
    case 'surprised': {
      const s = lt < 0.1 ? 0 : lt < 1.8 ? back(clamp((lt - 0.1) / 0.25)) : clamp(1 - (lt - 1.8) / 0.25);
      bubble(X, hx, hy - 20 + Math.sin(t * 9) * 4, s, '!', C.yellow, C.navy);
      break;
    }
    case 'think': {
      // Three thought dots rising toward the centre, then a "?".
      [0, 1, 2].forEach((k) => {
        const p = clamp((lt - 0.2 - k * 0.25) / 0.25);
        if (p <= 0) return;
        const r = (10 + k * 7) * back(p);
        ell(X, hx + toCenter * k * 34, hy + 40 - k * 46, r, r, 'rgba(255,255,255,.95)');
      });
      const q = clamp((lt - 1.0) / 0.3);
      bubble(X, hx + toCenter * 120, hy - 120 + Math.sin(t * 2.5) * 6, back(q), '?', '#FFFFFF', C.navy);
      break;
    }
    case 'happy': {
      if (lt > 2.2) break;
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3 + 0.4;
        const p = clamp((lt - k * 0.12) / 0.6);
        const fade = clamp(1 - (lt - 1.4 - k * 0.1) / 0.5);
        if (p <= 0 || fade <= 0) continue;
        const r = 140 + p * 70;
        X.save();
        X.globalAlpha = fade;
        star(X, head.x + Math.cos(a) * r, head.y + 60 - Math.sin(a) * r * 0.8, 18 + 10 * Math.sin(t * 8 + k), k % 2 ? C.yellow : '#FFFFFF');
        X.restore();
      }
      break;
    }
    case 'point': {
      // Pulsing chevrons toward the centre of the frame.
      const p = clamp((lt - 0.15) / 0.3);
      if (p <= 0) break;
      const baseX = head.x + toCenter * (w * 0.55);
      const y = head.y + 170;
      for (let k = 0; k < 3; k++) {
        const phase = (t * 2.2 - k * 0.22) % 1;
        const a = clamp(Math.sin(Math.PI * phase)) * p;
        X.save();
        X.globalAlpha = a;
        X.strokeStyle = C.yellow;
        X.lineWidth = 12;
        X.lineCap = 'round';
        X.lineJoin = 'round';
        const x = baseX + toCenter * k * 38;
        X.beginPath();
        X.moveTo(x - toCenter * 14, y - 26);
        X.lineTo(x + toCenter * 14, y);
        X.lineTo(x - toCenter * 14, y + 26);
        X.stroke();
        X.restore();
      }
      break;
    }
    case 'worried': {
      // Sweat drop sliding down, looping.
      const phase = (lt % 1.6) / 1.6;
      const a = phase < 0.8 ? clamp(phase / 0.15) : clamp(1 - (phase - 0.8) / 0.2);
      const x = head.x - toCenter * w * 0.3;
      const y = head.y + 40 + phase * 70;
      X.save();
      X.globalAlpha = a;
      X.fillStyle = '#7FD3FF';
      X.beginPath();
      X.moveTo(x, y - 30);
      X.quadraticCurveTo(x + 18, y, x, y + 14);
      X.quadraticCurveTo(x - 18, y, x, y - 30);
      X.fill();
      X.restore();
      break;
    }
    default:
      break;
  }
}

export function drawPresenter(
  X: Ctx,
  spec: MotionGraphicsSpec,
  timing: MotionGraphicsTiming,
  t: number,
) {
  const presenter = spec.presenter;
  if (!presenter) return;
  const image = getImage(presenter.src) as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!image || !image.width || !image.height) return;

  const i = sceneIndexAt(timing, t);
  const dir = directionFor(spec, i);
  const start = i < 0 ? 0 : timing.scenes[i][0];
  const lt = t - start;
  const prev = directionFor(spec, i - 1);

  const fit = Math.min(BOX_H / image.height, BOX_W / image.width);
  const base = { w: image.width * fit, h: image.height * fit };

  let x = posX(dir);
  let k = dir.center ? CENTER_SCALE : 1;
  let lift = 0;
  let rot = 0;
  let sx = 1;
  let sy = 1;
  const toCenter = dir.center ? 0 : dir.side === 'left' ? 1 : -1;

  // Hop to the new spot when the scene moves the presenter.
  const hopping = i >= 0 && posX(prev) !== posX(dir) && lt < HOP_SEC;
  if (hopping) {
    const p = ease(lt / HOP_SEC);
    const dx = Math.sign(posX(dir) - posX(prev));
    x = lerp(posX(prev), posX(dir), p);
    k = lerp(prev.center ? CENTER_SCALE : 1, k, p);
    lift += Math.sin(Math.PI * p) * 120;
    rot += Math.sin(Math.PI * p) * 10 * DEG * dx;
  } else if (i >= 0 && lt < 0.22) {
    // Small anticipation squash on every cut.
    const p = Math.sin(Math.PI * (lt / 0.22));
    sy -= 0.06 * p;
    sx += 0.04 * p;
  }

  const w = base.w * k;
  const h = base.h * k;

  // Entrance from below in the intro.
  if (t < 0.7) {
    lift -= (1 - back(clamp(t / 0.7))) * (h + 120);
  }

  // Idle float + breathing.
  lift += 6 + Math.sin(t * 2.4) * 8;
  sy += Math.sin(t * 2.4 + 1) * 0.012;

  // Talking: squash & stretch on every word.
  const talk = talkAmount(presenter.talk, t);
  if (talk.bump > 0) {
    sy += 0.045 * talk.bump;
    sx -= 0.022 * talk.bump;
    rot += Math.sin(talk.index * 1.7) * 1.8 * DEG * talk.bump;
    lift += 6 * talk.bump;
  }

  // Mood.
  switch (dir.mood) {
    case 'wave':
      rot += Math.sin(t * 6) * 6 * DEG;
      break;
    case 'explain':
      rot += (2 * toCenter + Math.sin(t * 1.6) * 2.5) * DEG;
      break;
    case 'point':
      rot += (7 * toCenter + Math.sin(t * 3) * 1.5) * DEG;
      x += toCenter * (14 + Math.sin(t * 3) * 8);
      break;
    case 'surprised':
      if (lt < 0.5) {
        const p = lt / 0.5;
        lift += Math.sin(Math.PI * p) * 110;
        const pop = 0.14 * (1 - p);
        sx += pop;
        sy += pop;
      } else if (lt < 0.9) {
        rot += Math.sin(lt * 50) * 2.5 * DEG * (1 - (lt - 0.5) / 0.4);
      }
      rot -= 3 * toCenter * DEG;
      break;
    case 'think':
      rot += Math.sin(t * 0.9) * 5 * DEG;
      break;
    case 'happy':
      if (lt < 0.9) lift += Math.abs(Math.sin((lt / 0.45) * Math.PI)) * 60;
      rot += Math.sin(t * 4) * 4 * DEG;
      break;
    case 'worried':
      x += lt < 0.8 ? Math.sin(lt * 40) * 6 : Math.sin(t * 25) * 1.5;
      sy -= 0.02;
      break;
  }

  // Ground shadow (shrinks while in the air).
  const air = clamp(lift / 260);
  X.save();
  X.globalAlpha = 0.35 * (1 - air * 0.6) * clamp((t - 0.1) / 0.4);
  ell(X, x, FOOT_Y - 4, w * 0.36 * (1 - air * 0.35), 22 * (1 - air * 0.35), '#000');
  X.restore();

  // The presenter itself, pivoting on its feet.
  X.save();
  X.translate(x, FOOT_Y - lift);
  X.rotate(rot);
  X.scale(sx, sy);
  X.shadowColor = 'rgba(0,0,0,.35)';
  X.shadowBlur = 26;
  X.shadowOffsetY = 12;
  X.drawImage(image, -w / 2, -h, w, h);
  X.restore();

  if (i >= 0 && !hopping) {
    const head = { x, y: FOOT_Y - lift - h * sy };
    drawMoodFx(X, dir.mood, lt, t, head, toCenter || 1, w);
  }
}
