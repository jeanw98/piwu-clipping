import { type Ctx, C, H, W, font, hexToRgb, rr, zoom } from '../lib';
import type { ComponentDef } from './types';

/** Port of nvidia `chip`: processor with pulsing border and glow. */
export function chip(X: Ctx, x: number, y: number, s: number, t: number, accent: string, text = 'IA', glowA = 1) {
  const rgb = hexToRgb(accent);
  X.save();
  X.translate(x, y);
  X.scale(s, s);
  if (glowA) {
    const g = X.createRadialGradient(0, 0, 40, 0, 0, 320);
    g.addColorStop(0, `rgba(${rgb},${0.45 * glowA})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    X.fillStyle = g;
    X.fillRect(-340, -340, 680, 680);
  }
  X.fillStyle = '#B8C2B0';
  for (let i = -4; i <= 4; i++) {
    X.fillRect(i * 36 - 6, -230, 12, 40);
    X.fillRect(i * 36 - 6, 190, 12, 40);
    X.fillRect(-230, i * 36 - 6, 40, 12);
    X.fillRect(190, i * 36 - 6, 40, 12);
  }
  X.fillStyle = '#1C2A1F';
  rr(X, -195, -195, 390, 390, 30);
  X.fill();
  X.fillStyle = '#2C3D2F';
  rr(X, -150, -150, 300, 300, 20);
  X.fill();
  X.strokeStyle = accent;
  X.lineWidth = 4;
  X.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4);
  rr(X, -150, -150, 300, 300, 20);
  X.stroke();
  X.globalAlpha = 1;
  X.font = font(text.length > 3 ? 48 : 64);
  X.textAlign = 'center';
  X.textBaseline = 'middle';
  X.fillStyle = `rgba(${rgb},1)`;
  X.fillText(text, 0, 4, 280);
  X.restore();
}

export const Chip: ComponentDef<{ label?: string; ticker?: string }> = {
  dim: 0,
  draw(X, t, props, accent) {
    X.save();
    zoom(X, 1 + t * 0.04, 540, 900);
    chip(X, 540, 900, 1.15, t, accent, props.label ?? 'IA');
    X.restore();
    if (props.ticker) {
      X.fillStyle = C.red;
      X.fillRect(0, 1420, W, 90);
      X.font = font(44);
      X.textBaseline = 'middle';
      X.textAlign = 'left';
      X.fillStyle = '#fff';
      const unit = `${props.ticker.toUpperCase()}  •  `;
      const uw = X.measureText(unit).width;
      const off = (t * 260) % uw;
      for (let x = -off; x < W; x += uw) X.fillText(unit, x, 1467);
    }
    void H;
  },
};
