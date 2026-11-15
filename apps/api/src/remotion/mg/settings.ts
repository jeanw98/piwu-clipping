import type { MotionGraphicsSetting } from '@piwu/shared';
import { type Ctx, H, W, ell, lg, rng } from './lib';

/**
 * Procedural scenery: sky × horizon × ground × weather.
 * ~8×7×9×7 combinations cover beaches, cities, deserts, forests, offices…
 * Sky / sea / sand are ports of docs/motion-graphics/isla + arenas.
 * Everything moves a little (clouds, waves, lights, particles).
 */

/** Horizon line: below captions (y≈1150), leaves room for ground objects. */
export const HORIZON_Y = 1240;

type Palette = { top: string; mid: string; low: string };
const SKY: Record<string, Palette> = {
  day: { top: '#4FA3E0', mid: '#8CC8F0', low: '#CDEBFA' },
  sunset: { top: '#5B6FB8', mid: '#E58A6B', low: '#FFC27A' },
  dawn: { top: '#6C7BC4', mid: '#E8A7C0', low: '#FFE2C2' },
  night: { top: '#0B1230', mid: '#16244E', low: '#2C3D72' },
  overcast: { top: '#7C8796', mid: '#9AA4B1', low: '#C2C8D0' },
  storm: { top: '#1E2430', mid: '#323B4B', low: '#4C5566' },
};

function clouds(X: Ctx, t: number, color: string, seed: number, count = 3) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const s = 0.6 + r() * 0.6;
    const cy = 160 + r() * 520;
    const speed = 4 + r() * 8;
    const cx = ((r() * W + t * speed) % (W + 400)) - 200;
    X.fillStyle = color;
    for (const [dx, dy, rad] of [
      [0, 0, 70],
      [60, 10, 52],
      [-60, 12, 48],
      [25, -28, 48],
    ]) {
      X.beginPath();
      X.arc(cx + dx * s, cy + dy * s, rad * s, 0, Math.PI * 2);
      X.fill();
    }
  }
}

function drawSky(X: Ctx, sky: MotionGraphicsSetting['sky'], t: number, hz: number) {
  if (sky === 'indoor_warm' || sky === 'indoor_cool') {
    const warm = sky === 'indoor_warm';
    X.fillStyle = lg(X, 0, 0, 0, hz, warm ? ['#F3D9B1', '#E9C597', '#D9AE7C'] : ['#DCE6EE', '#C8D5E0', '#B3C3D1']);
    X.fillRect(0, 0, W, hz + 4);
    // wall panels + a window with moving light
    X.fillStyle = warm ? 'rgba(160,110,60,.10)' : 'rgba(60,90,120,.10)';
    for (let x = 60; x < W; x += 240) X.fillRect(x, 180, 6, hz - 200);
    X.fillStyle = warm ? '#A9D3F0' : '#BFE3F7';
    X.fillRect(640, 260, 320, 380);
    clouds(X, t, 'rgba(255,255,255,.85)', 41, 1);
    X.strokeStyle = warm ? '#8A5A32' : '#5E7387';
    X.lineWidth = 18;
    X.strokeRect(640, 260, 320, 380);
    X.beginPath();
    X.moveTo(800, 260);
    X.lineTo(800, 640);
    X.moveTo(640, 450);
    X.lineTo(960, 450);
    X.stroke();
    const beam = X.createLinearGradient(640, 640, 420, hz);
    beam.addColorStop(0, 'rgba(255,250,220,.22)');
    beam.addColorStop(1, 'rgba(255,250,220,0)');
    X.fillStyle = beam;
    X.beginPath();
    X.moveTo(640, 640);
    X.lineTo(960, 640);
    X.lineTo(760, hz);
    X.lineTo(300, hz);
    X.fill();
    return;
  }
  const p = SKY[sky] ?? SKY.day;
  X.fillStyle = lg(X, 0, 0, 0, hz, [p.top, p.mid, p.low]);
  X.fillRect(0, 0, W, hz + 4);
  if (sky === 'day' || sky === 'sunset' || sky === 'dawn') {
    const low = sky !== 'day';
    const sx = low ? 820 : 800;
    const sy = low ? hz - 140 : 300;
    const g = X.createRadialGradient(sx, sy, 10, sx, sy, 300);
    g.addColorStop(0, 'rgba(255,245,210,.9)');
    g.addColorStop(1, 'rgba(255,230,180,0)');
    X.fillStyle = g;
    X.fillRect(0, 0, W, hz);
    ell(X, sx, sy, 66, 66, low ? '#FFE2A8' : '#FFF6D8');
    clouds(X, t, low ? 'rgba(255,226,210,.85)' : 'rgba(255,255,255,.9)', 7);
  } else if (sky === 'night') {
    const r = rng(5);
    for (let i = 0; i < 120; i++) {
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
      X.fillStyle = `rgba(255,255,255,${0.35 + 0.6 * tw * r()})`;
      X.fillRect(r() * W, r() * hz * 0.9, 3, 3);
    }
    ell(X, 820, 320, 54, 54, '#F3F0DC');
    ell(X, 842, 306, 46, 46, p.mid);
  } else {
    clouds(X, t, sky === 'storm' ? 'rgba(40,46,58,.9)' : 'rgba(225,229,235,.9)', 13, 5);
    if (sky === 'storm') {
      const flash = (t * 0.45) % 1;
      if (flash < 0.04) {
        X.fillStyle = 'rgba(255,255,255,.35)';
        X.fillRect(0, 0, W, H);
        X.strokeStyle = '#FFF7C2';
        X.lineWidth = 8;
        X.beginPath();
        X.moveTo(700, 120);
        X.lineTo(640, 360);
        X.lineTo(700, 360);
        X.lineTo(610, 620);
        X.stroke();
      }
    }
  }
}

