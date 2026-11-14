import { type Ctx, hexToRgb, label, lerp, pop, rr } from '../lib';
import { chip } from './Chip';
import type { ComponentDef } from './types';

export function building(X: Ctx, x: number, base: number, s: number, accentRgb: string) {
  X.save();
  X.translate(x, base);
  X.scale(s, s);
  X.fillStyle = '#24302A';
  X.fillRect(-130, -420, 260, 420);
  for (let r = 0; r < 8; r++)
    for (let k = 0; k < 4; k++) {
      X.fillStyle = `rgba(${accentRgb},.55)`;
      X.fillRect(-105 + k * 58, -395 + r * 48, 34, 26);
    }
  X.restore();
}

function boxChip(X: Ctx, x: number, y: number, s: number, accent: string) {
  X.save();
  X.translate(x, y);
  X.scale(s, s);
  X.fillStyle = '#C9A26A';
  rr(X, -60, -50, 120, 100, 8);
  X.fill();
  X.fillStyle = '#A9844F';
  X.fillRect(-60, -12, 120, 16);
  chip(X, 0, -6, 0.16, 0, accent, '', 0);
  X.restore();
}

export const Building: ComponentDef<{ label: string; shipments?: boolean }> = {
  draw(X, t, props, accent) {
    const rgb = hexToRgb(accent);
    building(X, 780, 1500, 1.15 * pop(t, 0.05, 0.35), rgb);
    if (t > 0.3) label(X, props.label.toUpperCase(), 780, 1560, 40);
    if (props.shipments !== false) {
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.7 + i / 4) % 1;
        if (t < 0.4 + i * 0.2) continue;
        boxChip(X, lerp(150, 640, ph), lerp(1400, 1180, ph) - Math.sin(ph * Math.PI) * 220, 0.95, accent);
      }
    }
  },
};

