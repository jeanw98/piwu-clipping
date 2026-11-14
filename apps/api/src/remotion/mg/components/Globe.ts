import { type Ctx, C, ell, label, lg, pop, rng } from '../lib';
import type { ComponentDef } from './types';

/** Port of aliens `globe`, plus a pulsing pin at lat/lon. */
export function globe(X: Ctx, x: number, y: number, R: number, t: number) {
  ell(X, x, y, R + 30, R + 30, 'rgba(63,208,255,.15)');
  X.save();
  X.beginPath();
  X.arc(x, y, R, 0, Math.PI * 2);
  X.clip();
  X.fillStyle = lg(X, x - R, y - R, x + R, y + R, ['#2E8FE0', '#1B5FB5']);
  X.fillRect(x - R, y - R, 2 * R, 2 * R);
  const r = rng(30);
  for (let i = 0; i < 9; i++) {
    const bx = x - R + ((r() * 2 * R + t * 30) % (2 * R + 200)) - 100;
    const by = y - R * 0.7 + r() * R * 1.4;
    X.fillStyle = '#4CC07A';
    X.beginPath();
    X.ellipse(bx, by, 60 + r() * 90, 30 + r() * 60, r() * 3, 0, Math.PI * 2);
    X.fill();
  }
  X.strokeStyle = 'rgba(255,255,255,.18)';
  X.lineWidth = 3;
  for (let k = -2; k <= 2; k++) {
    X.beginPath();
    X.ellipse(x, y + (k * R) / 3, R * Math.cos(Math.asin(k / 3)), R * 0.12, 0, 0, Math.PI * 2);
    X.stroke();
  }
  X.restore();
  const gl = X.createRadialGradient(x - R * 0.4, y - R * 0.4, 10, x, y, R);
  gl.addColorStop(0, 'rgba(255,255,255,.25)');
  gl.addColorStop(1, 'rgba(0,0,0,.25)');
  ell(X, x, y, R, R, gl);
}

export const Globe: ComponentDef<{ place?: string; lat?: number; lon?: number }> = {
  draw(X, t, props) {
    const R = 340 * pop(t, 0, 0.4);
    globe(X, 540, 900, R, t);
    if (t < 0.5) return;
    // Front-facing projection: lon maps to x offset, lat to y (clamped inside).
    const lat = props.lat ?? 10;
    const lon = props.lon ?? 0;
    // The globe is turned so the place faces the camera; keep a small offset.
    const px = 540 + Math.sin((lon * Math.PI) / 180) * R * 0.25;
    const py = 900 - Math.sin((lat * Math.PI) / 180) * R * 0.85;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.8 + i / 3) % 1;
      X.strokeStyle = `rgba(255,210,63,${1 - ph})`;
      X.lineWidth = 6;
      X.beginPath();
      X.arc(px, py, 12 + ph * 110, 0, Math.PI * 2);
      X.stroke();
    }
    ell(X, px, py, 14, 14, C.yellow);
    if (props.place) label(X, props.place.toUpperCase(), px, py - 70, 46, C.yellow);
  },
};