function drawHorizon(X: Ctx, setting: MotionGraphicsSetting, t: number, hz: number) {
  const night = setting.sky === 'night' || setting.sky === 'storm';
  switch (setting.horizon) {
    case 'sea': {
      X.fillStyle = lg(X, 0, hz - 70, 0, hz + 6, night ? ['#1A3A5E', '#14304E'] : ['#3E9CC2', '#2A7FA3']);
      X.fillRect(0, hz - 70, W, 76);
      X.strokeStyle = 'rgba(255,255,255,.35)';
      X.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        X.beginPath();
        const yy = hz - 60 + i * 13;
        for (let x = 0; x <= W; x += 20) X.lineTo(x, yy + Math.sin(x * 0.03 + t * 2 + i) * 2);
        X.stroke();
      }
      break;
    }
    case 'mountains': {
      const layers: Array<[string, number, number]> = night
        ? [['#25335C', 300, 11], ['#1B2647', 180, 17]]
        : [['#8FA6C8', 320, 11], ['#6E86AD', 200, 17]];
      for (const [col, peak, seed] of layers) {
        const r = rng(seed);
        X.fillStyle = col;
        X.beginPath();
        X.moveTo(0, hz + 4);
        for (let x = 0; x <= W + 120; x += 120) X.lineTo(x, hz - 40 - r() * peak);
        X.lineTo(W, hz + 4);
        X.fill();
      }
      break;
    }
    case 'city': {
      const r = rng(21);
      let x = -20;
      while (x < W) {
        const w = 70 + r() * 90;
        const h = 160 + r() * 380;
        X.fillStyle = night ? (r() > 0.5 ? '#161C3A' : '#1C2448') : r() > 0.5 ? '#7F93AE' : '#93A6BF';
        X.fillRect(x, hz - h, w, h + 4);
        for (let yy = hz - h + 20; yy < hz - 20; yy += 34)
          for (let xx = x + 12; xx < x + w - 14; xx += 26) {
            if (r() > 0.45) {
              X.fillStyle = night
                ? `rgba(255,214,120,${0.5 + 0.4 * Math.sin(t * 0.7 + xx)})`
                : 'rgba(220,235,250,.7)';
              X.fillRect(xx, yy, 12, 16);
            }
          }
        x += w + 6;
      }
      break;
    }
    case 'forest': {
      const r = rng(31);
      for (let layer = 0; layer < 2; layer++) {
        X.fillStyle = night ? (layer ? '#0F2A22' : '#16362C') : layer ? '#2E7D4F' : '#3F9A63';
        for (let x = -40; x < W + 40; x += 46 + r() * 30) {
          const h = 160 + r() * 160 + layer * 60;
          const sway = Math.sin(t * 1.2 + x) * 4;
          X.beginPath();
          X.moveTo(x - 50, hz + 4);
          X.lineTo(x + sway, hz - h);
          X.lineTo(x + 50, hz + 4);
          X.fill();
        }
      }
      break;
    }
    case 'dunes': {
      for (const [col, amp, off] of [
        ['#E2C084', 90, 0.5],
        ['#D4AE70', 60, 2.1],
      ] as const) {
        X.fillStyle = col;
        X.beginPath();
        X.moveTo(0, hz + 4);
        for (let x = 0; x <= W; x += 30) X.lineTo(x, hz - 30 - Math.abs(Math.sin(x * 0.004 + off)) * amp);
        X.lineTo(W, hz + 4);
        X.fill();
      }
      break;
    }
    case 'hills': {
      X.fillStyle = night ? '#1E2A4A' : '#7DBA6A';
      X.beginPath();
      X.moveTo(0, hz + 4);
      for (let x = 0; x <= W; x += 40) X.lineTo(x, hz - 60 - Math.sin(x * 0.006) * 50);
      X.lineTo(W, hz + 4);
      X.fill();
      X.fillStyle = night ? '#24345A' : '#5FA552';
      X.beginPath();
      X.moveTo(0, hz + 4);
      for (let x = 0; x <= W; x += 40) X.lineTo(x, hz - 20 - Math.sin(x * 0.009 + 1) * 30);
      X.lineTo(W, hz + 4);
      X.fill();
      break;
    }
    default:
      break;
  }
}

