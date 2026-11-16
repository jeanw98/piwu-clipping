import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  voiceLanguageCode,
  voiceMatchesLanguage,
  type ClipLanguage,
  type VoiceDto,
  type VoiceTraits,
  type WordTimestamp,
} from '@piwu/shared';
import type { EnvConfig } from '../config/env.schema';

interface Alignment {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
}

const CACHE_MS = 30 * 60 * 1000;

interface VerifiedLanguage {
  language: string;
  model_id?: string;
  accent?: string | null;
  locale?: string | null;
  preview_url?: string | null;
}

interface RawVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  description?: string | null;
  preview_url?: string | null;
  verified_languages?: VerifiedLanguage[] | null;
}

interface LibraryVoice {
  public_owner_id: string;
  voice_id: string;
  name: string;
  accent?: string | null;
  gender?: string | null;
  age?: string | null;
  descriptive?: string | null;
  use_case?: string | null;
  category?: string;
  language?: string | null;
  locale?: string | null;
  description?: string | null;
  preview_url?: string | null;
  verified_languages?: VerifiedLanguage[] | null;
}

/** Language traits of an account voice (labels + verified languages). */
function accountTraits(voice: RawVoice, lang: string): { candidates: VoiceTraits[]; previewUrl: string | null } {
  const verified = (voice.verified_languages ?? []).filter((v) => v.language?.toLowerCase() === lang);
  const candidates: VoiceTraits[] = verified.map((v) => ({ language: v.language, accent: v.accent, locale: v.locale }));
  const labels = voice.labels ?? {};
  if (labels.language) candidates.push({ language: labels.language, accent: labels.accent, locale: labels.locale });
  return { candidates, previewUrl: verified.find((v) => v.preview_url)?.preview_url ?? null };
}

@Injectable()
export class ElevenLabsService {
  private readonly logger = new Logger(ElevenLabsService.name);
  private accountCache: { at: number; voices: RawVoice[] } | null = null;
  private readonly libraryCache = new Map<string, { at: number; voices: LibraryVoice[] }>();

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  /** Raw account voices ("My voices"), cached 30 min. */
  private async accountVoices(): Promise<RawVoice[]> {
    if (this.accountCache && Date.now() - this.accountCache.at < CACHE_MS) {
      return this.accountCache.voices;
    }
    const defaultId = this.config.get('ELEVENLABS_VOICE_ID', { infer: true });
    const json = await this.get<{ voices?: RawVoice[] }>('/v1/voices');
    const raw = json.voices ?? [];
    // The default voice may come from the Voice Library without being added
    // to "My voices": fetch it on its own so it still shows.
    if (defaultId && !raw.some((voice) => voice.voice_id === defaultId)) {
      const single = await this.get<RawVoice>(`/v1/voices/${defaultId}`).catch(() => null);
      if (single) raw.unshift(single);
    }
    this.accountCache = { at: Date.now(), voices: raw };
    return raw;
  }

  /** Public Voice Library voices for one language, most used first (cached 30 min). */
  private async libraryVoices(lang: string): Promise<LibraryVoice[]> {
    const hit = this.libraryCache.get(lang);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.voices;
    const params = new URLSearchParams({
      language: lang,
      page_size: '100',
      sort: 'usage_character_count_1y',
    });
    const json = await this.get<{ voices?: LibraryVoice[] }>(`/v1/shared-voices?${params}`);
    const voices = json.voices ?? [];
    this.libraryCache.set(lang, { at: Date.now(), voices });
    return voices;
  }

