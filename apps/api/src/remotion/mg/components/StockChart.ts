import { type Ctx, C, ell, font, label, prog, rr } from '../lib';
import type { ComponentDef } from './types';

/** Port of nvidia `stock`, rising or falling. */
export function stock(X: Ctx, x0: number, y0: number, w: number, h: number, p: number, dir: 'up' | 'down') {
  X.save();
  X.fillStyle = 'rgba(0,0,0,.45)';
  rr(X, x0 - 20, y0 - 20, w + 40, h + 40, 20);
  X.fill();
  X.strokeStyle = 'rgba(255,255,255,.15)';
  X.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    X.beginPath();
    X.moveTo(x0, y0 + (i * h) / 4);
    X.lineTo(x0 + w, y0 + (i * h) / 4);
    X.stroke();
  }
  const col = dir === 'down' ? C.red : C.green;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 40; i++) {
    const k = i / 40;
    let v = 0.25 + Math.sin(i * 1.3) * 0.04;
    if (k > 0.55) v += (k - 0.55) * 1.1 + Math.sin(i * 2.1) * 0.03;
    if (dir === 'up') v = 1 - v;
    pts.push([x0 + k * w, y0 + v * h]);
  }
  const n = Math.floor(p * 40);
  X.strokeStyle = col;
  X.lineWidth = 8;
  X.lineJoin = 'round';
  X.beginPath();
  for (let i = 0; i <= n; i++) X.lineTo(pts[i][0], pts[i][1]);
  X.stroke();
  if (n > 0) {
    const [a, b] = pts[n];
    ell(X, a, b, 12 + Math.sin(p * 30) * 2, 12, col);
  }
  X.restore();
  return pts[n];
}

export const StockChart: ComponentDef<{ direction: 'up' | 'down'; label?: string; value?: string }> = {
  dim: 0.2,
  draw(X, t, props, _accent, info) {
    const p = prog(t, 0.3, Math.max(1.5, info.dur - 0.8));
    const [ex, ey] = stock(X, 140, 900, 800, 420, p, props.direction);
    if (props.label) {
      X.save();
      X.font = font(40);
      X.textAlign = 'left';
      X.fillStyle = 'rgba(255,255,255,.85)';
      X.fillText(props.label.toUpperCase(), 140, 860);
      X.restore();
    }
    // Big arrow
    X.save();
    X.translate(880, 820);
    X.rotate(props.direction === 'down' ? Math.PI * 0.75 : -Math.PI * 0.25);
    X.fillStyle = props.direction === 'down' ? C.red : C.green;
    X.globalAlpha = Math.min(1, t * 3);
    X.beginPath();
    X.moveTo(0, -60);
    X.lineTo(50, 10);
    X.lineTo(18, 10);
    X.lineTo(18, 60);
    X.lineTo(-18, 60);
    X.lineTo(-18, 10);
    X.lineTo(-50, 10);
    X.closePath();
    X.fill();
    X.restore();
    if (props.value && p > 0.98) label(X, props.value, Math.min(ex, 860), ey - 60, 52, props.direction === 'down' ? C.red : C.green);
  },
};