function drawGround(X: Ctx, setting: MotionGraphicsSetting, t: number, hz: number) {
  const night = setting.sky === 'night' || setting.sky === 'storm';
  const shade = night ? 0.35 : 0;
  const ground = setting.ground;
  if (ground === 'none') {
    // Plain floor so objects always stand on something.
    X.fillStyle = lg(X, 0, hz, 0, H, night ? ['#1A2238', '#10162A'] : ['#9FB0C4', '#7E8FA6']);
    X.fillRect(0, hz, W, H - hz);
    return;
  }
  const fill = (stops: string[]) => {
    X.fillStyle = lg(X, 0, hz, 0, H, stops);
    X.fillRect(0, hz, W, H - hz);
  };
  switch (ground) {
    case 'sand': {
      fill(['#F5DEA6', '#EBCB88', '#D9B271']);
      if (setting.horizon === 'sea') {
        // Shoreline foam (port of isla `sand`).
        const fo = Math.sin(t * 1.5) * 12;
        X.strokeStyle = 'rgba(255,255,255,.9)';
        X.lineWidth = 10;
        X.lineCap = 'round';
        X.beginPath();
        for (let x = 0; x <= W; x += 30)
          X.lineTo(x, hz + 26 + fo + Math.sin(x * 0.006 + 0.5) * 18 + Math.sin(x * 0.05 + t * 3) * 4);
        X.stroke();
      }
      const r = rng(9);
      X.fillStyle = 'rgba(160,120,70,.25)';
      for (let i = 0; i < 140; i++) X.fillRect(r() * W, hz + 60 + r() * (H - hz), 3, 3);
      break;
    }
    case 'grass': {
      fill(['#7CC46A', '#5EA853', '#4A8E44']);
      const r = rng(17);
      X.strokeStyle = 'rgba(40,90,40,.45)';
      X.lineWidth = 4;
      X.lineCap = 'round';
      for (let i = 0; i < 160; i++) {
        const gx = r() * W;
        const gy = hz + 30 + r() * (H - hz - 30);
        X.beginPath();
        X.moveTo(gx, gy);
        X.lineTo(gx - 4 + Math.sin(t * 2 + i) * 3, gy - 18);
        X.stroke();
      }
      break;
    }
    case 'water': {
      fill(['#2FA3C9', '#1F7FB8', '#16608F']);
      X.strokeStyle = 'rgba(255,255,255,.35)';
      X.lineWidth = 4;
      for (let k = 0; k < 12; k++) {
        const f = k / 12;
        const yy = hz + 20 + (H - hz) * Math.pow(f, 1.3);
        X.beginPath();
        for (let x = 0; x <= W; x += 24) X.lineTo(x, yy + Math.sin(x * 0.02 + t * 1.6 + k * 1.3) * (3 + f * 8));
        X.stroke();
      }
      break;
    }
    case 'snow': {
      fill(['#F4F8FC', '#E2ECF5', '#CCDCEA']);
      const r = rng(23);
      for (let i = 0; i < 40; i++) {
        const tw = 0.5 + 0.5 * Math.sin(t * 3 + i);
        X.fillStyle = `rgba(255,255,255,${tw})`;
        X.fillRect(r() * W, hz + 40 + r() * (H - hz), 4, 4);
      }
      break;
    }
    case 'asphalt': {
      fill(['#4A4F58', '#3A3F47', '#2C3036']);
      X.fillStyle = '#F2D45C';
      const lane = hz + (H - hz) * 0.45;
      for (let x = -200 + ((t * 300) % 200); x < W; x += 200) X.fillRect(x, lane, 110, 14);
      break;
    }
    case 'floor': {
      fill(setting.sky === 'indoor_cool' ? ['#B9C3CE', '#A3AFBC', '#8E9AA8'] : ['#C99A66', '#B5854F', '#9C6E3D']);
      X.strokeStyle = 'rgba(60,35,15,.25)';
      X.lineWidth = 3;
      for (let k = 1; k < 9; k++) {
        const yy = hz + (H - hz) * Math.pow(k / 9, 1.4);
        X.beginPath();
        X.moveTo(0, yy);
        X.lineTo(W, yy);
        X.stroke();
      }
      X.fillStyle = 'rgba(0,0,0,.12)';
      X.fillRect(0, hz, W, 14);
      break;
    }
    case 'dirt':
      fill(['#B8865A', '#9E7048', '#7F5838']);
      break;
    case 'rock': {
      fill(['#8D8F96', '#74767D', '#5D5F66']);
      const r = rng(29);
      for (let i = 0; i < 18; i++) ell(X, r() * W, hz + 60 + r() * (H - hz - 60), 30 + r() * 50, 12 + r() * 20, 'rgba(50,52,58,.35)');
      break;
    }
  }
  if (shade) {
    X.fillStyle = `rgba(10,15,40,${shade})`;
    X.fillRect(0, hz, W, H - hz);
  }
}

