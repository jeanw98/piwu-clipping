import type { MotionGraphicsTheme } from '@piwu/shared';
import { type Ctx, H, W, ell, font, lg, rng } from './lib';

/**
 * Live backgrounds — always moving (scrolling grid, twinkles, particles).
 * `dim` darkens the frame so the hero object reads first.
 */

function dimLayer(X: Ctx, dim: number) {
  if (dim > 0) {
    X.fillStyle = `rgba(0,0,0,${dim})`;
    X.fillRect(0, 0, W, H);
  }
}

/** Port of nvidia `techBg`: gradient, sliding grid, blinking dots. */
export function techBg(X: Ctx, t: number, dim = 0) {
  X.fillStyle = lg(X, 0, 0, 0, H, ['#06120A', '#0B1E12', '#050B07']);
  X.fillRect(0, 0, W, H);
  X.strokeStyle = 'rgba(118,185,0,.10)';
  X.lineWidth = 2;
  // One path for the whole grid: far fewer canvas calls per frame.
  X.beginPath();
  for (let x = 0; x <= W; x += 60) {
    X.moveTo(x, 0);
    X.lineTo(x, H);
  }
  for (let y = (t * 20) % 60; y <= H; y += 60) {
    X.moveTo(0, y);
    X.lineTo(W, y);
  }
  X.stroke();
  const r = rng(4);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(r() * 18) * 60;
    const y = Math.floor(r() * 32) * 60;
    const ph = (t * 0.5 + r()) % 1;
    X.fillStyle = `rgba(168,224,95,${0.5 * (1 - ph)})`;
    X.fillRect(x - 3, y - 3, 6, 6);
  }
  dimLayer(X, dim);
}

/** Port of aliens `space`: twinkling stars + nebula. */
export function spaceBg(X: Ctx, t: number, dim = 0) {
  X.fillStyle = lg(X, 0, 0, 0, H, ['#03050F', '#0B1030', '#120A2A']);
  X.fillRect(0, 0, W, H);
  const r = rng(8);
  for (let i = 0; i < 320; i++) {
    const x = r() * W;
    const y = r() * H;
    const s = r() * 2.6 + 0.8;
    X.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * r() * (0.6 + 0.4 * Math.sin(t * 2 + i))})`;
    X.fillRect(x, y, s, s);
  }
  const drift = Math.sin(t * 0.2) * 40;
  const g = X.createRadialGradient(300 + drift, 900, 10, 300 + drift, 900, 700);
  g.addColorStop(0, 'rgba(120,80,255,.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  X.fillStyle = g;
  X.fillRect(0, 0, W, H);
  const g2 = X.createRadialGradient(820, 1500 - drift, 10, 820, 1500 - drift, 600);
  g2.addColorStop(0, 'rgba(63,208,255,.10)');
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  X.fillStyle = g2;
  X.fillRect(0, 0, W, H);
  dimLayer(X, dim);
}

/** Newsroom: deep blue, moving scan lines and diagonal light bands. */
export function newsBg(X: Ctx, t: number, dim = 0) {
  X.fillStyle = lg(X, 0, 0, 0, H, ['#0A1630', '#0F2350', '#070F22']);
  X.fillRect(0, 0, W, H);
  X.save();
  X.globalAlpha = 0.07;
  X.fillStyle = '#3FA9FF';
  for (let k = -2; k < 8; k++) {
    const x = ((t * 40 + k * 320) % 2560) - 640;
    X.beginPath();
    X.moveTo(x, 0);
    X.lineTo(x + 140, 0);
    X.lineTo(x + 140 - 900, H);
    X.lineTo(x - 900, H);
    X.fill();
  }
  X.restore();
  X.strokeStyle = 'rgba(63,169,255,.08)';
  X.lineWidth = 2;
  X.beginPath();
  for (let y = (t * 30) % 24; y <= H; y += 24) {
    X.moveTo(0, y);
    X.lineTo(W, y);
  }
  X.stroke();
  const r = rng(11);
  for (let i = 0; i < 30; i++) {
    const x = r() * W;
    const y = r() * H;
    const ph = (t * 0.4 + r()) % 1;
    ell(X, x, y, 3, 3, `rgba(160,210,255,${0.45 * (1 - ph)})`);
  }
  dimLayer(X, dim);
}

/** Nature: teal-green gradient with floating leaves / pollen. */
export function natureBg(X: Ctx, t: number, dim = 0) {
  X.fillStyle = lg(X, 0, 0, 0, H, ['#0B2A22', '#12392B', '#071A14']);
  X.fillRect(0, 0, W, H);
  X.fillStyle = 'rgba(76,192,122,.10)';
  X.beginPath();
  X.moveTo(0, H);
  for (let x = 0; x <= W; x += 40) {
    X.lineTo(x, 1580 - Math.sin(x * 0.006 + t * 0.3) * 50);
  }
  X.lineTo(W, H);
  X.fill();
  const r = rng(17);
  for (let i = 0; i < 36; i++) {
    const x0 = r() * W;
    const speed = 30 + r() * 50;
    const y = (r() * H - t * speed + H * 4) % H;
    const x = x0 + Math.sin(t * 1.2 + i) * 20;
    X.save();
    X.translate(x, y);
    X.rotate(t * 0.8 + i);
    X.fillStyle = `rgba(168,230,140,${0.18 + r() * 0.25})`;
    X.beginPath();
    X.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2);
    X.fill();
    X.restore();
  }
  dimLayer(X, dim);
}

/** Danger: dark red, hazard stripes and a slow alarm pulse. */
export function dangerBg(X: Ctx, t: number, dim = 0) {
  X.fillStyle = lg(X, 0, 0, 0, H, ['#1E0606', '#2A0A0A', '#120303']);
  X.fillRect(0, 0, W, H);
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);
  const g = X.createRadialGradient(W / 2, 900, 50, W / 2, 900, 1000);
  g.addColorStop(0, `rgba(255,59,59,${0.12 + 0.1 * pulse})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  X.fillStyle = g;
  X.fillRect(0, 0, W, H);
  X.save();
  X.globalAlpha = 0.12;
  for (const band of [0, H - 70]) {
    X.save();
    X.beginPath();
    X.rect(0, band, W, 70);
    X.clip();
    for (let x = -140 + ((t * 60) % 80); x < W + 80; x += 80) {
      X.fillStyle = '#FFD23F';
      X.beginPath();
      X.moveTo(x, band);
      X.lineTo(x + 40, band);
      X.lineTo(x + 110, band + 70);
      X.lineTo(x + 70, band + 70);
      X.fill();
    }
    X.restore();
  }
  X.restore();
  const r = rng(23);
  for (let i = 0; i < 28; i++) {
    const x = r() * W;
    const y = (r() * H - t * (20 + r() * 40) + H * 4) % H;
    ell(X, x, y, 2.5, 2.5, `rgba(255,140,90,${0.3 + 0.3 * r()})`);
  }
  dimLayer(X, dim);
}

