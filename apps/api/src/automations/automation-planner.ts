import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTOMATION_CLIP_FORMAT,
  AUTOMATION_FORMATS,
  MOTION_WIRES,
  type AutomationBlock,
  type AutomationFormat,
} from '@piwu/shared';
import { AnthropicService } from '../ai/anthropic.service';
import { searchYoutube, type YoutubeRecency, type YoutubeSearchResult } from '../clips/youtube-media';
import type { EnvConfig } from '../config/env.schema';

const VISUAL_STYLES = ['ugc', 'cinematic', 'flat-2d', 'anime', 'documentary'] as const;
/** Source videos must be long enough to have several moments, and <= the 30 min limit. */
const MIN_SOURCE_SEC = 4 * 60;
const MAX_SOURCE_SEC = 30 * 60;
/** Viral moments: highlight / clip-channel videos are often 2–10 min. */
const MIN_VIRAL_SOURCE_SEC = 2 * 60;
const RECENCY_FALLBACK: YoutubeRecency[] = ['day', 'week', 'month', 'year'];

/**
 * Example creators for "viral moments", per language. Only examples: the
 * planner may pick others. Shuffled per call so the first names are not
 * always favoured.
 */
const VIRAL_CREATORS = {
  es: [
    // España
    'Ibai', 'TheGrefg', 'Rubius', 'AuronPlay', 'IlloJuan', 'ElXokas', 'Knekro', 'Perxitaa', 'Vegetta777',
    'Willyrex', 'DjMaRiiO', 'Mangel', 'Cristinini', 'Alexby11', 'Reven', 'Jordi Wild', 'Nil Ojeda', 'Biyin', 'Folagor',
    // Latinoamérica
    'Spreen', 'Westcol', 'Juansguarnizo', 'Rivers', 'ElMariana', 'Aldo Geo', 'Coscu', 'Momo', 'Fernanfloo',
    'Robleis', 'Carreraaa', 'Quackity', 'AriGameplays', 'Brunenger', 'La Cobra', 'Davoo Xeneize', 'Mike Bran',
  ],
  en: [
    'Kai Cenat', 'IShowSpeed', 'xQc', 'Jynxzi', 'KSI', 'CaseOh', 'Adin Ross', 'Ludwig', 'Agent00', 'Duke Dennis',
    'Fanum', 'Sketch', 'Lacy', 'Stable Ronaldo', 'Valkyrae', 'Pokimane', 'TimTheTatman', 'DrLupo', 'Shroud',
    'Summit1g', 'Ninja', 'penguinz0', 'Markiplier', 'jacksepticeye', 'PewDiePie', 'Sidemen', 'Dream', 'Hikaru',
    'Tfue', 'Clix', 'Zoomaa', 'Kreek',
  ],
} as const;

function shuffled<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** What the highlight picker should look for in a viral-moments source. */
export function viralFocus(topic: string, language: string): string {
  return language.startsWith('es')
    ? `Momentos más virales y compartibles${topic ? ` sobre ${topic}` : ''}: reacciones fuertes del streamer (gritos, risas, sustos, sorpresa), jugadas épicas, fails, bugs graciosos, momentos WTF y frases memorables. Cada clip se entiende solo, con el gancho en los primeros 2 segundos.`
    : `Most viral, shareable moments${topic ? ` about ${topic}` : ''}: strong streamer reactions (screaming, laughing, jump scares, shock), epic plays, fails, funny bugs, WTF moments and memorable lines. Each clip stands on its own with the hook in the first 2 seconds.`;
}

export interface PlannedPrompt {
  blockId: string;
  kind: 'prompt';
  topic: string;
  prompt: string;
  caption: string;
  visualStyle: (typeof VISUAL_STYLES)[number];
  motion: (typeof MOTION_WIRES)[number];
}

export interface PlannedYoutube {
  blockId: string;
  kind: 'youtube';
  topic: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  /** youtube-viral: what the highlight picker should prefer. */
  focus: string | null;
  error: string | null;
}

