import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { EnvConfig } from '../config/env.schema';
import type { SceneCartoon } from '@piwu/shared';
import { CORE_API_DOCS } from './html-cartoon/asset-library';
import { assembleCartoonHtml } from './html-cartoon/runtime-shell';
import {
  fallbackWorldSpec,
  parseWorldSpec,
  worldSpecSystemPrompt,
  type WorldSpec,
} from './html-cartoon/world-spec';
import {
  packApiDocs,
  topicPackSystemPrompt,
  topicPackUserPrompt,
} from './html-cartoon/topic-pack';
import {
  genericFallbackPackJs,
  validateTopicPackJs,
} from './html-cartoon/pack-validate';
import { LeonardoService } from './leonardo.service';
import {
  buildSpritePlan,
  spriteApiDocs,
  spritesToShellLiteral,
  type CartoonSprite,
} from './html-cartoon/sprite-assets';

export interface HtmlCartoonSceneInput {
  index: number;
  narration: string;
  visualPrompt: string;
  durationSec: number;
  startSec?: number;
  endSec?: number;
  cartoon?: SceneCartoon;
}

export interface HtmlCartoonGenerateInput {
  title: string;
  prompt: string;
  styleAnchor: string;
  audioScript: string;
  durationSec: number;
  width: number;
  height: number;
  scenes: HtmlCartoonSceneInput[];
}

export interface HtmlCartoonGenerateResult {
  html: string;
  worldSpec: WorldSpec;
  packBytes: number;
  spriteCount: number;
  sprites: CartoonSprite[];
  fallbackReason?: string;
}

