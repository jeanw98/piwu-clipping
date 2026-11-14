import { type Ctx, H, W, ell, font, glow, hexToRgb, label, pop, rng } from '../lib';
import type { ComponentDef } from './types';

/** Fallback: pulsing accent rings + orbiting particles + optional label. */
export const TitleCard: ComponentDef<{ label?: string }> = {
  dim: 0.15,
  draw(X: Ctx, t, props, accent, info) {
    const rgb = hexToRgb(accent);
    const cx = W / 2;
    const cy = 1000;
    glow(X, cx, cy, 460, rgb, 0.35);
    for (let i = 0; i < 4; i++) {
      const ph = (t * 0.5 + i / 4) % 1;
      X.strokeStyle = `rgba(${rgb},${0.6 * (1 - ph)})`;
      X.lineWidth = 8;
      X.beginPath();
      X.arc(cx, cy, 120 + ph * 360, 0, Math.PI * 2);
      X.stroke();
    }
    const s = pop(t, 0.05) * (1 + 0.03 * Math.sin(t * 3));
    X.save();
    X.translate(cx, cy);
    X.scale(s, s);
    ell(X, 0, 0, 170, 170, accent);
    ell(X, 0, 0, 140, 140, '#0E1424');
    X.restore();
    const r = rng(info.seed);
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2 + t * (0.3 + r() * 0.5);
      const d = 230 + r() * 200;
      ell(X, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 5 + r() * 5, 5 + r() * 5, `rgba(${rgb},${0.4 + r() * 0.4})`);
    }
    if (props.label && t > 0.2) {
      X.save();
      X.translate(cx, cy);
      const k = pop(t, 0.2);
      X.scale(k, k);
      X.font = font(54);
      label(X, props.label.toUpperCase(), 0, 0, props.label.length > 10 ? 40 : 56, '#fff');
      X.restore();
    }
    void H;
  },
};