export interface DailyPlan {
  topics: string[];
  items: Array<PlannedPrompt | PlannedYoutube>;
  usedWebSearch: boolean;
}

export interface PlanInput {
  localDate: string;
  topicHint: string;
  useTrends: boolean;
  blocks: AutomationBlock[];
  /** Topics / prompts of recent runs, to avoid repeating them. */
  recentTopics: string[];
  /** YouTube ids already clipped by this user. */
  usedVideoIds: Set<string>;
}

const LANGUAGE_NAMES: Record<string, string> = {
  'es-LA': 'Latin American Spanish',
  'es-ES': 'Spain Spanish',
  'en-US': 'American English',
  'en-GB': 'British English',
  'pt-BR': 'Brazilian Portuguese',
  'fr-FR': 'French',
  'de-DE': 'German',
  'it-IT': 'Italian',
};

const FORMAT_RULES: Record<AutomationFormat, string> = {
  'sabias-que':
    'Opens literally with "¿Sabías que…?" (or "Did you know…?" / the equivalent in the language) and reveals ONE surprising, verifiable fact, then a short why/how and a closing line that invites a comment.',
  'top-3':
    'Counts down three facts, tips or curiosities about the topic, from least to most surprising; each one concrete (names, numbers, places).',
  'mito-realidad':
    'States a popular belief as "Mito:" and then "Realidad:" with what the evidence actually says; no hedging, one clear takeaway.',
  historia:
    'A real, verifiable short story or anecdote with a hook, a turn and a punchline; name the people/place/year.',
  quiz:
    'Asks one intriguing question, gives 3 options, tells the viewer to pause/guess, then reveals the answer with a one-line explanation.',
  'que-pasaria-si':
    'A hypothetical "What if…?" scenario. Opens literally with "¿Qué pasaría si…?" (or "What if…?" / the equivalent in the language), then the chain of consequences (minutes → days → years) grounded in real science/history, a surprising twist and a closing question to the viewer. Pick premises that spark curiosity (nature, space, everyday life, tech, history), never tragedies.',
  'youtube-clips': '',
  'youtube-viral': '',
};

@Injectable()
export class AutomationPlanner {
  private readonly logger = new Logger(AutomationPlanner.name);

