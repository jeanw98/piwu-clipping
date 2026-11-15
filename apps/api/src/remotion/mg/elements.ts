import type { MotionGraphicsElement } from '@piwu/shared';
import { host } from './components/Host';
import { getImage } from './images';
import { type Ctx, H, W, back, clamp, ell } from './lib';

/**
 * Scene elements: library objects and the parametric character, placed on
 * the scenery and animated with code presets. (x, y) is the bottom-center
 * point the element stands on.
 */

/** Base size of a library object at scale 1 (px). */
const BASE = 400;

function placement(el: MotionGraphicsElement) {
  return {
    x: clamp(el.x, 0.08, 0.92) * W,
    y: clamp(el.y, 0.3, 0.94) * H,
    scale: el.scale ?? 1,
  };
}

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
) {
  if (!elements?.length) return;
  // Back to front: higher y (closer to camera) drawn last.
  const ordered = elements
    .map((el, i) => ({ el, i }))
    .sort((a, b) => a.el.y - b.el.y);
  for (const { el, i } of ordered) {
    const local = lt - (el.delay ?? 0);
    if (local < 0) continue;
    const { x, y, scale } = placement(el);
    const { dx, dy, rot, k } = animate(el, local, i + 1);
    if (k <= 0.001) continue;
    if ('character' in el) {
      const s = 0.9 * scale * k;
      shadow(X, x + dx, y, 320 * scale);
      X.save();
      if (el.flip) {
        X.translate(x + dx, 0);
        X.scale(-1, 1);
        X.translate(-(x + dx), 0);
      }
      X.translate(x + dx, y + dy);
      X.rotate(rot);
      host(X, 0, 0, s, el.character.pose, local, el.character);
      X.restore();
      continue;
    }
    const image = getImage(el.src);
    if (!image) continue;
    const size = BASE * scale;
    shadow(X, x + dx, y, size);
    X.save();
    X.translate(x + dx, y + dy);
    X.rotate(rot);
    X.scale(k * (el.flip ? -1 : 1), k);
    X.drawImage(image, -size / 2, -size, size, size);
    X.restore();
  }
}
