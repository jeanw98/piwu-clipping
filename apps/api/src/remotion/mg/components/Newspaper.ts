import { type Ctx, font, pop, rr, wrapWords, toWords } from '../lib';
import type { ComponentDef } from './types';

export const Newspaper: ComponentDef<{ masthead?: string; headline: string; source?: string }> = {
  pillY: 1250,
  draw(X: Ctx, t, props) {
    const s = 1.05 * pop(t, 0.05, 0.35);
    X.save();
    X.translate(540, 880 + Math.sin(t * 1.2) * 6);
    X.rotate(-0.05 + Math.sin(t * 0.8) * 0.01);
    X.scale(s, s);
    X.shadowColor = 'rgba(0,0,0,.45)';
    X.shadowBlur = 40;
    X.fillStyle = '#F3EFE4';
    rr(X, -360, -260, 720, 520, 12);
    X.fill();
    X.shadowBlur = 0;
    X.fillStyle = '#222';
    X.font = font(38);
    X.textAlign = 'center';
    X.textBaseline = 'alphabetic';
    X.fillText((props.masthead ?? 'EDICIÓN ESPECIAL').toUpperCase(), 0, -195, 640);
    X.fillRect(-320, -170, 640, 6);
    const lines = wrapWords(X, toWords(props.headline.toUpperCase(), ''), font(52), 640).slice(0, 2);
    X.font = font(52);
    lines.forEach((ln, i) => X.fillText(ln.map((w) => w.t).join(' '), 0, -100 + i * 60, 660));
    X.fillStyle = '#9C968A';
    for (let i = 0; i < 6; i++) X.fillRect(-320, 20 + i * 36, i % 3 === 2 ? 380 : 640, 14);
    if (props.source) {
      X.fillStyle = '#555';
      X.font = font(26);
      X.fillText(props.source.toUpperCase(), 0, 238, 640);
    }
    X.restore();
  },
};