  constructor(
    private readonly anthropic: AnthropicService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async plan(input: PlanInput): Promise<DailyPlan> {
    const { json, usedWebSearch } = await this.anthropic.completeJson(
      this.systemPrompt(input),
      this.userPrompt(input),
      { webSearch: input.useTrends, maxSearches: 6, maxTokens: 16000 },
    );
    const raw = (json ?? {}) as {
      topics?: unknown;
      items?: Array<Record<string, unknown>>;
    };
    const topics = Array.isArray(raw.topics)
      ? raw.topics.map((topic) => String(topic).slice(0, 120)).filter(Boolean).slice(0, 12)
      : [];

    const items: DailyPlan['items'] = [];
    const youtubeRequests: Array<{ block: AutomationBlock; topic: string; queries: string[] }> = [];
    for (const block of input.blocks) {
      const kind = AUTOMATION_FORMATS[block.format].kind;
      const mine = (raw.items ?? []).filter((item) => String(item.blockId) === block.id).slice(0, block.count);
      for (let index = 0; index < block.count; index++) {
        const item = mine[index];
        const topic = String(item?.topic ?? topics[index % Math.max(1, topics.length)] ?? input.topicHint ?? '')
          .slice(0, 160)
          .trim();
        if (kind === 'prompt') {
          const prompt = String(item?.prompt ?? '').trim();
          if (prompt.length < 10) continue; // the run records the missing item
          items.push({
            blockId: block.id,
            kind: 'prompt',
            topic,
            prompt: this.withStyleNotes(prompt, block).slice(0, 2000),
            caption: String(item?.caption ?? '').slice(0, 2200),
            ...(AUTOMATION_CLIP_FORMAT[block.format] === 'what-if'
              ? { visualStyle: 'flat-2d' as const, motion: 'graphics' as const }
              : {
                  visualStyle: this.pick(block.visualStyle ?? item?.visualStyle, VISUAL_STYLES, 'ugc'),
                  motion: this.pick(block.motion ?? item?.motion, MOTION_WIRES, 'stills_dynamic'),
                }),
          });
        } else {
          const queries = (Array.isArray(item?.queries) ? item.queries : [])
            .map((query) => String(query).trim())
            .filter((query) => query.length >= 3)
            .slice(0, 3);
          if (!queries.length && topic) queries.push(topic);
          youtubeRequests.push({ block, topic, queries });
        }
      }
    }

    items.push(...(await this.chooseYoutubeSources(youtubeRequests, input.usedVideoIds)));
    return { topics, items, usedWebSearch };
  }

  private systemPrompt(input: PlanInput): string {
    return `You are the daily content planner for a short-form vertical video brand (TikTok, Reels, Shorts).
Today is ${input.localDate}. You plan today's videos from the blocks the user configured.
${input.useTrends ? 'First use web search to find what is trending TODAY that fits the topic guidance (news, viral subjects, seasonal events, popular searches). Prefer topics with lasting curiosity value over breaking tragedies; never pick disasters, deaths or politics-as-outrage.' : 'Do not search the web; pick evergreen topics that fit the guidance.'}

Return ONLY JSON, no prose:
{
  "topics": [string],
  "items": [
    { "blockId": string, "topic": string, "prompt": string, "caption": string, "visualStyle": string|null, "motion": string|null },
    { "blockId": string, "topic": string, "queries": [string, string, string] }
  ]
}

Rules for blocks of kind "prompt" (one item per video, exactly "count" items per block):
- "prompt" is the brief for our AI video generator, written ENTIRELY in the block's language, 300-1200 characters.
- It must contain the actual content (the concrete facts, numbers, names), accurate and verifiable; never invent facts. If unsure, choose another fact.
- The first sentence is the hook. Follow the format rule of the block.
- "caption" is the social post text in the block's language: one line + 3-5 hashtags.
- "visualStyle" one of ${VISUAL_STYLES.join(', ')} and "motion" one of ${MOTION_WIRES.join(', ')}: only when the block says "choose", picked from the block's style notes (e.g. "2D / motion graphics / animated infographics" -> visualStyle "flat-2d", motion "graphics"; "realistic photos" -> "documentary" + "stills_dynamic"). Otherwise null.
- Every item uses a different topic/fact, also different from the recent topics listed.

Rules for blocks of kind "youtube" (one item per source video, exactly "count" items per block):
- format "Clips de YouTube": "queries" = 3 YouTube search queries in the block's language that find long-form TALKING content (podcast episode, interview, talk, explainer) of 5-30 minutes about the topic, published by creators who speak that language. No music, no compilations, no Shorts.
- format "Momentos virales / trending": the goal is the clips everybody is sharing RIGHT NOW. ${input.useTrends ? 'Use web search to find which famous streamers/YouTubers in the block\'s language are covering the topic this week and what moments are going viral.' : ''} "queries" = 3 short YouTube search queries (2-6 words) in the block's language, each a DIFFERENT angle, e.g. "<famous streamer> <topic>", "<topic> momentos graciosos" / "<topic> funny moments", "<topic> reaccion" / "<topic> reaction", "<topic> fails", "<topic> clips". Results are already filtered to the most viewed recent uploads, so do not add years or dates.
  Creators for viral items:
  - The "topic" of each viral item names ONE real, currently popular streamer/YouTuber who NATIVELY SPEAKS THE BLOCK'S LANGUAGE and actually covers the topic. A Spanish block only uses Spanish-speaking creators (Spain AND Latin America); an English block only uses English-speaking creators. Never put an English creator in a Spanish block or vice versa.
  - Spread the day widely: every viral item of the day (across ALL blocks) uses a DIFFERENT creator. Two blocks in different languages never share a creator or the same angle.
  - Rotate: avoid creators named in the recent topics below; prefer creators not used lately, even if smaller (mid-size creators with strong reactions are fine). For Spanish, mix Spain and Latin America.
  - Example pool, NOT a closed list (pick others you know are active on the topic): Spanish: ${shuffled(VIRAL_CREATORS.es).join(', ')}. English: ${shuffled(VIRAL_CREATORS.en).join(', ')}.

Never repeat these recent topics: ${input.recentTopics.slice(0, 60).join(' | ') || '(none)'}`;
  }

  private userPrompt(input: PlanInput): string {
    const blocks = input.blocks.map((block) => {
      const format = AUTOMATION_FORMATS[block.format];
      return {
        blockId: block.id,
        kind: format.kind,
        format: format.label,
        formatRule: FORMAT_RULES[block.format] || undefined,
        language: `${block.language} (${LANGUAGE_NAMES[block.language] ?? block.language})`,
        count: block.count,
        durationSec: block.durationSec,
        recency: block.format === 'youtube-viral' ? block.recency ?? 'week' : undefined,
        topicGuidance: block.topicHint?.trim() || input.topicHint.trim() || 'general curiosities that do well on social media',
        styleNotes: format.kind === 'prompt' ? block.styleNotes?.trim() || undefined : undefined,
        visualStyleAndMotion:
          format.kind === 'prompt'
            ? AUTOMATION_CLIP_FORMAT[block.format] || (block.visualStyle && block.motion)
              ? 'fixed by the user'
              : 'choose'
            : undefined,
      };
    });
    return `Topic guidance for today: ${input.topicHint.trim() || '(none: pick what is popular)'}

Blocks:
${JSON.stringify(blocks, null, 2)}`;
  }

  /** Style notes go verbatim into the brief so the script writer follows them. */
  private withStyleNotes(prompt: string, block: AutomationBlock): string {
    const notes = block.styleNotes?.trim();
    if (!notes) return prompt;
    const label = block.language.startsWith('en') ? 'Visual style' : 'Estilo visual';
    return `${prompt}\n\n${label}: ${notes}`;
  }

  private pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? (value as T) : fallback;
  }