/** Money: dark green with drifting coins and $ glyphs. */
export function moneyBg(X: Ctx, t: number, dim = 0) {
  X.fillStyle = lg(X, 0, 0, 0, H, ['#06180F', '#0B2617', '#04100A']);
  X.fillRect(0, 0, W, H);
  X.strokeStyle = 'rgba(43,182,115,.08)';
  X.lineWidth = 2;
  X.beginPath();
  for (let x = (t * 15) % 90; x <= W; x += 90) {
    X.moveTo(x, 0);
    X.lineTo(x, H);
  }
  X.stroke();
  const r = rng(29);
  X.textAlign = 'center';
  X.textBaseline = 'middle';
  for (let i = 0; i < 22; i++) {
    const x = r() * W;
    const y = (r() * H + t * (25 + r() * 35)) % H;
    const a = 0.08 + r() * 0.12;
    if (i % 2) {
      X.font = font(40 + r() * 30);
      X.fillStyle = `rgba(120,230,160,${a})`;
      X.fillText('$', x, y);
    } else {
      ell(X, x, y, 16, 16 * Math.abs(Math.cos(t * 2 + i)), `rgba(255,210,63,${a + 0.05})`);
    }
  }
  dimLayer(X, dim);
}

/** Health: navy-teal, floating plus signs and an ECG trace. */
export function healthBg(X: Ctx, t: number, dim = 0) {
  X.fillStyle = lg(X, 0, 0, 0, H, ['#061826', '#0A2436', '#04111B']);
  X.fillRect(0, 0, W, H);
  const r = rng(31);
  for (let i = 0; i < 24; i++) {
    const x = r() * W;
    const y = (r() * H - t * (15 + r() * 25) + H * 4) % H;
    const s = 8 + r() * 10;
    X.fillStyle = `rgba(63,208,255,${0.1 + r() * 0.15})`;
    X.fillRect(x - s, y - s / 3, s * 2, (s * 2) / 3);
    X.fillRect(x - s / 3, y - s, (s * 2) / 3, s * 2);
  }
  X.strokeStyle = 'rgba(63,208,255,.18)';
  X.lineWidth = 4;
  X.beginPath();
  const y0 = 1700;
  for (let x = 0; x <= W; x += 6) {
    const k = ((x + t * 260) % 360) / 360;
    const beat =
      k > 0.4 && k < 0.45 ? -90 : k >= 0.45 && k < 0.5 ? 60 : k >= 0.5 && k < 0.53 ? -20 : 0;
    X.lineTo(x, y0 + beat);
  }
  X.stroke();
  dimLayer(X, dim);
}

export const BACKGROUNDS: Record<
  MotionGraphicsTheme,
  (X: Ctx, t: number, dim?: number) => void
> = {
  tech: techBg,
  space: spaceBg,
  news: newsBg,
  nature: natureBg,
  danger: dangerBg,
  money: moneyBg,
  health: healthBg,
};