function drawWeather(X: Ctx, weather: MotionGraphicsSetting['weather'], t: number) {
  if (weather === 'none') return;
  const r = rng(51);
  switch (weather) {
    case 'rain':
      X.strokeStyle = 'rgba(200,220,255,.45)';
      X.lineWidth = 3;
      X.beginPath();
      for (let i = 0; i < 110; i++) {
        const x = r() * W;
        const y = (r() * H + t * (900 + r() * 300)) % H;
        X.moveTo(x, y);
        X.lineTo(x - 10, y + 36);
      }
      X.stroke();
      break;
    case 'snow':
      for (let i = 0; i < 90; i++) {
        const y = (r() * H + t * (60 + r() * 60)) % H;
        const x = r() * W + Math.sin(t + i) * 20;
        ell(X, x, y, 4 + r() * 3, 4 + r() * 3, 'rgba(255,255,255,.85)');
      }
      break;
    case 'dust':
      for (let i = 0; i < 60; i++) {
        const x = (r() * W + t * (40 + r() * 60)) % W;
        ell(X, x, r() * H, 3, 3, 'rgba(230,200,150,.4)');
      }
      break;
    case 'bubbles':
      X.strokeStyle = 'rgba(255,255,255,.55)';
      X.lineWidth = 3;
      for (let i = 0; i < 40; i++) {
        const y = (r() * H - t * (50 + r() * 70) + H * 6) % H;
        const x = r() * W + Math.sin(t * 2 + i) * 14;
        X.beginPath();
        X.arc(x, y, 6 + r() * 12, 0, Math.PI * 2);
        X.stroke();
      }
      break;
    case 'leaves':
      for (let i = 0; i < 30; i++) {
        const y = (r() * H + t * (50 + r() * 50)) % H;
        const x = r() * W + Math.sin(t * 1.4 + i) * 40;
        X.save();
        X.translate(x, y);
        X.rotate(t + i);
        X.fillStyle = i % 2 ? 'rgba(230,140,50,.8)' : 'rgba(120,180,70,.8)';
        X.beginPath();
        X.ellipse(0, 0, 12, 5, 0, 0, Math.PI * 2);
        X.fill();
        X.restore();
      }
      break;
    case 'confetti': {
      const cols = ['#FFD23F', '#FF3B3B', '#3FD0FF', '#2BB673', '#B36BFF'];
      for (let i = 0; i < 70; i++) {
        const y = (r() * H + t * (120 + r() * 120)) % H;
        const x = r() * W + Math.sin(t * 2 + i) * 24;
        X.save();
        X.translate(x, y);
        X.rotate(t * 3 + i);
        X.fillStyle = cols[i % cols.length];
        X.fillRect(-6, -3, 12, 6);
        X.restore();
      }
      break;
    }
  }
}

export function drawSetting(X: Ctx, setting: MotionGraphicsSetting, t: number) {
  const hz = HORIZON_Y;
  drawSky(X, setting.sky, t, hz);
  drawHorizon(X, setting, t, hz);
  drawGround(X, setting, t, hz);
  drawWeather(X, setting.weather, t);
}
