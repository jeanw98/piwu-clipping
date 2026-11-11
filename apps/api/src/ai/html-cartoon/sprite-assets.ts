import type { WorldSpec } from './world-spec';

export interface CartoonSprite {
  key: string;
  kind: 'hero' | 'bg' | 'prop';
  prompt: string;
  width: number;
  height: number;
  /** data:image/png;base64,... */
  dataUrl: string;
}

export interface SpritePlanItem {
  key: string;
  kind: 'hero' | 'bg' | 'prop';
  prompt: string;
  width: number;
  height: number;
}

/** Max Leonardo stills per Cartoon clip (cost + latency budget). */
export const CARTOON_SPRITE_BUDGET = 4;

const STYLE =
  'flat 2D toy caricature, soft rounded shapes, bold outlines, vibrant colors, vertical mobile frame, no photorealism, no text, no watermark, no logo';

export function buildSpritePlan(
  spec: WorldSpec,
  userPrompt: string,
  styleAnchor: string,
): SpritePlanItem[] {
  const outfit = spec.character.outfitColors.join(', ');
  const palette = spec.world.palette.join(', ');
  const hero: SpritePlanItem = {
    key: 'hero',
    kind: 'hero',
    width: 768,
    height: 1344,
    prompt: [
      STYLE,
      `Single full-body character only: ${spec.character.role}.`,
      spec.character.silhouette,
      `Outfit colors ${outfit}.`,
      styleAnchor ? `Match: ${styleAnchor}` : '',
      'Centered, standing, facing camera, feet near bottom, empty solid #00FF00 chroma green background, no props behind character, cutout-ready.',
    ]
      .filter(Boolean)
      .join(' '),
  };

  const kits = [
    ...new Set(spec.perScene.map((s) => s.backdropKit).filter(Boolean)),
  ];
  const bgKeys = kits.slice(0, Math.max(1, CARTOON_SPRITE_BUDGET - 1));
  if (!bgKeys.length) bgKeys.push('main');

  const bgs: SpritePlanItem[] = bgKeys.map((kit, i) => ({
    key: i === 0 ? 'bg' : `bg_${kit}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40),
    kind: 'bg' as const,
    width: 768,
    height: 1344,
    prompt: [
      STYLE,
      `Empty environment background only (NO people, NO characters): ${spec.world.location}.`,
      `Backdrop kit: ${kit}. Mood: ${spec.world.mood}. Time: ${spec.world.timeOfDay}.`,
      `Palette ${palette}.`,
      `Topic: ${userPrompt.slice(0, 160)}`,
      'Full-bleed vertical scene, depth layers, clean composition for a puppet character in foreground.',
    ].join(' '),
  }));

  return [hero, ...bgs].slice(0, CARTOON_SPRITE_BUDGET);
}

export function spritesToDataUrlMap(
  sprites: CartoonSprite[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sprites) out[s.key] = s.dataUrl;
  return out;
}

/** JS object literal for shell injection (keys → data URLs). */
export function spritesToShellLiteral(sprites: CartoonSprite[]): string {
  const map = spritesToDataUrlMap(sprites);
  return JSON.stringify(map);
}

export function spriteApiDocs(sprites: CartoonSprite[]): string {
  if (!sprites.length) {
    return 'SPRITES: none loaded — use drawEnv/drawHero vector pack.';
  }
  const keys = sprites.map((s) => `${s.key}(${s.kind})`).join(', ');
  return `SPRITES loaded (Leonardo stills — PREFER these over vector mara):
Keys: ${keys}
API:
- spriteCover(key?) — full-bleed BG (default 'bg'). Returns true if drawn.
- spriteHero(cx, byFeet, scale, opts?) — character cutout with chroma; bob via opts.walk. Returns hand-ish points.
- hasSprite(key) — boolean
Always: spriteCover(...) then spriteHero(...) each scene. Vector drawEnv/drawHero only as fallback if sprite missing.`;
}
