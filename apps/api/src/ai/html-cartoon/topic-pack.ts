import type { WorldSpec } from './world-spec';
import { CORE_API_DOCS } from './asset-library';

export function topicPackSystemPrompt(): string {
  return `You write a TOPIC ASSET PACK for a canvas cartoon runtime.
Return ONLY JavaScript (no markdown, no HTML, no SC/S scene code).

${CORE_API_DOCS}

REQUIRED functions (must define ALL):
1) function drawHero(cx, byFeet, scale, opts) { ... return [[hxL,hyL],[hxR,hyR]]; }
   opts may include: expr, walk, armL:[sh,fore], armR:[sh,fore], topColor, pantsColor, accentColor
   Detailed toy caricature (NOT stick figure). Match WorldSpec character outfit colors.
2) function drawEnv(t) { ... }  // full-bleed backdrop for the world (room/city/kitchen/gym/…)
3) Optional: function drawProp(name,x,y,s,t) and/or named helpers listed in packApi.props

Also assign: window.drawHero=drawHero; window.drawEnv=drawEnv; (and any extra helpers)

FORBIDDEN: Math.random (use rng), SC=, S[, requestAnimationFrame, fetch, eval, redefining core utils,
stick figures, beach/palm/ocean/island/mara orange vest UNLESS WorldSpec.forbiddenDefaults allows them.

Style: soft rounded rr/ell/lg shapes, flat 2D toy look, readable at 1080x1920.`;
}

export function topicPackUserPrompt(spec: WorldSpec, userPrompt: string): string {
  return `User topic:
${userPrompt}

WorldSpec JSON:
${JSON.stringify(spec, null, 2)}

Write the topic pack JS now (drawHero + drawEnv + props). Obey forbiddenDefaults.`;
}

export function packApiDocs(spec: WorldSpec): string {
  const envs = spec.packApi?.environments?.length
    ? spec.packApi.environments.join(', ')
    : 'drawEnv(t)';
  const props = spec.packApi?.props?.length
    ? spec.packApi.props.join(', ')
    : 'drawProp(name,x,y,s,t)';
  return `TOPIC PACK for THIS clip (prefer these over legacy mara):
- drawHero(cx, byFeet, scale, opts) → hand positions; outfit matches ${spec.character.outfitColors.join(', ')}
- Environments: ${envs}
- Props: ${props}
- World: ${spec.world.location} / ${spec.world.timeOfDay} / mood ${spec.world.mood}
- Forbidden defaults: ${spec.forbiddenDefaults.join(', ') || 'none'}
- Character role: ${spec.character.role}`;
}
