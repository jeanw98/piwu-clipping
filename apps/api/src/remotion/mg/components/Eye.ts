import { type Ctx, C, ell, glow, label, pop } from '../lib';
import type { ComponentDef } from './types';

/** Port of nvidia `eye`: surveillance eye with moving red pupil. */
export function eye(X: Ctx, x: number, y: number, s: number, t: number) {
  X.save();
  X.translate(x, y);
  X.scale(s, s);
  ell(X, 0, 0, 170, 170, 'rgba(255,59,59,.15)');
  X.fillStyle = '#fff';
  X.beginPath();
  X.moveTo(-140, 0);
  X.quadraticCurveTo(0, -110, 140, 0);
  X.quadraticCurveTo(0, 110, -140, 0);
  X.fill();
  const px = Math.sin(t * 1.5) * 30;
  ell(X, px, 0, 52, 52, C.red);
  ell(X, px, 0, 22, 22, '#111');
  X.restore();
}

export const Eye: ComponentDef<{ label?: string }> = {
  dim: 0.2,
  draw(X, t, props) {
    glow(X, 540, 980, 520, '255,59,59', 0.25);
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.6 + i / 3) % 1;
      X.strokeStyle = `rgba(255,59,59,${0.5 * (1 - ph)})`;
      X.lineWidth = 6;
      X.beginPath();
      X.arc(540, 980, 260 + ph * 300, 0, Math.PI * 2);
      X.stroke();
    }
    eye(X, 540, 980, 1.6 * pop(t, 0.05, 0.35), t);
    if (props.label) label(X, props.label.toUpperCase(), 540, 1380, 42);
  },
};
