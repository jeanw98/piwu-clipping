import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import type { WordTimestamp } from '@piwu/shared';
import type { EnvConfig } from '../config/env.schema';

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

@Injectable()
export class WhisperService {
  private readonly logger = new Logger(WhisperService.name);
  private readonly client: OpenAI;

  constructor(private readonly config: ConfigService<EnvConfig, true>) {
    this.client = new OpenAI({
      apiKey: this.config.get('OPENAI_API_KEY', { infer: true }),
    });
  }

  async transcribeWords(
    audio: Buffer,
    fallbackScript: string,
  ): Promise<WordTimestamp[]> {
    try {
      const file = await toFile(audio, 'narration.mp3', { type: 'audio/mpeg' });
      const result = await this.client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['word'],
      });

      const words = (
        result as unknown as { words?: Array<{ word: string; start: number; end: number }> }
      ).words;

      if (words?.length) {
        return words.map((w) => ({
          word: w.word,
          start: w.start,
          end: w.end,
        }));
      }
    } catch (error) {
      this.logger.warn(
        `Whisper failed, estimating timestamps: ${(error as Error).message}`,
      );
    }

    return this.estimateTimestamps(fallbackScript);
  }

  /**
   * Transcribe a source video's audio (clipping from a link/upload):
   * words + punctuated segments (sentence boundaries for clean cuts).
   * Throws on failure — there is no script to fall back to.
   */
  async transcribeSource(
    audio: Buffer,
    options: { language?: string | null; filename?: string } = {},
  ): Promise<{ words: WordTimestamp[]; segments: TranscriptSegment[] }> {
    const file = await toFile(audio, options.filename ?? 'source.mp3', { type: 'audio/mpeg' });
    const language = (options.language ?? '').split('-')[0].toLowerCase();
    const result = (await this.client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment'],
      ...(/^[a-z]{2}$/.test(language) ? { language } : {}),
    })) as unknown as {
      words?: Array<{ word: string; start: number; end: number }>;
      segments?: Array<{ start: number; end: number; text: string }>;
    };
    return {
      words: (result.words ?? []).map((w) => ({ word: w.word, start: w.start, end: w.end })),
      segments: (result.segments ?? []).map((seg) => ({
        start: seg.start,
        end: seg.end,
        text: String(seg.text ?? '').trim(),
      })),
    };
  }

  private estimateTimestamps(script: string): WordTimestamp[] {
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
}
