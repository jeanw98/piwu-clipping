import { type Ctx, C, ell, font, lerp, pop, rr } from '../lib';
import type { ComponentDef } from './types';

type Pose = 'point' | 'shrug' | 'surprised' | 'happy';

/**
 * "Pip": original vector host (round head, orange hoodie, cap).
 * Arms are two-segment strokes driven by angles (degrees from straight down).
 */
const SKIN = '#E0A27A';
const SKIN_D = '#C4855E';
const HOODIE = '#FF8A3D';
const HOODIE_D = '#E06F25';
const PANTS = '#2B3550';
const CAP = '#14213D';

function arm(X: Ctx, sd: number, sh: number, a1: number, a2: number) {
  const r1 = (a1 * Math.PI) / 180;
  const r2 = (a2 * Math.PI) / 180;
  const ex = sd * 62 + Math.sin(r1) * 85 * sd;
  const ey = sh + Math.cos(r1) * 85;
  const hx = ex + Math.sin(r2) * 85 * sd;
  const hy = ey + Math.cos(r2) * 85;
  X.lineCap = 'round';
  X.lineJoin = 'round';
  X.strokeStyle = HOODIE_D;
  X.lineWidth = 38;
  X.beginPath();
  X.moveTo(sd * 62, sh);
  X.lineTo(ex, ey);
  X.lineTo(hx, hy);
  X.stroke();
  X.strokeStyle = HOODIE;
  X.lineWidth = 30;
  X.stroke();
  ell(X, hx, hy, 20, 20, SKIN);
}

export function host(X: Ctx, cx: number, by: number, s: number, pose: Pose, t: number) {
  const bob = Math.sin(t * 3) * 4;
  const poses: Record<Pose, [[number, number], [number, number]]> = {
    point: [[15, 10], [100, 95 + Math.sin(t * 4) * 6]],
    shrug: [[120, 40], [120, 40]],
    surprised: [[155, 175], [155, 175]],
    happy: [[20, 15], [150 + Math.sin(t * 6) * 12, 170]],
  };
  const [L, R] = poses[pose];
  X.save();
  X.translate(cx, by + bob);
  X.scale(s, s);
  // legs
  [-1, 1].forEach((sd) => {
    X.fillStyle = PANTS;
    rr(X, sd * 30 - 18, -160, 36, 150, 14);
    X.fill();
    X.fillStyle = '#F4F6FA';
    rr(X, sd * 30 - 26 + sd * 6, -18, 52, 24, 10);
    X.fill();
  });
  const sh = -380;
  arm(X, -1, sh, L[0], L[1]);
  arm(X, 1, sh, R[0], R[1]);
  // body (hoodie)
  X.fillStyle = HOODIE;
  rr(X, -80, -410, 160, 260, 50);
  X.fill();
  X.fillStyle = HOODIE_D;
  rr(X, -46, -260, 92, 54, 18);
  X.fill();
  X.strokeStyle = '#fff';
  X.lineWidth = 6;
  X.beginPath();
  X.moveTo(-18, -400);
  X.lineTo(-22, -330);
  X.moveTo(18, -400);
  X.lineTo(22, -330);
  X.stroke();
  // head
  ell(X, 0, -486, 74, 76, SKIN);
  ell(X, -74, -480, 14, 20, SKIN_D);
  ell(X, 74, -480, 14, 20, SKIN_D);
  // cap
  X.fillStyle = CAP;
  X.beginPath();
  X.arc(0, -500, 76, Math.PI, 0);
  X.fill();
  rr(X, -10, -520, 120, 26, 12);
  X.fill();
  ell(X, 0, -578, 10, 10, C.yellow);
  // face
  const surpr = pose === 'surprised';
  [-26, 26].forEach((fx) => {
    ell(X, fx, -478, surpr ? 14 : 11, surpr ? 17 : 13, '#fff');
    ell(X, fx + 2, -476, 7, 8, '#1a1a1a');
  });
  X.strokeStyle = '#3A2414';
  X.lineWidth = 6;
  X.lineCap = 'round';
  X.beginPath();
  if (pose === 'shrug') {
    X.moveTo(-40, -505);
    X.lineTo(-14, -500);
    X.moveTo(40, -505);
    X.lineTo(14, -500);
  } else {
    const lift = surpr ? 10 : 0;
    X.moveTo(-40, -503 - lift);
    X.quadraticCurveTo(-26, -511 - lift, -12, -503 - lift);
    X.moveTo(40, -503 - lift);
    X.quadraticCurveTo(26, -511 - lift, 12, -503 - lift);
  }
  X.stroke();
  X.fillStyle = '#5A1A1A';
  if (surpr) ell(X, 0, -440, 11, 15, '#5A1A1A');
  else if (pose === 'happy') {
    X.beginPath();
    X.arc(0, -450, 20, 0, Math.PI);
    X.fill();
  } else if (pose === 'shrug') {
    X.beginPath();
    X.moveTo(-14, -444);
    X.quadraticCurveTo(0, -450, 14, -440);
    X.stroke();
  } else {
    X.beginPath();
    X.arc(0, -452, 16, Math.PI * 0.15, Math.PI * 0.85);
    X.stroke();
  }
  X.restore();
}

export const Host: ComponentDef<{ pose: Pose; say?: string }> = {
  draw(X, t, props) {
    const k = pop(t, 0, 0.35);
    host(X, props.say ? 360 : 540, 1640, 1.15 * k, props.pose, t);
    if (props.say && t > 0.35) {
      const b = pop(t, 0.35);
      X.save();
      X.translate(720, 860);
      X.scale(b, b);
      X.fillStyle = '#fff';
      rr(X, -300, -110, 600, 220, 50);
      X.fill();
      X.beginPath();
      X.moveTo(-160, 100);
      X.lineTo(-240, 200);
      X.lineTo(-60, 100);
      X.fill();
      X.fillStyle = C.navy;
      X.font = font(props.say.length > 22 ? 40 : 50);
      X.textAlign = 'center';
      X.textBaseline = 'middle';
      X.fillText(props.say.toUpperCase(), 0, 4, 560);
      X.restore();
    }
    void lerp;
  },
};
