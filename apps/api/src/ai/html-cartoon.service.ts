import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { chromium } from 'playwright';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
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
import {
  captureQaJpegs,
  pickQaTimes,
  qaNeedsRegen,
  scoreQaFrames,
} from './html-cartoon/qa-frames';

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
  qaScore?: number;
  fallbackReason?: string;
}

@Injectable()
export class HtmlCartoonService {
  private readonly logger = new Logger(HtmlCartoonService.name);
  private readonly client: Anthropic;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.client = new Anthropic({
      apiKey: this.config.get('ANTHROPIC_API_KEY', { infer: true }),
    });
  }

  async generateHtml(
    input: HtmlCartoonGenerateInput,
  ): Promise<HtmlCartoonGenerateResult> {
    const n = input.scenes.length;
    let fallbackReason: string | undefined;

    // --- Stage 1: WorldSpec ---
    const worldSpec = await this.generateWorldSpec(input);
    this.logger.log(
      `WorldSpec ready → ${worldSpec.world.location} (${worldSpec.character.role})`,
    );

    // --- Stage 2: Topic pack ---
    let packJs = await this.generateTopicPack(input.prompt, worldSpec);
    let packCheck = validateTopicPackJs(packJs);
    if (!packCheck.ok) {
      this.logger.warn(`Topic pack invalid (${packCheck.reason}) — retry once`);
      packJs = await this.generateTopicPack(input.prompt, worldSpec, true);
      packCheck = validateTopicPackJs(packJs);
    }
    if (!packCheck.ok) {
      fallbackReason = `pack_fallback:${packCheck.reason}`;
      this.logger.warn(`Topic pack failed — using generic fallback`);
      packJs = genericFallbackPackJs(worldSpec.world.palette);
      packCheck = validateTopicPackJs(packJs);
      if (!packCheck.ok) {
        packJs = genericFallbackPackJs(worldSpec.world.palette);
      } else {
        packJs = packCheck.js;
      }
    } else {
      packJs = packCheck.js;
    }

    // --- Stage 3: Choreography ---
    let scenesJs = await this.generateChoreography(input, worldSpec, packJs);
    let html = assembleCartoonHtml(
      input.width,
      input.height,
      scenesJs,
      packJs,
    );

    // --- Stage 4: QA smoke (1 regen) ---
    let qaScore: number | undefined;
    try {
      const qa = await this.runSmokeQa(html, input, worldSpec);
      qaScore = qa.score;
      this.logger.log(
        `QA score=${qa.score} island=${qa.offTopicIsland} defects=${qa.defects.join(';') || 'none'}`,
      );
      if (qaNeedsRegen(qa)) {
        this.logger.warn('QA below threshold — regenerating pack+choreo once');
        packJs = await this.generateTopicPack(input.prompt, worldSpec, true);
        packCheck = validateTopicPackJs(packJs);
        packJs = packCheck.ok
          ? packCheck.js
          : genericFallbackPackJs(worldSpec.world.palette);
        scenesJs = await this.generateChoreography(input, worldSpec, packJs);
        html = assembleCartoonHtml(
          input.width,
          input.height,
          scenesJs,
          packJs,
        );
        const qa2 = await this.runSmokeQa(html, input, worldSpec);
        qaScore = qa2.score;
        this.logger.log(`QA after regen score=${qa2.score}`);
        if (!fallbackReason && qaNeedsRegen(qa2)) {
          fallbackReason = `qa_low:${qa2.score}`;
        }
      }
    } catch (error) {
      this.logger.warn(`QA skipped: ${(error as Error).message}`);
    }

    return {
      html,
      worldSpec,
      packBytes: Buffer.byteLength(packJs, 'utf8'),
      qaScore,
      fallbackReason,
    };
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
    _packJs: string,
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

${packApiDocs(spec)}

YOUR JOB:
1) SC = [[0,a],[a,b],...] with exactly ${n} design-time ranges matching the design≈ seconds below.
2) S[0]..S[${n - 1}] = function(t){...} with LOCAL t from 0.
3) Every scene MUST call drawEnv(t) (or a pack env helper) then drawHero(...). Use drawProp/pack props from WorldSpec.
4) Continuous motion for the FULL local duration. Align to per-scene motionBeat.
5) headline/pill for hooks from textHook when present. Do NOT draw voice captions.
6) End with: window.SC=SC; window.S=S;

FORBIDDEN: Math.random (use rng), CSS, requestAnimationFrame, fetch, redefining library/pack fns,
stick figures, inventing a second character, beach/palm/ocean/island visuals when listed in forbiddenDefaults.
Prefer drawHero over legacy mara/hero.`;

    const user = `User idea / topic:
${input.prompt}

Title: ${input.title}
Character: ${spec.character.role} — ${input.styleAnchor || ''}
Forbidden: ${spec.forbiddenDefaults.join(', ') || 'none'}
Narration mood: ${input.audioScript}

Scenes (${n}):
${sceneBlock}

Write ONLY choreography JS (SC + S[0]…S[${n - 1}] + window.SC/window.S).`;

    this.logger.log(`Generating pack-aware choreography (${n} scenes)…`);

    // Parallel per-scene if many scenes to avoid truncation
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
          js = `S[${i}]=function(t){ if(typeof drawEnv==='function')drawEnv(t); (typeof drawHero==='function'?drawHero:hero)(540,1360,1.05,{expr:'talk',walk:t*3}); headline([['SCENE ${i}','SCENE']],440,.2,t,72); };`;
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

  private async runSmokeQa(
    html: string,
    input: HtmlCartoonGenerateInput,
    spec: WorldSpec,
  ) {
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piwu-qa-'));
    const htmlPath = path.join(workDir, 'index.html');
    try {
      await fs.writeFile(htmlPath, html, 'utf8');
      // Copy font if present next to package
      const fontSrc = path.join(
        __dirname,
        'html-cartoon',
        'fonts',
        'Poppins-Bold.ttf',
      );
      try {
        await fs.mkdir(path.join(workDir, 'fonts'), { recursive: true });
        await fs.copyFile(
          fontSrc,
          path.join(workDir, 'fonts', 'Poppins-Bold.ttf'),
        );
      } catch {
        /* font optional for QA */
      }

      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      try {
        const page = await browser.newPage({
          viewport: { width: input.width, height: input.height },
          deviceScaleFactor: 1,
        });
        await page.goto(`file://${htmlPath}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });
        await page.waitForFunction(
          () => typeof (window as unknown as { render?: unknown }).render === 'function',
          undefined,
          { timeout: 15_000 },
        );
        const times = pickQaTimes(input.durationSec, input.scenes.length);
        const frames = await captureQaJpegs(page, times);
        return scoreQaFrames(this.client, frames, spec, input.prompt);
      } finally {
        await browser.close();
      }
    } finally {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
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
