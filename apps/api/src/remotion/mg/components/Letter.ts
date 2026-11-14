import { C, font, pop, rr, toWords, wrapWords } from '../lib';
import type { ComponentDef } from './types';

export const Letter: ComponentDef<{ title: string }> = {
  draw(X, t, props) {
    const s = pop(t, 0.05, 0.35);
    X.save();
    X.translate(540, 1000 + Math.sin(t * 1.4) * 8);
    X.rotate(Math.sin(t * 0.9) * 0.015);
    X.scale(s, s);
    X.shadowColor = 'rgba(0,0,0,.4)';
    X.shadowBlur = 36;
    X.fillStyle = '#F4F6FA';
    rr(X, -300, -260, 600, 520, 24);
    X.fill();
    X.shadowBlur = 0;
    X.fillStyle = C.navy;
    X.textAlign = 'center';
    X.textBaseline = 'alphabetic';
    const lines = wrapWords(X, toWords(props.title.toUpperCase(), ''), font(40), 500).slice(0, 2);
    X.font = font(40);
    lines.forEach((ln, i) => X.fillText(ln.map((w) => w.t).join(' '), 0, -180 + i * 50, 520));
    X.fillStyle = '#B0B8C8';
    const shown = Math.floor(Math.min(6, t * 5));
    for (let i = 0; i < shown; i++) X.fillRect(-240, -70 + i * 48, i % 3 === 2 ? 300 : 480, 18);
    X.restore();
  },
};
