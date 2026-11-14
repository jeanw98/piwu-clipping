import { ell, glow, label } from '../lib';
import { silhouette } from './Silhouette';
import type { ComponentDef } from './types';

/** Investigation: magnifying glass sweeping over a silhouette. */
export const Magnifier: ComponentDef<{ label?: string }> = {
  draw(X, t, props, accent) {
    silhouette(X, 540, 1560, 1.15, '#1F2A22', accent);
    const mx = 540 + Math.sin(t * 1.6) * 120;
    const my = 1000 + Math.cos(t * 1.1) * 40;
    glow(X, mx, my, 220, '63,208,255', 0.15);
    X.save();
    X.translate(mx, my);
    X.strokeStyle = '#E7ECF5';
    ell(X, 0, 0, 120, 120, 'rgba(63,208,255,.18)');
    X.lineWidth = 22;
    X.beginPath();
    X.arc(0, 0, 120, 0, Math.PI * 2);
    X.stroke();
    X.lineCap = 'round';
    X.lineWidth = 34;
    X.beginPath();
    X.moveTo(85, 85);
    X.lineTo(190, 190);
    X.stroke();
    X.restore();
    if (props.label) label(X, props.label.toUpperCase(), 540, 1630, 40);
  },
};
