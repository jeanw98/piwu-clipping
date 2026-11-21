import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { automationBlockSchema } from '@piwu/shared';
import { AutomationPlanner, viralFocus } from './automation-planner';
import { slugify } from './automation-zip';

function planner(json: unknown) {
  const calls: Array<{ system: string; user: string; webSearch?: boolean }> = [];
  const anthropic = {
    completeJson: async (system: string, user: string, options: { webSearch?: boolean } = {}) => {
      calls.push({ system, user, webSearch: options.webSearch });
      return { json, usedWebSearch: Boolean(options.webSearch) };
    },
  };
  const config = { get: () => '' };
  return { planner: new AutomationPlanner(anthropic as never, config as never), calls };
}

const block = (over: Record<string, unknown>) =>
  automationBlockSchema.parse({ id: 'b1', format: 'sabias-que', language: 'es-LA', count: 2, durationSec: 30, platform: 'tiktok', ...over });

describe('AutomationPlanner', () => {
  it('appends style notes and lets the AI pick 2D / motion graphics when not fixed', async () => {
    const { planner: p, calls } = planner({
      topics: ['pulpos'],
      items: [
        { blockId: 'b1', topic: 'pulpos', prompt: '¿Sabías que los pulpos tienen tres corazones? ...', caption: 'c #x', visualStyle: 'flat-2d', motion: 'graphics' },
        { blockId: 'b1', topic: 'miel', prompt: '¿Sabías que la miel nunca se echa a perder? ...', caption: 'c', visualStyle: 'bogus', motion: 'nope' },
      ],
    });
    const plan = await p.plan({
      localDate: '2026-11-17',
      topicHint: 'ciencia',
      useTrends: true,
      blocks: [block({ styleNotes: '2D con motion graphics' })],
      recentTopics: ['volcanes'],
      usedVideoIds: new Set(),
    });
    assert.equal(calls[0].webSearch, true);
    assert.match(calls[0].user, /"visualStyleAndMotion": "choose"/);
    assert.match(calls[0].user, /2D con motion graphics/);
    assert.match(calls[0].system, /volcanes/);
    assert.equal(plan.items.length, 2);
    const [first, second] = plan.items as Array<{ prompt: string; visualStyle: string; motion: string }>;
    assert.match(first.prompt, /Estilo visual: 2D con motion graphics$/);
    assert.equal(first.visualStyle, 'flat-2d');
    assert.equal(first.motion, 'graphics');
    // invalid AI values fall back to safe defaults
    assert.equal(second.visualStyle, 'ugc');
    assert.equal(second.motion, 'stills_dynamic');
  });

  it('keeps the visual style and motion the user fixed', async () => {
    const { planner: p, calls } = planner({
      items: [{ blockId: 'b1', prompt: 'Did you know honey never spoils? It has been found in tombs...', visualStyle: 'anime', motion: 'full' }],
    });
    const plan = await p.plan({
      localDate: '2026-11-17',
      topicHint: '',
      useTrends: false,
      blocks: [block({ language: 'en-US', count: 1, visualStyle: 'documentary', motion: 'stills' })],
      recentTopics: [],
      usedVideoIds: new Set(),
    });
    assert.equal(calls[0].webSearch, false);
    const item = plan.items[0] as { visualStyle: string; motion: string };
    assert.equal(item.visualStyle, 'documentary');
    assert.equal(item.motion, 'stills');
  });

  it('drops items without a usable prompt (the run marks them missing)', async () => {
    const { planner: p } = planner({ items: [{ blockId: 'b1', prompt: 'short' }] });
    const plan = await p.plan({
      localDate: '2026-11-17', topicHint: '', useTrends: false, blocks: [block({ count: 1 })], recentTopics: [], usedVideoIds: new Set(),
    });
    assert.equal(plan.items.length, 0);
  });

  it('slugifies zip file names', () => {
    assert.equal(slugify('¿Sabías que los pulpos tienen 3 corazones?'), 'sabias-que-los-pulpos-tienen-3-corazones');
    assert.equal(slugify('!!!'), 'video');
  });

  it('accepts viral-moments blocks with recency and 1-2 clips per source', () => {
    const parsed = block({ format: 'youtube-viral', count: 3, clipCount: 2, durationSec: 45, recency: 'day' });
    assert.equal(parsed.recency, 'day');
    assert.equal(parsed.clipCount, 2);
    assert.throws(() => block({ format: 'youtube-viral', recency: 'forever' }));
  });

  it('asks the viral planner for streamer angles and gives the clipper a viral focus', async () => {
    const { planner: p, calls } = planner({ topics: [], items: [] });
    await p.plan({
      localDate: '2026-11-20',
      topicHint: 'GTA VI',
      useTrends: true,
      blocks: [],
      recentTopics: [],
      usedVideoIds: new Set(),
    });
    assert.match(calls[0].system, /Momentos virales/);
    assert.match(viralFocus('GTA VI', 'es-LA'), /reacciones fuertes/);
    assert.match(viralFocus('GTA VI', 'en-US'), /streamer reactions/);
  });
});

