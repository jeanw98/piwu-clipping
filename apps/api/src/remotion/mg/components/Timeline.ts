import { C, ell, font, hexToRgb, label, pop, prog } from '../lib';
import type { ComponentDef } from './types';

/** Dates that advance left→right along a line. */
export const Timeline: ComponentDef<{ dates: string[]; labels: string[] }> = {
  draw(X, t, props, accent, info) {
    const n = Math.min(props.dates.length, props.labels.length);
    const x0 = 180;
    const x1 = 900;
    const y = 880;
    const p = prog(t, 0.2, Math.max(1.4, info.dur * 0.8));
    X.strokeStyle = 'rgba(255,255,255,.18)';
    X.lineWidth = 12;
    X.lineCap = 'round';
    X.beginPath();
    X.moveTo(x0, y);
    X.lineTo(x1, y);
    X.stroke();
    X.strokeStyle = accent;
    X.beginPath();
    X.moveTo(x0, y);
    X.lineTo(x0 + (x1 - x0) * p, y);
    X.stroke();
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0 : i / (n - 1);
      const x = x0 + (x1 - x0) * k;
      const reached = p >= k - 0.001;
      const tk = 0.2 + k * (Math.max(1.4, info.dur * 0.8) - 0.2);
      const s = reached ? pop(t, tk) : 0.6;
      ell(X, x, y, 30 * s, 30 * s, reached ? accent : '#2A3350');
      ell(X, x, y, 14 * s, 14 * s, reached ? '#fff' : '#3A4466');
      if (reached) {
        const pulse = (t * 1.2) % 1;
        X.strokeStyle = `rgba(${hexToRgb(accent)},${1 - pulse})`;
        X.lineWidth = 4;
        X.beginPath();
        X.arc(x, y, 30 + pulse * 40, 0, Math.PI * 2);
        X.stroke();
      }
      X.save();
      X.globalAlpha = reached ? 1 : 0.35;
      label(X, props.dates[i].toUpperCase(), x, y - (i % 2 ? -110 : 110), 40, reached ? C.yellow : '#fff', 300);
      X.font = font(30);
      label(X, props.labels[i].toUpperCase(), x, y - (i % 2 ? -165 : 165), 30, '#fff', 280);
      X.restore();
    }
  },
};
