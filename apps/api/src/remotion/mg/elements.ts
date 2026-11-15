import type { MotionGraphicsAction, MotionGraphicsElement } from '@piwu/shared';
import { host } from './components/Host';
import { getImage } from './images';
import { type Effect, type LayoutOptions, elementSize, sceneState } from './interactions';
import { C, type Ctx, H, W, back, clamp, ell, font, rr } from './lib';

/**
 * Scene elements: library objects and the parametric character, placed on
 * the scenery and animated with code presets. (x, y) is the bottom-center
 * point the element stands on.
 */

/** Base size of a library object at scale 1 (px). */
const BASE = 400;

/** Offset / rotation / scale for an animation preset at local time `lt`. */
function animate(el: MotionGraphicsElement, lt: number, seed: number) {
  const enter = back(clamp(lt / 0.35));
  let dx = 0;
  let dy = 0;
  let rot = 0;
  let k = enter;
  const ph = seed * 1.7;
  switch (el.anim) {
    case 'none':
      k = 1;
      break;
    case 'bounce':
      dy = -Math.abs(Math.sin(lt * 4 + ph)) * 40;
      break;
    case 'sway':
      rot = Math.sin(lt * 1.6 + ph) * 0.07;
      break;
    case 'float':
      dy = Math.sin(lt * 2 + ph) * 16;
      break;
    case 'walk':
      dx = Math.sin(lt * 0.6 + ph) * 120;
      dy = -Math.abs(Math.sin(lt * 7 + ph)) * 12;
      k = 1;
      break;
    case 'drive': {
      const p = clamp(lt / 0.9);
      dx = (1 - (1 - Math.pow(1 - p, 3))) * (el.flip ? -W : W) * -0.9;
      dy = p >= 1 ? -Math.abs(Math.sin(lt * 12)) * 3 : 0;
      k = 1;
      break;
    }
    case 'pulse':
      k = enter * (1 + 0.06 * Math.sin(lt * 5 + ph));
      break;
    case 'spin':
      rot = lt * 1.5;
      break;
    case 'shake':
      dx = Math.sin(lt * 40 + ph) * 6;
      break;
    case 'fall':
      dy = -(1 - Math.min(1, back(clamp(lt / 0.6)))) * 900;
      k = 1;
      break;
    case 'rise':
      dy = (1 - Math.min(1, back(clamp(lt / 0.6)))) * 700;
      k = 1;
      break;
    default:
      break;
  }
  return { dx, dy, rot, k };
}

function shadow(X: Ctx, x: number, y: number, w: number) {
  if (y < 1250) return;
  ell(X, x, y + 4, w * 0.38, w * 0.08, 'rgba(0,0,0,.22)');
}

export function drawElements(
  X: Ctx,
  elements: MotionGraphicsElement[] | undefined,
  lt: number,
  actions?: MotionGraphicsAction[],
  opts: LayoutOptions = {},
) {
  if (!elements?.length) return;
  const { states, effects } = sceneState(elements, actions, lt, opts);
  // Back to front: higher y (closer to camera) drawn last.
  const ordered = elements
    .map((el, i) => ({ el, i, st: states[i] }))
    .sort((a, b) => a.st.y - b.st.y);
  for (const { el, i, st } of ordered) {
    const local = lt - (el.delay ?? 0);
    if (local < 0 && st.pop >= 1) continue;
    const motion = animate(el, Math.max(0, local), i + 1);
    // Under an action the element moves by the action, not by its preset drift.
    const dx = (st.moving ? 0 : motion.dx) + st.shake;
    const k = (local < 0 ? 0 : motion.k) * st.pop;
    if (k <= 0.001) continue;
    const flip = st.facing !== undefined ? st.facing < 0 !== Boolean(el.flip) : Boolean(el.flip);
    const x = st.x + dx;
    const y = st.y + motion.dy;
    // Same size the layout guard used (capped, smaller in compact scenes).
    const scale = (elementSize(el, opts) / ('character' in el ? 560 : 400)) * st.scale;
    if ('character' in el) {
      shadow(X, x, st.y, 320 * scale);
      X.save();
      X.translate(x, y);
      if (flip) X.scale(-1, 1);
      X.rotate(motion.rot);
      host(
        X,
        0,
        0,
        0.9 * scale * k,
        (st.pose as typeof el.character.pose) ?? el.character.pose,
        Math.max(0, local),
        el.character,
      );
      X.restore();
      continue;
    }
    const image = getImage(st.src ?? el.src);
    if (!image) continue;
    const size = BASE * scale;
    shadow(X, x, st.y, size);
    X.save();
    X.translate(x, y);
    X.rotate(motion.rot);
    X.scale(k * (flip ? -1 : 1), k);
    X.drawImage(image, -size / 2, -size, size, size);
    X.restore();
  }
  drawEffects(X, effects);
}

function drawEffects(X: Ctx, effects: Effect[]) {
  for (const fx of effects) {
    if (fx.kind === 'projectile') {
      const image = getImage(fx.src);
      X.save();
      X.translate(fx.x, fx.y);
      X.rotate(fx.rot);
      if (image) X.drawImage(image, -fx.size / 2, -fx.size / 2, fx.size, fx.size);
      else ell(X, 0, 0, 26, 26, C.yellow);
      X.restore();
    } else if (fx.kind === 'burst') {
      const p = clamp(fx.age / 0.5);
      X.save();
      X.translate(fx.x, fx.y);
      X.globalAlpha = 1 - p;
      X.strokeStyle = C.yellow;
      X.lineCap = 'round';
      X.lineWidth = 12 * (1 - p) + 2;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const r0 = 40 + p * 90;
        const r1 = r0 + 50 * (1 - p) + 10;
        X.beginPath();
        X.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        X.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
        X.stroke();
      }
      ell(X, 0, 0, 34 * (1 - p), 34 * (1 - p), '#FFFFFF');
      X.restore();
    } else if (fx.kind === 'bubble') {
      const inK = back(clamp(fx.age / 0.25));
      const outK = clamp((fx.dur - fx.age) / 0.2);
      const k = Math.min(inK, outK);
      if (k <= 0) continue;
      X.save();
      X.translate(clamp(fx.x, 240, W - 240), Math.max(560, fx.y));
      X.scale(k, k);
      X.font = font(54);
      const tw = Math.min(760, X.measureText(fx.text.toUpperCase()).width + 80);
      X.fillStyle = '#FFFFFF';
      X.shadowColor = 'rgba(0,0,0,.3)';
      X.shadowBlur = 16;
      rr(X, -tw / 2, -136, tw, 112, 46);
      X.fill();
      X.beginPath();
      X.moveTo(-24, -26);
      X.lineTo(0, 10);
      X.lineTo(24, -26);
      X.fill();
      X.shadowBlur = 0;
      X.fillStyle = C.navy;
      X.textAlign = 'center';
      X.textBaseline = 'middle';
      X.fillText(fx.text.toUpperCase(), 0, -78, tw - 40);
      X.restore();
    }
  }
}
