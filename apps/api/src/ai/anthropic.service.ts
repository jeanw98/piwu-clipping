import { fitHighlightWindow, sentenceEndTimes, transcriptLines } from './highlight-fit';
import type { TranscriptSegment } from './whisper.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  LANGUAGE_LABELS,
  MediaAssetType,
  demoteExcessVideoScenes,
  fitSceneDurations,
  motionGraphicsSpecSchema,
  sceneBudgetForDuration,
  titleCardFallback,
  validateMgScenes,
  VISUAL_STYLE_LOCK,
  type ClipLanguage,
  type ClipOrientation,
  type GeneratedScript,
  type MotionGraphicsSpec,
  type StylePreset,
  type VisualStyle,
  type WordTimestamp,
} from '@piwu/shared';
import type { EnvConfig } from '../config/env.schema';
import { repairMgSpec } from './mg-spec-repair';
import {
  motionGraphicsClipBrief,
  motionGraphicsSystemPrompt,
} from './motion-graphics.prompt';
import { loadLibrary } from '../clips/mg-assets';

/** Object / place names for the prompt, from the emoji library (stable order). */
let catalogCache: { catalog: string; places: string } | null = null;
function mgCatalog(): { catalog: string; places: string } {
  if (catalogCache) return catalogCache;
  const library = loadLibrary();
  const objectGroups = new Set([
    'Animals & Nature',
    'Food & Drink',
    'Travel & Places',
    'Activities',
    'Objects',
  ]);
  // People by role / fantasy characters and a few emotion props are useful
  // story elements (astronaut, cook, zombie, ghost, zzz…); generic gendered
  // variants and hand gestures are left out.
  const extraPeople = (name: string, group: string) =>
    (group === 'People & Body' &&
      !/\b(man|woman|men|women|hand|hands|finger|fingers|thumbs|fist|palm|palms|nail|selfie|kiss|couple|family|holding|backhand|index|pinched|pinching|crossed|vulcan|sign|writing|ok|victory|horns|call me|waving|clapping|raised|folded|open|leftwards|rightwards|handshake|gesturing|facepalming|frowning|pouting|tipping|bowing|shrugging|kneeling|standing|wheelchair|facing right|breast-feeding|biting|mx|mrs)\b/.test(name)) ||
    (group === 'Smileys & Emotion' && !name.includes('face') && !name.includes('heart') && !name.includes('cat'));
  const names = library
    .filter((e) => objectGroups.has(e.group) || extraPeople(e.name.toLowerCase(), e.group))
    .map((e) => e.name.toLowerCase());
  const places = library
    .filter((e) => e.group === 'Travel & Places' && /building|house|castle|stadium|temple|church|mosque|school|hospital|hotel|bank|factory|office|store|tower|statue|volcano|mountain|island|desert|camping|park|bridge|fountain|tent|beach|city|night|sunrise|sunset|shrine|mount|stadium/.test(e.name.toLowerCase()))
    .map((e) => e.name.toLowerCase())
    .filter((name) => name !== 'love hotel');
  catalogCache = { catalog: names.join(', '), places: places.join(', ') };
  return catalogCache;
}

export interface HighlightMoment {
  startSec: number;
  endSec: number;
  title: string;
  score: number;
  reason: string;
}

export interface ScriptReferenceImage {
  mime: string;
  base64: string;
  role?: 'style' | 'protagonist' | 'scenery';
}

