import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import type { WordTimestamp } from '@piwu/shared';
import type { EnvConfig } from '../config/env.schema';

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
