import { C, check, font, pop, prog, rr } from '../lib';
import type { ComponentDef } from './types';

/** Steps that enter staggered, each gets a ✓. */
export const ChecklistSteps: ComponentDef<{ steps: string[] }> = {
  draw(X, t, props, accent, info) {
    const n = props.steps.length;
    const gap = 140;
    const y0 = 860 - ((n - 1) * gap) / 2;
    const span = Math.max(1.2, info.dur - 1.2);
    props.steps.forEach((step, i) => {
      const t0 = 0.1 + i * 0.22;
      const k = pop(t, t0);
      if (k <= 0) return;
      const y = y0 + i * gap;
      X.save();
      X.translate(540, y);
      X.scale(k, k);
      X.fillStyle = 'rgba(20,33,61,.92)';
      rr(X, -440, -58, 880, 116, 30);
      X.fill();
      X.strokeStyle = accent;
      X.lineWidth = 4;
      rr(X, -440, -58, 880, 116, 30);
      X.stroke();
      X.font = font(42);
      X.textAlign = 'left';
      X.textBaseline = 'middle';
      X.fillStyle = '#fff';
      X.fillText(step.toUpperCase(), -320, 4, 720);
      X.font = font(36);
      X.fillStyle = C.yellow;
      X.textAlign = 'center';
      X.fillText(String(i + 1), -385, 4);
      X.restore();
      // ✓ lands progressively across the scene (synced loosely with narration)
      const tc = 0.6 + (i * span) / Math.max(1, n);
      check(X, 540 + 380, y, 0.9, prog(t, tc, tc + 0.3));
    });
  },
};