  /**
   * Voices for a clip language: account voices native to it, then native
   * voices from the public Voice Library, then the rest of the account
   * (matchesLanguage = false, e.g. an American voice reading Spanish).
   * Listing and preview samples are free (no characters used).
   */
  async listVoices(language: ClipLanguage = 'es-LA'): Promise<VoiceDto[]> {
    const defaultId = this.config.get('ELEVENLABS_VOICE_ID', { infer: true });
    const lang = voiceLanguageCode(language);
    const account = (await this.accountVoices()).map((voice) => {
      const traits = accountTraits(voice, lang);
      const dto: VoiceDto = {
        id: voice.voice_id,
        name: voice.name,
        category: voice.category ?? 'premade',
        labels: voice.labels ?? {},
        description: voice.description ?? null,
        previewUrl: traits.previewUrl ?? voice.preview_url ?? null,
        isDefault: voice.voice_id === defaultId,
        source: 'account',
        matchesLanguage: traits.candidates.some((t) => voiceMatchesLanguage(language, t)),
        accent: traits.candidates.find((t) => voiceMatchesLanguage(language, t))?.accent ?? voice.labels?.accent ?? null,
        locale: traits.candidates.find((t) => voiceMatchesLanguage(language, t))?.locale ?? null,
      };
      return dto;
    });
    const owned = new Set(account.map((voice) => voice.id));

    let library: VoiceDto[] = [];
    try {
      library = (await this.libraryVoices(lang))
        .filter((voice) => !owned.has(voice.voice_id))
        .map((voice) => {
          const verified = (voice.verified_languages ?? []).find((v) =>
            voiceMatchesLanguage(language, { language: v.language, accent: v.accent, locale: v.locale }),
          );
          const matches =
            Boolean(verified) ||
            voiceMatchesLanguage(language, { language: voice.language ?? lang, accent: voice.accent, locale: voice.locale });
          const labels: Record<string, string> = {};
          for (const key of ['gender', 'age', 'accent', 'use_case', 'descriptive'] as const) {
            if (voice[key]) labels[key] = String(voice[key]);
          }
          const dto: VoiceDto = {
            id: voice.voice_id,
            name: voice.name,
            category: voice.category ?? 'professional',
            labels,
            description: voice.description ?? null,
            previewUrl: verified?.preview_url ?? voice.preview_url ?? null,
            isDefault: false,
            source: 'library',
            matchesLanguage: matches,
            accent: verified?.accent ?? voice.accent ?? null,
            locale: verified?.locale ?? voice.locale ?? null,
            publicOwnerId: voice.public_owner_id,
          };
          return dto;
        })
        .filter((voice) => voice.matchesLanguage)
        .slice(0, 40);
    } catch (error) {
      this.logger.warn(`Voice Library unavailable: ${(error as Error).message}`);
    }

    const byName = (a: VoiceDto, b: VoiceDto) =>
      Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name);
    return [
      ...account.filter((voice) => voice.matchesLanguage).sort(byName),
      ...library,
      ...account.filter((voice) => !voice.matchesLanguage).sort(byName),
    ];
  }

  /**
   * Adds a Voice Library voice to the account so it can be used for TTS
   * (free; uses one of the plan's custom-voice slots).
   */
  async addLibraryVoice(publicOwnerId: string, voiceId: string, name: string): Promise<string> {
    const owned = await this.accountVoices().catch(() => []);
    if (owned.some((voice) => voice.voice_id === voiceId)) return voiceId;
    const apiKey = this.config.get('ELEVENLABS_API_KEY', { infer: true });
    const response = await fetch(
      `https://api.elevenlabs.io/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ new_name: name.slice(0, 100) }),
      },
    );
    const text = await response.text();
    if (!response.ok) {
      if (/already/i.test(text)) return voiceId;
      let message = text.slice(0, 300);
      try {
        const detail = (JSON.parse(text) as { detail?: { message?: string } | string }).detail;
        message = typeof detail === 'string' ? detail : detail?.message ?? message;
      } catch {
        /* keep raw text */
      }
      throw new Error(`ElevenLabs no pudo agregar la voz: ${message}`);
    }
    this.accountCache = null;
    return ((JSON.parse(text) as { voice_id?: string }).voice_id ?? voiceId) || voiceId;
  }

  private async get<T>(path: string): Promise<T> {
    const apiKey = this.config.get('ELEVENLABS_API_KEY', { infer: true });
    const response = await fetch(`https://api.elevenlabs.io${path}`, {
      headers: { 'xi-api-key': apiKey, Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`ElevenLabs ${path.split('?')[0]} ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    return (await response.json()) as T;
  }

  /**
   * Speech plus word times from ElevenLabs alignment.
   * The prompt pipeline uses this instead of a second Whisper call.
   */
  async synthesizeAligned(
    text: string,
    voiceOverride?: string | null,
  ): Promise<{ audio: Buffer; words: WordTimestamp[] }> {
    const apiKey = this.config.get('ELEVENLABS_API_KEY', { infer: true });
    const voiceId =
      voiceOverride?.trim() || this.config.get('ELEVENLABS_VOICE_ID', { infer: true });

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0.4,
              similarity_boost: 0.8,
            },
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`ElevenLabs ${response.status}: ${body}`);
      }

      const json = (await response.json()) as {
        audio_base64?: string;
        alignment?: Alignment;
        normalized_alignment?: Alignment;
      };
      const audio = json.audio_base64
        ? Buffer.from(json.audio_base64, 'base64')
        : Buffer.alloc(0);
      const words = wordsFromAlignment(
        json.alignment ?? json.normalized_alignment,
      );
      return {
        audio,
        words: words.length ? words : estimateWords(text),
      };
    } catch (error) {
      this.logger.warn(
        `ElevenLabs failed, generating silent placeholder: ${(error as Error).message}`,
      );
      return { audio: Buffer.alloc(0), words: estimateWords(text) };
    }
  }
}

function wordsFromAlignment(alignment: Alignment | undefined): WordTimestamp[] {
  const chars = alignment?.characters ?? [];
  const starts = alignment?.character_start_times_seconds ?? [];
  const ends = alignment?.character_end_times_seconds ?? [];
  const words: WordTimestamp[] = [];
  let buffer = '';
  let start = 0;
  let end = 0;
  const flush = () => {
    const word = buffer.trim();
    if (word) words.push({ word, start, end: Math.max(end, start + 0.05) });
    buffer = '';
  };
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index];
    if (/\s/.test(char)) {
      flush();
      continue;
    }
    if (!buffer) start = starts[index] ?? end;
    buffer += char;
    end = ends[index] ?? start;
  }
  flush();
  return words;
}

function estimateWords(script: string): WordTimestamp[] {
  const tokens = script.split(/\s+/).filter(Boolean);
  const secondsPerWord = 0.35;
  let cursor = 0;
  return tokens.map((word) => {
    const start = cursor;
    const end = cursor + secondsPerWord;
    cursor = end;
    return { word, start, end };
  });
}
