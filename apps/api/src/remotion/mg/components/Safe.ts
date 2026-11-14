import { type Ctx, C, bigX, check, ell, glow, pop, prog, rr } from '../lib';
import type { ComponentDef } from './types';

export function safe(X: Ctx, x: number, y: number, s: number, t: number) {
  X.save();
  X.translate(x, y);
  X.scale(s, s);
  X.fillStyle = '#4A5560';
  rr(X, -220, -240, 440, 480, 30);
  X.fill();
  X.fillStyle = '#5E6B78';
  rr(X, -180, -200, 360, 400, 20);
  X.fill();
  ell(X, 0, 0, 90, 90, '#333C45');
  X.save();
  X.rotate(t * 0.8);
  X.strokeStyle = '#C9D2DC';
  X.lineWidth = 12;
  for (let k = 0; k < 3; k++) {
    X.rotate((Math.PI * 2) / 3);
    X.beginPath();
    X.moveTo(0, 0);
    X.lineTo(0, -80);
    X.stroke();
  }
  X.restore();
  ell(X, 0, 0, 26, 26, '#C9D2DC');
  X.restore();
}

export const Safe: ComponentDef<{ secured?: boolean }> = {
  pillY: 1420,
  draw(X, t, props) {
    glow(X, 540, 1000, 420, '255,255,255', 0.08);
    const s = 1.05 * pop(t, 0.05, 0.35);
    // Door swings shut in the first second.
    const shut = prog(t, 0.2, 0.9);
    safe(X, 540, 1000, s, t * (1 - shut * 0.7));
    if (props.secured !== false) check(X, 540 + 150 * s, 1000 - 170 * s, 1, prog(t, 1.2, 1.5));
    else bigX(X, 540, 1000, 0.6, pop(t, 1.2));
    void C;
  },
};
