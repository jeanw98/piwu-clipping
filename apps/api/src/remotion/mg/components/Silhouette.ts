import { type Ctx, ell, font, label, lerp, pop } from '../lib';
import type { ComponentDef } from './types';

/** Port of nvidia `silhouette`: anonymous figure with coloured rim light. */
export function silhouette(X: Ctx, x: number, base: number, s: number, col = '#1F2A22', rim = '#76B900') {
  X.save();
  X.translate(x, base);
  X.scale(s, s);
  X.shadowColor = rim;
  X.shadowBlur = 24;
  X.fillStyle = col;
  X.beginPath();
  X.moveTo(-120, 0);
  X.quadraticCurveTo(-125, -250, -60, -290);
  X.lineTo(60, -290);
  X.quadraticCurveTo(125, -250, 120, 0);
  X.closePath();
  X.fill();
  ell(X, 0, -370, 70, 80, col);
  X.restore();
}

export const PINK = '#FF5A7A';

export const Silhouette: ComponentDef<{ label?: string; crowd?: boolean }> = {
  draw(X, t, props, accent) {
    const breathe = 1 + Math.sin(t * 2) * 0.01;
    silhouette(X, 540, 1560, 1.12 * pop(t, 0, 0.35) * breathe, '#1F2A22', accent);
    if (props.crowd) {
      [250, 830].forEach((x, i) => {
        const k = pop(t, 0.25 + i * 0.2);
        silhouette(X, x, 1600, 0.8 * k, '#2A1F24', PINK);
        if (t > 0.6 + i * 0.2) {
          X.save();
          X.font = font(120);
          X.textAlign = 'center';
          X.fillStyle = 'rgba(255,255,255,.9)';
          X.globalAlpha = Math.min(1, (t - 0.6 - i * 0.2) * 4);
          X.fillText('?', x, lerp(1200, 1180, Math.sin(t * 3 + i) * 0.5 + 0.5));
          X.restore();
        }
      });
    }
    if (props.label) label(X, props.label.toUpperCase(), 540, 1630, 40);
  },
};
