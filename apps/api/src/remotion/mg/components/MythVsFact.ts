import { C, bigX, check, font, pop, prog, rr } from '../lib';
import type { ComponentDef } from './types';

function card(X: CanvasRenderingContext2D, y: number, k: number, tag: string, text: string, col: string) {
  X.save();
  X.translate(540, y);
  X.scale(k, k);
  X.fillStyle = 'rgba(14,20,36,.92)';
  rr(X, -440, -100, 880, 200, 34);
  X.fill();
  X.strokeStyle = col;
  X.lineWidth = 8;
  rr(X, -440, -100, 880, 200, 34);
  X.stroke();
  X.font = font(34);
  const tw = X.measureText(tag).width + 60;
  X.fillStyle = col;
  rr(X, -440, -100, tw, 60, [34, 0, 34, 0]);
  X.fill();
  X.textAlign = 'center';
  X.textBaseline = 'middle';
  X.fillStyle = '#fff';
  X.fillText(tag, -440 + tw / 2, -68);
  X.font = font(text.length > 26 ? 40 : 48);
  X.fillText(text.toUpperCase(), 0, 22, 820);
  X.restore();
}

export const MythVsFact: ComponentDef<{ myth: string; fact: string }> = {
  draw(X, t, props, _accent, info) {
    const tf = Math.min(2.2, info.dur * 0.45);
    card(X, 770, pop(t, 0.05), 'MITO', props.myth, C.red);
    if (t > 0.6) bigX(X, 870, 730, 0.3, pop(t, 0.6));
    if (t > tf) {
      card(X, 1000, pop(t, tf), 'REALIDAD', props.fact, C.green);
      check(X, 890, 930, 1.2, prog(t, tf + 0.3, tf + 0.6));
    }
  },
};
