import { Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type { Page } from 'playwright';
import type { WorldSpec } from './world-spec';

const logger = new Logger('HtmlCartoonQa');

export interface QaFrameResult {
  score: number;
  offTopicIsland: boolean;
  defects: string[];
  raw?: string;
}

export async function captureQaJpegs(
  page: Page,
  times: number[],
): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (const t of times) {
    await page.evaluate(async (time) => {
      const w = window as unknown as { render?: (t: number) => void };
      if (typeof w.render === 'function') w.render(time);
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
    }, t);
    const buf = await page.screenshot({ type: 'jpeg', quality: 72 });
    out.push(Buffer.from(buf));
  }
  return out;
}

export function pickQaTimes(durationSec: number, sceneCount: number): number[] {
  const end = Math.max(1, durationSec - 0.15);
  const n = Math.min(5, Math.max(3, sceneCount));
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    times.push(Math.round(((end * (i + 0.5)) / n) * 100) / 100);
  }
  return times;
}

export async function scoreQaFrames(
  client: Anthropic,
  frames: Buffer[],
  spec: WorldSpec,
  userPrompt: string,
): Promise<QaFrameResult> {
  if (!frames.length) {
    return { score: 3, offTopicIsland: false, defects: ['no frames'] };
  }

  const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [
    {
      type: 'text',
      text: `Score these vertical cartoon frames for a clip about:
"${userPrompt}"

Expected world: ${spec.world.location} (${spec.world.mood}).
Forbidden defaults: ${spec.forbiddenDefaults.join(', ') || 'none'}.

Return ONLY JSON:
{"score":1-5,"offTopicIsland":boolean,"defects":["..."]}

score 5 = clearly matches topic, continuous toy style, readable character.
score 1 = wrong world (e.g. beach/palms when forbidden) or broken/empty.
offTopicIsland=true if palms/ocean/beach appear when forbidden.`,
    },
    ...frames.slice(0, 5).map(
      (buf) =>
        ({
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/jpeg' as const,
            data: buf.toString('base64'),
          },
        }) satisfies Anthropic.ImageBlockParam,
    ),
  ];

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 400,
      messages: [{ role: 'user', content }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonText = (fenced ? fenced[1] : raw).trim();
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    const parsed = JSON.parse(
      start >= 0 ? jsonText.slice(start, end + 1) : jsonText,
    ) as {
      score?: number;
      offTopicIsland?: boolean;
      defects?: string[];
    };
    return {
      score: Math.max(1, Math.min(5, Number(parsed.score) || 1)),
      offTopicIsland: Boolean(parsed.offTopicIsland),
      defects: Array.isArray(parsed.defects)
        ? parsed.defects.map(String).slice(0, 8)
        : [],
      raw,
    };
  } catch (error) {
    logger.warn(`QA vision failed: ${(error as Error).message}`);
    return { score: 3, offTopicIsland: false, defects: ['qa_error'] };
  }
}

export function qaNeedsRegen(result: QaFrameResult): boolean {
  return result.score < 3 || result.offTopicIsland;
}