export interface ScriptGenerationOptions {
  stylePreset?: StylePreset;
  durationSec?: number;
  orientation?: ClipOrientation;
  aspectLabel?: string;
  language?: ClipLanguage;
  visualStyle?: VisualStyle;
  maxVideoScenes?: number;
  referenceImages?: ScriptReferenceImage[];
  hasSeriesMemory?: boolean;
}

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);
  private readonly client: Anthropic;
  private readonly model: string;
  /** Token usage of the last Motion Graphics spec call (QA / cost reports). */
  lastMgUsage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    attempts: number;
  } | null = null;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.client = new Anthropic({
      apiKey: this.config.get('ANTHROPIC_API_KEY', { infer: true }),
    });
    this.model = this.config.get('ANTHROPIC_MODEL', { infer: true });
  }

  /**
   * Motion Graphics spec (data only). Validates with zod; on failure retries
   * once with the validation errors. If it still fails, invalid scenes fall
   * back to TitleCard.
   */
  async generateMotionGraphicsSpec(
    prompt: string,
    options: { language?: ClipLanguage; durationSec?: number } = {},
  ): Promise<MotionGraphicsSpec> {
    // Stable instructions + asset catalog are cached; the clip brief is not.
    const system: Anthropic.TextBlockParam[] = [
      {
        type: 'text',
        text: motionGraphicsSystemPrompt(mgCatalog()),
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: motionGraphicsClipBrief({
          language: options.language ?? 'es-LA',
          durationSec: options.durationSec ?? 45,
          today: new Date().toISOString().slice(0, 10),
        }),
      },
    ];
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: `Create a Motion Graphics spec for this prompt:\n${prompt}`,
      },
    ];
    let lastRaw: unknown = null;
    let lastErrors: string[] = [];
    this.lastMgUsage = null;
    const total = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, attempts: 0 };
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8000,
        system,
        messages,
      });
      const usage = response.usage as Anthropic.Usage & {
        cache_read_input_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
      };
      total.input += usage.input_tokens;
      total.output += usage.output_tokens;
      total.cacheRead += usage.cache_read_input_tokens ?? 0;
      total.cacheWrite += usage.cache_creation_input_tokens ?? 0;
      total.attempts = attempt + 1;
      this.lastMgUsage = { ...total };
      this.logger.log(
        `Motion Graphics spec attempt ${attempt + 1}: in=${usage.input_tokens} cacheRead=${usage.cache_read_input_tokens ?? 0} cacheWrite=${usage.cache_creation_input_tokens ?? 0} out=${usage.output_tokens}`,
      );
      const textBlock = response.content.find((block) => block.type === 'text');
      const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';
      try {
        lastRaw = this.extractJson(text);
      } catch (error) {
        lastRaw = null;
        lastErrors = [`Invalid JSON: ${(error as Error).message}`];
      }
      if (lastRaw) {
        let parsed = motionGraphicsSpecSchema.safeParse(lastRaw);
        if (!parsed.success) {
          // Free local fixes first (lengths, partial settings, cue indexes).
          const repaired = motionGraphicsSpecSchema.safeParse(
            repairMgSpec(lastRaw, parsed.error.issues),
          );
          if (repaired.success) {
            this.logger.log(
              `Motion Graphics spec repaired locally: ${parsed.error.issues.length} issue(s)`,
            );
            parsed = repaired;
          }
        }
        if (parsed.success) return parsed.data;
        lastErrors = parsed.error.issues
          .slice(0, 20)
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
      this.logger.warn(
        `Motion Graphics spec invalid (attempt ${attempt + 1}): ${lastErrors.join(' | ')}`,
      );
      messages.push(
        { role: 'assistant', content: text || '{}' },
        {
          role: 'user',
          content: `That JSON failed validation:\n- ${lastErrors.join('\n- ')}\nReturn the full corrected JSON only. Use only components from the catalog.`,
        },
      );
    }
    return this.repairMotionGraphicsSpec(lastRaw, lastErrors);
  }

  private repairMotionGraphicsSpec(
    raw: unknown,
    errors: string[],
  ): MotionGraphicsSpec {
    const data = (raw ?? {}) as { scenes?: unknown[] } & Record<string, unknown>;
    const rawScenes = Array.isArray(data.scenes) ? data.scenes : [];
    const { scenes } = validateMgScenes(rawScenes);
    const repaired = {
      ...data,
      scenes: scenes.map(
        (scene, index) => scene ?? titleCardFallback(rawScenes[index], index + 1),
      ),
    };
    const parsed = motionGraphicsSpecSchema.safeParse(repaired);
    if (!parsed.success) {
      throw new Error(
        `Motion Graphics spec could not be validated: ${errors.slice(0, 5).join(' | ')}`,
      );
    }
    this.logger.warn('Motion Graphics spec repaired with TitleCard fallbacks');
    return parsed.data;
  }

  async generateScript(
    prompt: string,
    options: ScriptGenerationOptions = {},
  ): Promise<GeneratedScript> {
    const stylePreset = options.stylePreset ?? 'viral';
    const durationSec = options.durationSec ?? 30;
    const orientation = options.orientation ?? 'portrait';
    const aspectLabel = options.aspectLabel ?? '9:16';
    const language = options.language ?? 'es-LA';
    const languageMeta = LANGUAGE_LABELS[language];
    const visualStyle = options.visualStyle ?? 'ugc';
    const styleLock = VISUAL_STYLE_LOCK[visualStyle];
    const budget = sceneBudgetForDuration(durationSec, options.maxVideoScenes);
    const framing =
      orientation === 'portrait'
        ? 'vertical framing, subject centered with headroom'
        : orientation === 'landscape'
          ? 'widescreen cinematic framing'
          : 'centered square composition with safe margins';

    const languageInstruction =
      language === 'es-LA'
        ? 'Write title, audioScript, and narration in neutral Latin American Spanish (español latino neutro). Avoid Spain-only slang.'
        : language === 'es-ES'
          ? 'Write title, audioScript, and narration in European Spanish (español de España).'
          : language === 'pt-BR'
            ? 'Write title, audioScript, and narration in Brazilian Portuguese.'
            : language === 'en-GB'
              ? 'Write title, audioScript, and narration in British English.'
              : language.startsWith('en')
                ? 'Write title, audioScript, and narration in American English.'
                : `Write title, audioScript, and narration in ${languageMeta.label} (${languageMeta.detail}).`;

    const videoRule =
      budget.maxVideoScenes <= 0
        ? 'Every scene type must be IMAGE. Do not request VIDEO.'
        : budget.maxVideoScenes >= budget.maxScenes
          ? `Every scene type must be VIDEO (full animated). Create up to ${budget.maxScenes} scenes, all VIDEO.`
          : `At most ${budget.maxVideoScenes} scenes may be type VIDEO (the hook, then one payoff). Every other scene must be IMAGE.`;
    const videoWhen =
      budget.maxVideoScenes > 0
        ? `
VIDEO only where movement tells the story: use type VIDEO only for a visible physical action (falling, opening, exploding, running, sinking, transforming). "Person explaining", talking heads and data/facts are ALWAYS IMAGE — even if VIDEO slots remain unused.
Every VIDEO scene MUST include "motion": subject + physical action + camera + what does not change. Example: "the ship tilts and slowly sinks, fixed camera, waves rise, no scene change". English, under 30 words. IMAGE scenes omit "motion".`
        : '';
    const sceneRules = `
styleAnchor names one subject that appears in every scene. Repeat that subject in every visualPrompt.
visualPrompt rules: English only; style + subject + setting; NO narration, NO on-screen text instructions, NO bullet lists, under 40 words.
VIDEO scenes are animated from a keyframe. IMAGE scenes stay stills.`;
    const system = `You are an expert short-form viral video writer.
Return ONLY valid JSON matching this schema:
{
  "title": string,
  "styleAnchor": string (one English sentence: the recurring subject and look),
  "audioScript": string (full narration spoken continuously),
  "scenes": [
    {
      "index": number (0-based),
      "narration": string,
      "visualPrompt": string (short visual description),
      "type": "IMAGE" | "VIDEO",
      "durationSec": number (2-5),
      "motion": string (VIDEO scenes only)
    }
  ]
}
HARD LIMITS — do not exceed:
- Target total runtime EXACTLY ${budget.targetSeconds} seconds.
- Create ${budget.minScenes}-${budget.maxScenes} scenes whose durationSec values SUM to ${budget.targetSeconds}.
- audioScript MUST be ≤ ${budget.maxNarrationWords} words.
- The first sentence is the hook. No greeting, no "hey guys", no filler.
- One idea only. The last sentence is a short payoff or CTA.
- ${videoRule}
Aspect ratio: ${aspectLabel}. Orientation: ${orientation}. Visual prompts must specify ${framing}.
Pacing preset: ${stylePreset}.
Visual style: ${styleLock.label}. ${styleLock.suffix}. ${styleLock.avoid}.
Language: ${language}. ${languageInstruction}
${sceneRules}${videoWhen}
${
  options.referenceImages?.length
    ? 'Reference images are attached with roles (protagonist / scenery / style). Match protagonist identity, scenery/locations, and style palette in styleAnchor and every visualPrompt. Keep the subject from the text prompt.'
    : ''
}
${
  options.hasSeriesMemory
    ? 'A SERIES / PROJECT BRIEF and SERIES MEMORY are in the user message. Stay consistent with prior clips: same protagonist, recurring locations, and visual language.'
    : ''
}`;

    try {
      const refBlocks: Array<
        | { type: 'text'; text: string }
        | {
            type: 'image';
            source: {
              type: 'base64';
              media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
              data: string;
            };
          }
      > = [];
      for (const image of (options.referenceImages ?? []).slice(0, 7)) {
        const roleLabel =
          image.role === 'protagonist'
            ? 'PROTAGONIST reference (character identity)'
            : image.role === 'scenery'
              ? 'SCENERY reference (environment / location)'
              : image.role === 'style'
                ? 'STYLE reference (art direction / palette)'
                : 'Reference image';
        refBlocks.push({ type: 'text', text: roleLabel });
        refBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mime as
              | 'image/jpeg'
              | 'image/png'
              | 'image/webp'
              | 'image/gif',
            data: image.base64,
          },
        });
      }
      const userContent: Anthropic.MessageCreateParams['messages'][0]['content'] =
        [
          ...refBlocks,
          {
            type: 'text' as const,
            text: `Create a short-form clip script for this prompt:\n${prompt}`,
          },
        ];

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system,
        messages: [
          {
            role: 'user',
            content: userContent,
          },
        ],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Claude returned no text content');
      }

      const json = this.extractJson(textBlock.text);
      return this.normalizeScript(
        json,
        budget.targetSeconds,
        budget.maxScenes,
        budget.maxVideoScenes,
      );
    } catch (error) {
      this.logger.warn(
        `Claude script generation failed, using fallback: ${(error as Error).message}`,
      );
      return this.fallbackScript(
        prompt,
        stylePreset,
        budget.targetSeconds,
        aspectLabel,
        language,
        budget.maxVideoScenes,
        styleLock.suffix,
      );
    }
  }

  /**
   * One JSON answer, optionally letting Claude search the web first (server
   * tool). If web search is unavailable for the account, retries without it.
   */
  async completeJson(
    system: string,
    user: string,
    options: { webSearch?: boolean; maxSearches?: number; maxTokens?: number } = {},
  ): Promise<{ json: unknown; usedWebSearch: boolean }> {
    const maxTokens = options.maxTokens ?? 8000;
    const ask = async (webSearch: boolean) => {
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: user }];
      // pause_turn: a long server-tool turn can pause; resend to let it continue.
      for (let turn = 0; turn < 4; turn++) {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: maxTokens,
          system,
          messages,
          ...(webSearch
            ? {
                tools: [
                  {
                    type: 'web_search_20250305',
                    name: 'web_search',
                    max_uses: options.maxSearches ?? 5,
                  },
                ] as unknown as Anthropic.Tool[],
              }
            : {}),
        });
        const stop = response.stop_reason as string;
        if (stop === 'pause_turn') {
          messages.push({ role: 'assistant', content: response.content as Anthropic.ContentBlockParam[] });
          continue;
        }
        if (stop === 'refusal') throw new Error('Claude declined the request');
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        return this.extractJson(text);
      }
      throw new Error('Claude did not finish the answer');
    };
    if (options.webSearch) {
      try {
        return { json: await ask(true), usedWebSearch: true };
      } catch (error) {
        this.logger.warn(`Web search answer failed, retrying without it: ${(error as Error).message.slice(0, 200)}`);
      }
    }
    return { json: await ask(false), usedWebSearch: false };
  }

  private extractJson(text: string): unknown {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : text;
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new Error('No JSON object found in Claude response');
    }
    return JSON.parse(raw.slice(start, end + 1));
  }

  private normalizeScript(
    raw: unknown,
    targetSeconds: number,
    maxScenes: number,
    maxVideoScenes: number,
  ): GeneratedScript {
    const data = raw as GeneratedScript;
    if (!data?.title || !data?.audioScript || !Array.isArray(data.scenes)) {
      throw new Error('Invalid script shape');
    }
    const capped = demoteExcessVideoScenes(
      data.scenes.slice(0, maxScenes).map((scene, index) => {
        const visualPrompt = String(scene.visualPrompt ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 280);
        return {
          index: scene.index ?? index,
          narration: scene.narration,
          visualPrompt,
          type:
            scene.type === MediaAssetType.VIDEO
              ? MediaAssetType.VIDEO
              : MediaAssetType.IMAGE,
          durationSec: Math.min(Math.max(Number(scene.durationSec) || 3, 2), 5),
          ...(scene.type === MediaAssetType.VIDEO && typeof scene.motion === 'string'
            ? {
                motion: scene.motion.replace(/\s+/g, ' ').trim().slice(0, 300),
              }
            : {}),
        };
      }),
      maxVideoScenes,
    );
    const scenes = fitSceneDurations(capped, targetSeconds);
    const styleAnchor = String(
      (data as GeneratedScript & { styleAnchor?: string }).styleAnchor ?? '',
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    return {
      title: data.title,
      audioScript: data.audioScript,
      styleAnchor,
      scenes,
    };
  }

  private fallbackScript(
    prompt: string,
    stylePreset: StylePreset,
    targetSeconds: number,
    aspectLabel: string,
    language: ClipLanguage,
    maxVideoScenes: number,
    styleAnchor: string,
  ): GeneratedScript {
    const spanish = language.startsWith('es');
    const title = spanish
      ? `Clip ${stylePreset}`
      : `${stylePreset[0].toUpperCase()}${stylePreset.slice(1)} Clip`;
    const hook = prompt.slice(0, 80);
    const base = [
      {
        index: 0,
        narration: spanish
          ? `Este es el gancho: ${hook}.`
          : `Here's the hook: ${hook}.`,
        visualPrompt: `${stylePreset} ${aspectLabel} opening shot, subject centered, soft camera push-in`,
        type: MediaAssetType.VIDEO,
        durationSec: 4,
      },
      {
        index: 1,
        narration: spanish
          ? 'Pon atención, porque esto lo cambia todo.'
          : 'Pay attention, because this changes everything.',
        visualPrompt: `${stylePreset} motion B-roll, ${aspectLabel}, dynamic camera pan`,
        type: MediaAssetType.VIDEO,
        durationSec: 5,
      },
      {
        index: 2,
        narration: spanish
          ? 'La idea clave es simple, poderosa e imposible de ignorar.'
          : 'The key insight is simple, powerful, and impossible to ignore.',
        visualPrompt: `${stylePreset} close-up impactful still, ${aspectLabel}`,
        type: MediaAssetType.IMAGE,
        durationSec: 4,
      },
      {
        index: 3,
        narration: spanish
          ? 'Sígueme para más — y guarda este clip.'
          : 'Follow for more — and save this clip.',
        visualPrompt: `${stylePreset} ending beat, ${aspectLabel}, gentle camera drift`,
        type: MediaAssetType.VIDEO,
        durationSec: 4,
      },
    ];
    const trimmed = targetSeconds <= 15 ? base.slice(0, 3) : base;
    const scenes = fitSceneDurations(
      demoteExcessVideoScenes(trimmed, maxVideoScenes),
      targetSeconds,
    );
    return {
      title,
      audioScript: scenes.map((s) => s.narration).join(' '),
      styleAnchor,
      scenes,
    };
  }

  async locateSubjects(
    frames: Array<{ id: string; base64: string }>,
  ): Promise<Map<string, { x: number; y: number }>> {
    const points = new Map<string, { x: number; y: number }>();
    if (!frames.length) return points;
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1200,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'These frames will be cropped to a vertical video. For each frame, mark the point that must stay in frame: the speaker\'s face, or the hands/object being demonstrated when that is the action. Return ONLY JSON {"points":[{"id":string,"x":number,"y":number}]} with x and y from 0 to 1 (left to right, top to bottom). One point per frame id.',
              },
              ...frames.flatMap((frame) => [
                { type: 'text' as const, text: `Frame ${frame.id}` },
                {
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: 'image/jpeg' as const,
                    data: frame.base64,
                  },
                },
              ]),
            ],
          },
        ],
      });
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') return points;
      const json = this.extractJson(textBlock.text) as {
        points?: Array<{ id?: string; x?: number; y?: number }>;
      };
      for (const point of json.points ?? []) {
        const x = Number(point.x);
        const y = Number(point.y);
        if (!point.id || !Number.isFinite(x) || !Number.isFinite(y)) continue;
        points.set(String(point.id), {
          x: Math.min(1, Math.max(0, x)),
          y: Math.min(1, Math.max(0, y)),
        });
      }
    } catch (error) {
      this.logger.warn(
        `Subject tracking failed, zooming center: ${(error as Error).message}`,
      );
    }
    return points;
  }

  async pickHighlights(
    words: WordTimestamp[],
    targetSeconds: number,
    clipCount: number,
    stylePreset: string,
    focus?: string,
    extra: { segments?: TranscriptSegment[]; language?: string | null } = {},
  ): Promise<{ title: string; clips: HighlightMoment[] }> {
    const mediaEnd = words[words.length - 1]?.end ?? 0;
    const segments = extra.segments ?? [];
    const sentenceEnds = sentenceEndTimes(segments);
    if (mediaEnd < 4 || words.length < 8) {
      throw new Error('Transcript is too short to pick highlights');
    }
    const count = Math.min(8, Math.max(1, clipCount || 5));
    const transcript = transcriptLines(words, segments);
    const languageName = extra.language?.startsWith('en')
      ? 'English'
      : extra.language?.startsWith('pt')
        ? 'Portuguese'
        : extra.language?.startsWith('fr')
          ? 'French'
          : extra.language?.startsWith('de')
            ? 'German'
            : extra.language?.startsWith('it')
              ? 'Italian'
              : 'Spanish';
    const brief = focus?.trim()
      ? `The viewer asked for this, so prefer clips that match it and skip the rest: ${focus.trim().slice(0, 500)}`
      : 'No extra brief. Pick the most useful, surprising, or emotional spoken clips.';
    const system = `You select separate viral clips from a long transcript. They are published one by one, never stitched into one montage.
Return ONLY JSON:
{
  "title": string,
  "clips": [{ "startSec": number, "endSec": number, "title": string, "score": number, "reason": string }]
}
Rules:
- Return ${count} clips. Fewer only if the video truly does not have that many.
- Each clip is one self-contained idea of about ${targetSeconds} seconds (at least ${Math.round(targetSeconds * 0.8)}, at most ${targetSeconds + 2}; shorter only if the video itself is shorter), using timestamps that exist in the transcript (0 to ${mediaEnd.toFixed(1)}).
- score is an integer 0-100 for scroll-stopping potential.
- reason is one short sentence on why this clip would stop a scroll.
- Clips must not overlap.
- Each transcript line is [start-end] followed by what was said${segments.length ? ' (punctuated sentences)' : ''}. startSec must be the start of a line; endSec must be the end of a line that finishes a sentence. Never cut mid-phrase.
- The first 2 seconds must hook on their own: start on the claim, question or punchline, not on "so", "and", "well", greetings or context.
- Write "title" and every clip "title" in ${languageName}: short (max 8 words), punchy, no hashtags, no quotes.
- Prefer a claim, a story, a number, a question, or a conflict. Skip intros, outros, sponsor reads, and filler.
- Order the array by score, highest first.
- Style hint: ${stylePreset}.
- ${brief}
- Do not invent timestamps.`;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        system,
        messages: [
          {
            role: 'user',
            content: `Transcript:\n${transcript}`,
          },
        ],
      });
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('Claude returned no text content');
      }
      const json = this.extractJson(textBlock.text) as {
        title?: string;
        clips?: Array<{
          startSec?: number;
          endSec?: number;
          title?: string;
          score?: number;
          reason?: string;
        }>;
      };
      const clips = this.shapeClips(
        json.clips ?? [],
        words,
        mediaEnd,
        targetSeconds,
        count,
        sentenceEnds,
      );
      if (!clips.length) {
        throw new Error('Not enough highlight clips');
      }
      return {
        title: (json.title || 'Highlight clips').slice(0, 120),
        clips,
      };
    } catch (error) {
      this.logger.warn(
        `Highlight picking failed, using speech-density fallback: ${(error as Error).message}`,
      );
      const clips = this.fallbackClips(words, mediaEnd, targetSeconds, count);
      if (!clips.length) {
        throw new Error('Could not find a clip in this transcript');
      }
      return { title: 'Highlight clips', clips };
    }
  }

  private shapeClips(
    raw: Array<{
      startSec?: number;
      endSec?: number;
      title?: string;
      score?: number;
      reason?: string;
    }>,
    words: WordTimestamp[],
    mediaEnd: number,
    targetSeconds: number,
    clipCount: number,
    sentenceEnds: number[] = [],
  ): HighlightMoment[] {
    // Short picks get extended to at least ~60% of the chosen length.
    const minLen = Math.max(4, targetSeconds * 0.6);
    const fitted = raw
      .map((item) => this.fitClip(item, words, mediaEnd, targetSeconds, minLen, sentenceEnds))
      .filter((item): item is HighlightMoment => Boolean(item))
      .sort((a, b) => b.score - a.score);
    const kept = this.takeNonOverlapping(fitted, clipCount);
    if (kept.length >= clipCount) return kept;
    const extras = this.fallbackClips(
      words,
      mediaEnd,
      targetSeconds,
      clipCount,
    ).filter((clip) => !kept.some((existing) => this.overlaps(existing, clip)));
    return this.takeNonOverlapping([...kept, ...extras], clipCount);
  }

  private fitClip(
    raw: {
      startSec?: number;
      endSec?: number;
      title?: string;
      score?: number;
      reason?: string;
    },
    words: WordTimestamp[],
    mediaEnd: number,
    targetSeconds: number,
    minLen: number,
    sentenceEnds: number[] = [],
  ): HighlightMoment | null {
    const requestedEnd = Number(raw.endSec);
    const window = fitHighlightWindow(
      words,
      Math.max(0, Number(raw.startSec) || 0),
      Number.isFinite(requestedEnd) ? requestedEnd : null,
      { targetSeconds, minLen, mediaEnd, sentenceEnds },
    );
    if (!window) return null;
    const score = Math.max(0, Math.min(100, Math.round(Number(raw.score) || 50)));
    return {
      startSec: window.startSec,
      endSec: window.endSec,
      title: String(raw.title || 'Clip').slice(0, 80),
      score,
      reason: String(raw.reason || 'Strong spoken moment').slice(0, 180),
    };
  }

  private fallbackClips(
    words: WordTimestamp[],
    mediaEnd: number,
    targetSeconds: number,
    clipCount: number,
  ): HighlightMoment[] {
    const window = Math.min(targetSeconds, Math.max(8, mediaEnd / 2));
    const step = Math.max(2, window / 3);
    const scored: HighlightMoment[] = [];
    for (let start = 0; start < mediaEnd - 4; start += step) {
      const slice = words.filter(
        (word) => word.start >= start && word.end <= start + window,
      );
      if (slice.length < 6) continue;
      const text = slice.map((word) => word.word).join(' ');
      const bonus = (/[!?]/.test(text) ? 8 : 0) + (/\d/.test(text) ? 4 : 0);
      scored.push({
        startSec: slice[0].start,
        endSec: slice[slice.length - 1].end,
        title: text.split(/\s+/).slice(0, 6).join(' '),
        score: Math.min(100, Math.round(slice.length + bonus)),
        reason: 'Dense spoken moment',
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return this.takeNonOverlapping(scored, clipCount);
  }

  private takeNonOverlapping(
    clips: HighlightMoment[],
    clipCount: number,
  ): HighlightMoment[] {
    const kept: HighlightMoment[] = [];
    for (const clip of clips) {
      if (kept.some((existing) => this.overlaps(existing, clip))) continue;
      kept.push(clip);
      if (kept.length >= clipCount) break;
    }
    return kept;
  }

  private overlaps(
    a: { startSec: number; endSec: number },
    b: { startSec: number; endSec: number },
  ): boolean {
    return a.endSec > b.startSec + 0.2 && a.startSec < b.endSec - 0.2;
  }
}
