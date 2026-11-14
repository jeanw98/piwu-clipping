import { type Ctx, C, ell, font, glow, hexToRgb, label, pop, rng, rr } from '../lib';
import type { ComponentDef } from './types';

type Icon = 'alert' | 'money' | 'heart' | 'bolt' | 'question' | 'star' | 'lock' | 'fire';

function drawIcon(X: Ctx, icon: Icon, t: number) {
  X.fillStyle = '#fff';
  X.strokeStyle = '#fff';
  X.lineCap = 'round';
  X.lineJoin = 'round';
  switch (icon) {
    case 'alert':
      X.fillStyle = C.yellow;
      X.beginPath();
      X.moveTo(0, -110);
      X.lineTo(110, 90);
      X.lineTo(-110, 90);
      X.closePath();
      X.fill();
      X.fillStyle = C.navy;
      rr(X, -12, -50, 24, 90, 10);
      X.fill();
      ell(X, 0, 66, 14, 14, C.navy);
      break;
    case 'money':
      X.font = font(200);
      X.textAlign = 'center';
      X.textBaseline = 'middle';
      X.fillStyle = C.yellow;
      X.fillText('$', 0, 10);
      break;
    case 'heart': {
      const b = 1 + 0.08 * Math.max(0, Math.sin(t * 6));
      X.scale(b, b);
      X.fillStyle = C.red;
      X.beginPath();
      X.moveTo(0, 90);
      X.bezierCurveTo(-150, -10, -80, -130, 0, -50);
      X.bezierCurveTo(80, -130, 150, -10, 0, 90);
      X.fill();
      break;
    }
    case 'bolt':
      X.fillStyle = C.yellow;
      X.beginPath();
      X.moveTo(20, -120);
      X.lineTo(-70, 20);
      X.lineTo(-5, 20);
      X.lineTo(-25, 120);
      X.lineTo(70, -20);
      X.lineTo(5, -20);
      X.closePath();
      X.fill();
      break;
    case 'question':
      X.font = font(220);
      X.textAlign = 'center';
      X.textBaseline = 'middle';
      X.fillText('?', 0, 14);
      break;
    case 'star':
      X.fillStyle = C.yellow;
      X.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 50 : 120;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2 + t * 0.4;
        X.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      X.closePath();
      X.fill();
      break;
    case 'lock':
      X.lineWidth = 22;
      X.beginPath();
      X.arc(0, -30, 55, Math.PI, 0);
      X.stroke();
      X.fillStyle = C.yellow;
      rr(X, -85, -30, 170, 140, 22);
      X.fill();
      ell(X, 0, 30, 18, 18, C.navy);
      break;
    case 'fire': {
      const f = Math.sin(t * 10) * 6;
      X.fillStyle = '#FF7A1A';
      X.beginPath();
      X.moveTo(0, -130 + f);
      X.bezierCurveTo(90, -40, 100, 60, 0, 110);
      X.bezierCurveTo(-100, 60, -90, -40, 0, -130 + f);
      X.fill();
      X.fillStyle = C.yellow;
      X.beginPath();
      X.moveTo(0, -40 - f);
      X.bezierCurveTo(45, 10, 50, 70, 0, 100);
      X.bezierCurveTo(-50, 70, -45, 10, 0, -40 - f);
      X.fill();
      break;
    }
  }
}

export const IconBurst: ComponentDef<{ icon: Icon; label?: string }> = {
  dim: 0.15,
  draw(X, t, props, accent, info) {
    const rgb = hexToRgb(accent);
    glow(X, 540, 980, 520, rgb, 0.4);
    const r = rng(info.seed);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + r() * 0.2;
      const sp = 300 + r() * 500;
      const ph = ((t + r() * 2) * 0.6) % 1;
      const d = 180 + ph * sp;
      const s = 6 + r() * 10;
      X.fillStyle = i % 3 === 0 ? `rgba(255,210,63,${1 - ph})` : `rgba(${rgb},${1 - ph})`;
      X.fillRect(540 + Math.cos(a) * d - s / 2, 980 + Math.sin(a) * d - s / 2, s, s);
    }
    const k = pop(t, 0, 0.35) * (1 + 0.04 * Math.sin(t * 4));
    X.save();
    X.translate(540, 980);
    X.scale(k, k);
    ell(X, 0, 0, 200, 200, accent);
    ell(X, 0, 0, 175, 175, '#0E1424');
    drawIcon(X, props.icon, t);
    X.restore();
    if (props.label && t > 0.35) label(X, props.label.toUpperCase(), 540, 1300, 48);
  },
};
