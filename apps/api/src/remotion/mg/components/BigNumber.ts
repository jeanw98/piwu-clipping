import { easeOut, font, glow, hexToRgb, label, pop, prog, rng } from '../lib';
import type { ComponentDef } from './types';

/** Counter that runs up to `value`. */
export const BigNumber: ComponentDef<{
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  label?: string;
}> = {
  dim: 0.2,
  draw(X, t, props, accent, info) {
    const rgb = hexToRgb(accent);
    glow(X, 540, 960, 520, rgb, 0.35);
    const r = rng(info.seed);
    for (let i = 0; i < 24; i++) {
      const a = r() * Math.PI * 2;
      const d = ((t * (60 + r() * 80) + r() * 400) % 420) + 220;
      X.fillStyle = `rgba(${rgb},${0.6 * (1 - (d - 220) / 420)})`;
      X.fillRect(540 + Math.cos(a) * d - 4, 960 + Math.sin(a) * d - 4, 8, 8);
    }
    const p = easeOut(prog(t, 0.1, 1.4));
    const decimals = props.decimals ?? (Number.isInteger(props.value) ? 0 : 1);
    const shown = (props.value * p).toLocaleString('es-ES', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    const txt = `${props.prefix ?? ''}${shown}${props.suffix ?? ''}`;
    const s = pop(t, 0, 0.35) * (1 + (p >= 1 ? 0.03 * Math.sin(t * 4) : 0));
    X.save();
    X.translate(540, 960);
    X.scale(s, s);
    X.font = font(220);
    const size = Math.min(240, (900 / Math.max(1, X.measureText(txt).width)) * 220);
    X.font = font(size);
    X.textAlign = 'center';
    X.textBaseline = 'middle';
    X.lineJoin = 'round';
    X.lineWidth = size * 0.16;
    X.strokeStyle = '#0B0B0B';
    X.strokeText(txt, 0, 0);
    X.fillStyle = '#FFD23F';
    X.fillText(txt, 0, 0);
    X.restore();
    if (props.label && t > 0.4) label(X, props.label.toUpperCase(), 540, 1330, 48);
  },
};
