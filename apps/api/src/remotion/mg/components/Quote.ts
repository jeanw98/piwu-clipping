import { C, font, pop, rr, stamp } from '../lib';
import type { ComponentDef } from './types';

/** Speech bubble with a quote + optional rubber stamp (nvidia scene 3). */
export const Quote: ComponentDef<{ quote: string; stamp?: string }> = {
  dim: 0.2,
  draw(X, t, props) {
    const k = pop(t, 0.05, 0.35);
    X.save();
    X.translate(540, 980 + Math.sin(t * 1.5) * 6);
    X.scale(k, k);
    X.fillStyle = '#fff';
    X.shadowColor = 'rgba(0,0,0,.4)';
    X.shadowBlur = 30;
    rr(X, -400, -180, 800, 300, 60);
    X.fill();
    X.beginPath();
    X.moveTo(-120, 110);
    X.lineTo(-200, 240);
    X.lineTo(-20, 110);
    X.fill();
    X.shadowBlur = 0;
    X.fillStyle = C.navy;
    const q = props.quote.toUpperCase();
    X.font = font(q.length > 22 ? 46 : 60);
    X.textAlign = 'center';
    X.textBaseline = 'middle';
    X.fillText(q, 0, -30, 740);
    X.restore();
    if (props.stamp) stamp(X, props.stamp.toUpperCase(), 560, 1240, 0.9, t, C.red, 72);
  },
};
