import { type Ctx, C, ease, prog, rr } from '../lib';
import type { ComponentDef } from './types';

export function chair(X: Ctx, x: number, y: number, s: number) {
  X.save();
  X.translate(x, y);
  X.scale(s, s);
  const g = X.createRadialGradient(0, -200, 20, 0, 0, 520);
  g.addColorStop(0, 'rgba(255,240,200,.35)');
  g.addColorStop(1, 'rgba(255,240,200,0)');
  X.fillStyle = g;
  X.beginPath();
  X.moveTo(-60, -900);
  X.lineTo(60, -900);
  X.lineTo(420, 220);
  X.lineTo(-420, 220);
  X.fill();
  X.fillStyle = '#2A1F1A';
  rr(X, -150, -420, 300, 330, 60);
  X.fill();
  X.fillStyle = '#3A2B23';
  rr(X, -180, -110, 360, 90, 30);
  X.fill();
  X.fillStyle = '#555';
  X.fillRect(-12, -20, 24, 140);
  X.fillRect(-150, 110, 300, 16);
  X.restore();
}

export function nameplate(X: Ctx, x: number, y: number, s: number, txt: string, sub?: string, col: string = C.yellow) {
  X.save();
  X.translate(x, y);
  X.scale(s, s);
  X.fillStyle = C.navy;
  rr(X, -300, -60, 600, 120, 20);
  X.fill();
  X.strokeStyle = col;
  X.lineWidth = 6;
  rr(X, -300, -60, 600, 120, 20);
  X.stroke();
  X.textAlign = 'center';
  X.textBaseline = 'middle';
  X.fillStyle = '#fff';
  X.font = `44px PoppinsMG`;
  X.fillText(txt, 0, sub ? -14 : 4, 560);
  if (sub) {
    X.fillStyle = col;
    X.font = `30px PoppinsMG`;
    X.fillText(sub, 0, 32, 560);
  }
  X.restore();
}

export const EmptyChair: ComponentDef<{ role?: string; name?: string; falling?: boolean }> = {
  dim: 0.3,
  pillY: 700,
  draw(X, t, props) {
    chair(X, 540, 1250, 1.1);
    if (props.role || props.name) {
      const fall = props.falling === false ? 0 : ease(prog(t, 1.2, 2.4));
      X.save();
      X.translate(540, 880 + fall * 300);
      X.rotate(fall * 0.6);
      nameplate(X, 0, 0, 1, (props.role ?? props.name ?? '').toUpperCase(), props.role ? props.name?.toUpperCase() : undefined);
      X.restore();
    }
  },
};
