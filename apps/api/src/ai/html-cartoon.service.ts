import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { EnvConfig } from '../config/env.schema';
import type { SceneCartoon } from '@piwu/shared';
import { LIBRARY_API_DOCS } from './html-cartoon/asset-library';
import { assembleCartoonHtml } from './html-cartoon/runtime-shell';

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

@Injectable()
export class HtmlCartoonService {
  private readonly logger = new Logger(HtmlCartoonService.name);
  private readonly client: Anthropic;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.client = new Anthropic({
      apiKey: this.config.get('ANTHROPIC_API_KEY', { infer: true }),
    });
  }

  async generateHtml(input: HtmlCartoonGenerateInput): Promise<string> {
    const sceneBlock = input.scenes
      .map((scene, i) => {
        const words = scene.narration.split(/\s+/).filter(Boolean).length;
        const designSec = Math.max(3.5, Math.round((words / 2.9) * 10) / 10);
        const cartoon = scene.cartoon
          ? `setting=${scene.cartoon.setting} action=${scene.cartoon.action} props=${(scene.cartoon.props ?? []).join(',') || 'none'}`
          : 'setting=generic action=talk';
        return `- S[${i}] design≈${designSec}s | ${cartoon}
  narration: ${scene.narration}
  visual: ${scene.visualPrompt}`;
      })
      .join('\n');

    const n = input.scenes.length;

    const system = `You choreograph vertical short-form cartoons for ANY topic.
Return ONLY a JavaScript snippet (no HTML, no markdown, no commentary).

A fixed QUALITY library is already loaded (detailed character + env helpers). The island beach helpers are just one pack — do NOT default every video to palms/ocean. Build whatever world the user prompt needs (kitchen, gym, city, office, bunker, classroom, space…).

${LIBRARY_API_DOCS}

YOUR JOB:
1) SC = [[0,a],[a,b],...] with exactly ${n} design-time ranges (~2.9 words/sec).
2) S[0]..S[${n - 1}] = function(t){...} with LOCAL t from 0.
3) Every scene: layered environment matching THIS topic + mara/hero + topic props + continuous motion for the FULL local duration.
4) Same character every scene (mara/hero). Recolor vest/shorts via opts if the topic needs it.
5) headline/pill for hooks. Do NOT draw voice captions (runtime does).
6) End with: window.SC=SC; window.S=S;

FORBIDDEN: Math.random (use rng), CSS, requestAnimationFrame, fetch, redefining library fns, stick figures, forcing beach/island visuals when the topic is unrelated.

Examples of topic → env:
- Cooking tip → room(...) + desk/counter via rr + mara holding a pan (local helper)
- City finance → citySkyline + mara + phone
- Survival bunker → sky sunset + ground + bunkerDoor + rubble + smoke
- Beach survival → sky + sea + sand + palm (only then)`;

    const user = `User idea / topic (THIS drives the world — adapt freely):
${input.prompt}

Title: ${input.title}
Character mood/colors (still use mara/hero): ${input.styleAnchor || 'friendly flat 2D caricature'}
Narration (mood only): ${input.audioScript}

Scenes (${n}):
${sceneBlock}

Write ONLY choreography JS for THIS topic (SC + S[0]…S[${n - 1}] + window.SC/window.S).`;

    this.logger.log(
      `Generating multi-topic choreography (${n} scenes)…`,
    );

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8_000,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude returned no choreography JS');
    }

    const scenesJs = this.extractJs(textBlock.text);
    return assembleCartoonHtml(input.width, input.height, scenesJs);
  }

  private extractJs(text: string): string {
    const fenced = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
    let raw = (fenced ? fenced[1] : text).trim();
    raw = raw.replace(/^<!DOCTYPE[\s\S]*?<script[^>]*>/i, '');
    raw = raw.replace(/<\/script>[\s\S]*$/i, '');
    if (!/SC\s*=/.test(raw) && !/S\[\s*0\s*\]/.test(raw)) {
      this.logger.warn('Claude choreography missing SC/S — using library default');
      return '';
    }
    return raw;
  }
}