  private async chooseYoutubeSources(
    requests: Array<{ block: AutomationBlock; topic: string; queries: string[] }>,
    usedVideoIds: Set<string>,
  ): Promise<PlannedYoutube[]> {
    if (!requests.length) return [];
    const options = {
      cookiesFile: this.config.get('YTDLP_COOKIES_FILE', { infer: true }) || null,
      proxy: this.config.get('YTDLP_PROXY', { infer: true }) || null,
      extractorArgs: this.config.get('YTDLP_EXTRACTOR_ARGS', { infer: true }) || null,
    };
    const taken = new Set(usedVideoIds);
    const candidatesPerRequest: YoutubeSearchResult[][] = [];
    for (const request of requests) {
      const viral = request.block.format === 'youtube-viral';
      const minSec = viral ? MIN_VIRAL_SOURCE_SEC : MIN_SOURCE_SEC;
      const seen = new Map<string, YoutubeSearchResult>();
      const collect = async (trending?: YoutubeRecency) => {
        for (const query of request.queries) {
          try {
            for (const result of await searchYoutube(query, viral ? 20 : 10, { ...options, trending })) {
              if (seen.has(result.id) || taken.has(result.id)) continue;
              if (result.durationSec == null || result.durationSec < minSec || result.durationSec > MAX_SOURCE_SEC) continue;
              seen.set(result.id, result);
            }
          } catch (error) {
            this.logger.warn(`YouTube search failed for "${query}": ${(error as Error).message.slice(0, 200)}`);
          }
        }
      };
      if (viral) {
        // Widen the window only when the requested one has too few usable videos.
        const windows = RECENCY_FALLBACK.slice(RECENCY_FALLBACK.indexOf(request.block.recency ?? 'week'));
        for (const window of windows) {
          await collect(window);
          if (seen.size >= 4) break;
        }
      } else {
        await collect();
      }
      candidatesPerRequest.push([...seen.values()].slice(0, viral ? 25 : 15));
    }

    // One small call: pick the best candidate per request.
    let picks: Record<number, string> = {};
    try {
      const { json } = await this.anthropic.completeJson(
        `You pick YouTube source videos to cut into short vertical clips. For each request choose ONE candidate id.
Requests with format "talk":
- spoken in the requested language by native speakers (judge from title/channel),
- talking-heavy (podcast, interview, talk, explainer), not music, not a compilation,
- relevant to the topic; prefer more views.
Requests with format "viral" (candidates are the most viewed recent uploads):
- a famous streamer/YouTuber (or their official clips/highlights channel) actually playing or reacting on camera/mic, with lots of talking and strong reactions: gameplay highlights, funny/WTF/epic moments, first impressions, reactions;
- NOT tutorials, "how to make clips/money with AI", news slideshows, AI-voice narrations, trailer re-uploads, tier lists or podcasts;
- the creator speaks the requested language: YouTube auto-translates titles, so judge mainly by the channel and the creator you know (Spanish speakers include ${VIRAL_CREATORS.es.join(', ')}; English speakers include ${VIRAL_CREATORS.en.join(', ')}); reject a candidate whose creator speaks another language even if the topic matches;
- prefer more views and bigger creators;
- every viral request must use a DIFFERENT channel (and different creator) for variety.
Use a different video for each request. If no candidate fits, use null.
Return ONLY JSON: {"choices": [{"request": number, "id": string|null}]}`,
        JSON.stringify(
          requests.map((request, index) => ({
            request: index,
            format: request.block.format === 'youtube-viral' ? 'viral' : 'talk',
            language: request.block.language,
            topic: request.topic,
            candidates: candidatesPerRequest[index].map((candidate) => ({
              id: candidate.id,
              title: candidate.title,
              channel: candidate.channel,
              minutes: Math.round((candidate.durationSec ?? 0) / 60),
              views: candidate.viewCount,
            })),
          })),
        ),
        { maxTokens: 3000 },
      );
      for (const choice of ((json as { choices?: Array<{ request?: number; id?: string | null }> })?.choices ?? [])) {
        if (typeof choice.request === 'number' && choice.id) picks[choice.request] = choice.id;
      }
    } catch (error) {
      this.logger.warn(`Source selection failed, using most viewed: ${(error as Error).message.slice(0, 200)}`);
      picks = {};
    }

    const usedChannels = new Set<string>();
    return requests.map((request, index) => {
      const viral = request.block.format === 'youtube-viral';
      const channelKey = (candidate: YoutubeSearchResult) => (candidate.channel ?? candidate.id).toLowerCase();
      const candidates = candidatesPerRequest[index].filter(
        (candidate) => !taken.has(candidate.id) && !(viral && usedChannels.has(channelKey(candidate))),
      );
      const chosen =
        candidates.find((candidate) => candidate.id === picks[index]) ??
        [...candidates].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))[0];
      if (chosen) {
        taken.add(chosen.id);
        if (viral) usedChannels.add(channelKey(chosen));
      }
      return {
        blockId: request.block.id,
        kind: 'youtube' as const,
        topic: request.topic,
        sourceUrl: chosen?.url ?? null,
        sourceTitle: chosen ? `${chosen.title}${chosen.channel ? ` — ${chosen.channel}` : ''}` : null,
        focus: viral ? viralFocus(request.topic, request.block.language) : null,
        error: chosen
          ? null
          : viral
            ? 'No se encontró un video trending adecuado (2–30 min, en ese idioma, de un canal distinto) para el tema.'
            : 'No se encontró un video de YouTube adecuado (4–30 min, en ese idioma) para el tema.',
      };
    });
  }
}
