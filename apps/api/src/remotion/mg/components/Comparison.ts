import { C, ell, font, pop, rr } from '../lib';
import type { ComponentDef } from './types';

export const Comparison: ComponentDef<{
  leftTitle: string;
  rightTitle: string;
  left: string[];
  right: string[];
}> = {
  draw(X, t, props, accent) {
    const cols: Array<[number, string, string[], string, number]> = [
      [285, props.leftTitle, props.left, accent, 0.05],
      [795, props.rightTitle, props.right, C.red, 0.25],
    ];
    for (const [x, title, items, col, t0] of cols) {
      const k = pop(t, t0);
      if (k <= 0) continue;
      X.save();
      X.translate(x, 860);
      X.scale(k, k);
      X.fillStyle = 'rgba(14,20,36,.92)';
      rr(X, -225, -240, 450, 480, 34);
      X.fill();
      X.fillStyle = col;
      rr(X, -225, -240, 450, 100, [34, 34, 0, 0]);
      X.fill();
      X.font = font(46);
      X.textAlign = 'center';
      X.textBaseline = 'middle';
      X.fillStyle = '#fff';
      X.fillText(title.toUpperCase(), 0, -188, 410);
      items.forEach((item, i) => {
        if (t < t0 + 0.4 + i * 0.22) return;
        const y = -80 + i * 110;
        ell(X, -175, y, 12, 12, col);
        X.font = font(34);
        X.textAlign = 'left';
        X.fillStyle = '#fff';
        X.fillText(item.toUpperCase(), -145, y + 2, 350);
      });
      X.restore();
    }
    const v = pop(t, 0.5) * (1 + 0.05 * Math.sin(t * 5));
    X.save();
    X.translate(540, 860);
    X.scale(v, v);
    ell(X, 0, 0, 70, 70, C.yellow);
    X.font = font(56);
    X.textAlign = 'center';
    X.textBaseline = 'middle';
    X.fillStyle = C.navy;
    X.fillText('VS', 0, 4);
    X.restore();
  },
};
