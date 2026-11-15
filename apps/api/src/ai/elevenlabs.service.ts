import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { VoiceDto, WordTimestamp } from '@piwu/shared';
import type { EnvConfig } from '../config/env.schema';

interface Alignment {
  characters?: string[];
  character_start_times_seconds?: number[];
  character_end_times_seconds?: number[];
}

@Injectable()
export class ElevenLabsService {
  private readonly logger = new Logger(ElevenLabsService.name);
  private voicesCache: { at: number; voices: VoiceDto[] } | null = null;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  /**
   * Voices available to the account (premade + cloned/library voices added
   * to it). Listing and the preview samples are free (no characters used).
   * Cached for 30 minutes.
   */
  async listVoices(): Promise<VoiceDto[]> {
    if (this.voicesCache && Date.now() - this.voicesCache.at < 30 * 60 * 1000) {
      return this.voicesCache.voices;
    }
    const apiKey = this.config.get('ELEVENLABS_API_KEY', { infer: true });
    const defaultId = this.config.get('ELEVENLABS_VOICE_ID', { infer: true });
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey, Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`ElevenLabs voices ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    const json = (await response.json()) as {
      voices?: Array<{
        voice_id: string;
        name: string;
        category?: string;
        labels?: Record<string, string>;
        description?: string | null;
        preview_url?: string | null;
      }>;
    };
    const raw = json.voices ?? [];
    // The default voice may come from the Voice Library without being added
    // to "My voices": fetch it on its own so it still shows (first).
    if (defaultId && !raw.some((voice) => voice.voice_id === defaultId)) {
      const single = await fetch(`https://api.elevenlabs.io/v1/voices/${defaultId}`, {
        headers: { 'xi-api-key': apiKey, Accept: 'application/json' },
      }).catch(() => null);
      if (single?.ok) raw.unshift((await single.json()) as (typeof raw)[number]);
    }
    const voices: VoiceDto[] = raw
      .map((voice) => ({
        id: voice.voice_id,
        name: voice.name,
        category: voice.category ?? 'premade',
        labels: voice.labels ?? {},
        description: voice.description ?? null,
        previewUrl: voice.preview_url ?? null,
        isDefault: voice.voice_id === defaultId,
      }))
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
    this.voicesCache = { at: Date.now(), voices };
    return voices;
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
