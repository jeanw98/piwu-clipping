import { ease, label, lerp, pop, prog } from '../lib';
import { eye } from './Eye';
import { PINK, silhouette } from './Silhouette';
import type { ComponentDef } from './types';

export const SilhouettePair: ComponentDef<{ leftLabel: string; rightLabel: string; watch?: boolean }> = {
  draw(X, t, props, accent) {
    const p = ease(prog(t, 0, 0.8));
    silhouette(X, lerp(300, 330, p), 1500, 1.1 * pop(t, 0), '#1F2A22', accent);
    silhouette(X, lerp(800, 760, p), 1500, 1.0 * pop(t, 0.2), '#2A1F24', PINK);
    if (t > 0.3) label(X, props.leftLabel.toUpperCase(), 330, 1560, 38);
    if (t > 0.5) label(X, props.rightLabel.toUpperCase(), 760, 1560, 38);
    if (props.watch && t > 0.9) eye(X, 760, 820, 0.8 * pop(t, 0.9), t);
  },
};