@Injectable()
export class HtmlCartoonService {
  private readonly logger = new Logger(HtmlCartoonService.name);
  private readonly client: Anthropic;

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly leonardo: LeonardoService,
  ) {
    this.client = new Anthropic({
      apiKey: this.config.get('ANTHROPIC_API_KEY', { infer: true }),
    });
  }

  /**
   * Slim Cartoon happy path: WorldSpec → Leonardo sprites → choreography.
   * Topic-pack JS only when sprites fail (vector fallback).
   * No QA Playwright / vision regen (record pass is the single browser use).
   */
  async generateHtml(
    input: HtmlCartoonGenerateInput,
  ): Promise<HtmlCartoonGenerateResult> {
    let fallbackReason: string | undefined;

    const worldSpec = await this.generateWorldSpec(input);
    this.logger.log(
      `WorldSpec ready → ${worldSpec.world.location} (${worldSpec.character.role})`,
    );

    const sprites = await this.generateSprites(input, worldSpec);
    const spritesLiteral = spritesToShellLiteral(sprites);
    this.logger.log(`Cartoon sprites ready → ${sprites.length}`);

    const hasHero = sprites.some((s) => s.key === 'hero');
    const hasBg = sprites.some((s) => s.kind === 'bg');
    let packJs = '';

    // Topic pack only when sprites are missing — avoid extra Claude call on happy path
    if (!hasHero || !hasBg) {
      fallbackReason = `sprites_partial:hero=${hasHero},bg=${hasBg}`;
      this.logger.warn(
        'Sprites incomplete — generating vector topic pack as fallback',
      );
      packJs = await this.loadTopicPack(input.prompt, worldSpec);
    }

    let scenesJs = await this.generateChoreography(input, worldSpec, sprites);
    if (!scenesJs.trim()) {
      if (!packJs) {
        fallbackReason = `${fallbackReason ? fallbackReason + ';' : ''}choreo_empty`;
        packJs = await this.loadTopicPack(input.prompt, worldSpec);
      }
      scenesJs = '';
    }

    const html = assembleCartoonHtml(
      input.width,
      input.height,
      scenesJs,
      packJs,
      spritesLiteral,
    );

    return {
      html,
      worldSpec,
      packBytes: Buffer.byteLength(packJs, 'utf8'),
      spriteCount: sprites.length,
      sprites,
      fallbackReason,
    };
  }

  private async loadTopicPack(
    userPrompt: string,
    worldSpec: WorldSpec,
  ): Promise<string> {
    let packJs = await this.generateTopicPack(userPrompt, worldSpec);
    let packCheck = validateTopicPackJs(packJs);
    if (!packCheck.ok) {
      packJs = genericFallbackPackJs(worldSpec.world.palette);
      packCheck = validateTopicPackJs(packJs);
      return packCheck.ok ? packCheck.js : packJs;
    }
    return packCheck.js;
  }

  private async generateSprites(
    input: HtmlCartoonGenerateInput,
    spec: WorldSpec,
  ): Promise<CartoonSprite[]> {
    const plan = buildSpritePlan(spec, input.prompt, input.styleAnchor);
    const out: CartoonSprite[] = [];
    await Promise.all(
      plan.map(async (item) => {
        try {
          const buf = await this.leonardo.generateImage(item.prompt, {
            width: item.width,
            height: item.height,
          });
          out.push({
            key: item.key,
            kind: item.kind,
            prompt: item.prompt,
            width: item.width,
            height: item.height,
            dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
          });
        } catch (error) {
          this.logger.warn(
            `Sprite ${item.key} failed: ${(error as Error).message}`,
          );
        }
      }),
    );
    return out;
  }

  private async generateWorldSpec(
    input: HtmlCartoonGenerateInput,
  ): Promise<WorldSpec> {
    const n = input.scenes.length;
    try {
      const sceneHints = input.scenes
        .map((s, i) => {
          const c = s.cartoon
            ? `${s.cartoon.setting}/${s.cartoon.action}`
            : 'generic/talk';
          return `${i}: ${c} — ${s.visualPrompt || s.narration.slice(0, 80)}`;
        })
        .join('\n');

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 2_000,
        system: worldSpecSystemPrompt(n),
        messages: [
          {
            role: 'user',
            content: `User idea / topic:
${input.prompt}

Title: ${input.title}
Style anchor: ${input.styleAnchor || 'friendly flat 2D host'}
Scene hints:
${sceneHints}

Return WorldSpec JSON only.`,
          },
        ],
      });
      const textBlock = response.content.find((b) => b.type === 'text');
      const raw =
        textBlock && textBlock.type === 'text' ? textBlock.text : '';
      return parseWorldSpec(raw, input.prompt, n, input.styleAnchor);
    } catch (error) {
      this.logger.warn(
        `WorldSpec Claude failed: ${(error as Error).message}`,
      );
      return fallbackWorldSpec(input.prompt, n, input.styleAnchor);
    }
  }

  private async generateTopicPack(
    userPrompt: string,
    spec: WorldSpec,
    stricter = false,
  ): Promise<string> {
    const extra = stricter
      ? '\nSTRICT: No beach/palm/ocean unless explicitly in WorldSpec.location. drawHero must use outfitColors from WorldSpec.'
      : '';
    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 6_000,
      system: topicPackSystemPrompt() + extra,
      messages: [
        {
          role: 'user',
          content: topicPackUserPrompt(spec, userPrompt),
        },
      ],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return '';
    }
    return textBlock.text;
  }

  private async generateChoreography(
    input: HtmlCartoonGenerateInput,
    spec: WorldSpec,
    sprites: CartoonSprite[],
  ): Promise<string> {
    const n = input.scenes.length;
    const sceneBlock = input.scenes
      .map((scene, i) => {
        const designSec = this.designSecondsForScene(scene);
        const ws = spec.perScene[i];
        const cartoon = scene.cartoon
          ? `setting=${scene.cartoon.setting} action=${scene.cartoon.action}`
          : '';
        return `- S[${i}] design≈${designSec}s | ${cartoon}
  narration: ${scene.narration}
  visual: ${scene.visualPrompt}
  worldBeat: kit=${ws?.backdropKit ?? 'main'} props=${(ws?.keyProps ?? []).join(',') || 'none'} motion=${ws?.motionBeat ?? 'talk'} hook=${ws?.textHook || '—'}`;
      })
      .join('\n');

    const system = `You choreograph vertical short-form cartoons for THIS topic only.
Return ONLY a JavaScript snippet (no HTML, no markdown).

${CORE_API_DOCS}

${spriteApiDocs(sprites)}

${packApiDocs(spec)}

YOUR JOB:
1) SC = [[0,a],[a,b],...] with exactly ${n} design-time ranges matching the design≈ seconds below.
2) S[0]..S[${n - 1}] = function(t){...} with LOCAL t from 0.
3) Every scene FIRST try spriteCover('bg' or scene bg key) then spriteHero(cx,by,scale,{walk:t*…}).
   Only if !hasSprite(...): drawEnv(t) / drawHero(...).
4) Continuous motion for the FULL local duration. Align to motionBeat.
5) headline/pill for hooks from textHook when present. Do NOT draw voice captions.
6) End with: window.SC=SC; window.S=S;

FORBIDDEN: Math.random (use rng), CSS, requestAnimationFrame, fetch, redefining library/pack fns,
stick figures, inventing a second character, beach/palm/ocean/island when forbidden.
Prefer Leonardo sprites over vector mara.`;

    const user = `User idea / topic:
${input.prompt}

Title: ${input.title}
Character: ${spec.character.role} — ${input.styleAnchor || ''}
Forbidden: ${spec.forbiddenDefaults.join(', ') || 'none'}
Narration mood: ${input.audioScript}

Scenes (${n}):
${sceneBlock}

Write ONLY choreography JS (SC + S[0]…S[${n - 1}] + window.SC/window.S).`;

    this.logger.log(`Generating sprite-first choreography (${n} scenes)…`);

    if (n > 5) {
      return this.generateChoreographyParallel(input, spec, system);
    }

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 10_000,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude returned no choreography JS');
    }

    return this.extractJs(textBlock.text);
  }

  private async generateChoreographyParallel(
    input: HtmlCartoonGenerateInput,
    spec: WorldSpec,
    systemBase: string,
  ): Promise<string> {
    const n = input.scenes.length;
    const designSecs = input.scenes.map((s) => this.designSecondsForScene(s));
    let cursor = 0;
    const scPairs: Array<[number, number]> = designSecs.map((d) => {
      const a = cursor;
      cursor = Math.round((cursor + d) * 10) / 10;
      return [a, cursor];
    });

    const parts = await Promise.all(
      input.scenes.map(async (scene, i) => {
        const ws = spec.perScene[i];
        const designSec = designSecs[i]!;
        const response = await this.client.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 2_500,
          system: `${systemBase}

You write ONLY: S[${i}]=function(t){...};  (no SC, no window assignment)`,
          messages: [
            {
              role: 'user',
              content: `Scene ${i} design≈${designSec}s
narration: ${scene.narration}
visual: ${scene.visualPrompt}
kit=${ws?.backdropKit} props=${(ws?.keyProps ?? []).join(',')} motion=${ws?.motionBeat}
forbidden: ${spec.forbiddenDefaults.join(', ')}
Topic: ${input.prompt}`,
            },
          ],
        });
        const textBlock = response.content.find((b) => b.type === 'text');
        const raw =
          textBlock && textBlock.type === 'text' ? textBlock.text : '';
        let js = this.extractLooseJs(raw);
        if (!new RegExp(`S\\[\\s*${i}\\s*\\]\\s*=`).test(js)) {
          js = `S[${i}]=function(t){ if(!spriteCover('bg')&&typeof drawEnv==='function')drawEnv(t); if(!spriteHero(540,1360,1.05,{walk:t*3}))(typeof drawHero==='function'?drawHero:hero)(540,1360,1.05,{expr:'talk',walk:t*3}); headline([['SCENE ${i}','SCENE']],440,.2,t,72); };`;
        }
        return js;
      }),
    );

    return `SC=${JSON.stringify(scPairs)};\nwindow.SC=SC;\n${parts.join('\n')}\nwindow.S=S;`;
  }

  private designSecondsForScene(scene: HtmlCartoonSceneInput): number {
    if (
      typeof scene.startSec === 'number' &&
      typeof scene.endSec === 'number' &&
      scene.endSec > scene.startSec
    ) {
      return Math.max(
        2.5,
        Math.round((scene.endSec - scene.startSec) * 10) / 10,
      );
    }
    const words = scene.narration.split(/\s+/).filter(Boolean).length;
    return Math.max(3.5, Math.round((words / 2.9) * 10) / 10);
  }

  private extractJs(text: string): string {
    const raw = this.extractLooseJs(text);
    if (!/SC\s*=/.test(raw) && !/S\[\s*0\s*\]/.test(raw)) {
      this.logger.warn('Claude choreography missing SC/S — using library default');
      return '';
    }
    return raw;
  }

  private extractLooseJs(text: string): string {
    const fenced = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
    let raw = (fenced ? fenced[1] : text).trim();
    raw = raw.replace(/^<!DOCTYPE[\s\S]*?<script[^>]*>/i, '');
    raw = raw.replace(/<\/script>[\s\S]*$/i, '');
    return raw;
  }
}
