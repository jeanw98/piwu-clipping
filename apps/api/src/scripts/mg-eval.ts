/**
 * PAID QA: real Claude specs for several ideas → library resolution →
 * local generation of missing objects/backgrounds (same caps + prompts as
 * production) → synthetic timing (no ElevenLabs) → PNG stills.
 *
 *   ts-node src/scripts/mg-eval.ts ideas.json
 *   ideas.json = [{ "id": "roma", "prompt": "...", "durationSec": 45 }, …]
 *
 * Output: tmp/mg-eval/<id>/{spec.json,1-intro.png,…} + tmp/mg-eval/report.json
 * Reads ANTHROPIC_API_KEY / OPENAI_API_KEY from env or apps/api/.env.
 */
import { renderStill, selectComposition } from '@remotion/renderer';
import { config } from 'dotenv';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import OpenAI from 'openai';
import * as path from 'path';
import {
  type MotionGraphicsCompositionProps,
  type MotionGraphicsSpec,
  type WordTimestamp,
} from '@piwu/shared';
import { AnthropicService } from '../ai/anthropic.service';
import { mgBackgroundPrompt, mgObjectPrompt } from '../clips/mg-asset-generator.service';
import { resolveSpecAssets, slugify } from '../clips/mg-assets';
import {
  computeMotionGraphicsTiming,
  resolveActionTimes,
} from '../clips/motion-graphics-timing';
import { bundleRemotion } from '../remotion/remotion.service';

config({ path: path.resolve(__dirname, '../../.env') });

const OUT = path.resolve(__dirname, '../../tmp/mg-eval');
const ASSETS = path.join(OUT, '_assets');
const MAX_OBJECTS = Number(process.env.MG_MAX_GENERATED_ASSETS ?? 3);
const MAX_BACKGROUNDS = Number(process.env.MG_MAX_GENERATED_BACKGROUNDS ?? 2);

/** Minimal ConfigService stand-in for AnthropicService outside Nest. */
const fakeConfig = {
  get: (key: string) =>
    process.env[key] ?? ({ ANTHROPIC_MODEL: 'claude-sonnet-5-5' } as Record<string, string>)[key],
};

function syntheticWords(spec: MotionGraphicsSpec): WordTimestamp[] {
  const words: WordTimestamp[] = [];
  let t = 0.2;
  for (const [text] of spec.cues) {
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const dur = 0.16 + word.length * 0.045;
      words.push({ word, start: t, end: t + dur });
      t += dur + 0.06;
    }
    t += 0.18;
  }
  return words;
}

async function serveDir(dir: string): Promise<{ base: string; close: () => void }> {
  const server = createServer((req, res) => {
    const file = path.join(dir, path.basename(decodeURIComponent(req.url ?? '')));
    if (!existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': statSync(file).size,
      'Access-Control-Allow-Origin': '*',
    });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

async function generateMissing(
  openai: OpenAI,
  spec: MotionGraphicsSpec,
  missing: string[],
  backgrounds: string[],
  base: string,
): Promise<{ spec: MotionGraphicsSpec; urls: Record<string, string>; objects: number; bgs: number; skipped: string[] }> {
  const urls: Record<string, string> = {};
  const src = new Map<string, string>();
  const skipped: string[] = [];
  let objects = 0;
  let bgs = 0;
  const jobs: Promise<void>[] = [];
  for (const name of missing) {
    const file = `obj-${slugify(name)}.png`;
    if (!existsSync(path.join(ASSETS, file))) {
      if (objects >= MAX_OBJECTS) {
        skipped.push(name);
        continue;
      }
      objects += 1;
      jobs.push(
        openai.images
          .generate({ model: 'gpt-image-1-mini', prompt: mgObjectPrompt(name), size: '1024x1024', quality: 'low', background: 'transparent', n: 1 })
          .then((r) => writeFileSync(path.join(ASSETS, file), Buffer.from(r.data![0].b64_json!, 'base64'))),
      );
    }
    src.set(name, `storage:local/${file}`);
    urls[`storage:local/${file}`] = `${base}/${file}`;
  }
  for (const place of backgrounds) {
    const file = `bg-${slugify(place).slice(0, 80)}.png`;
    if (!existsSync(path.join(ASSETS, file))) {
      if (bgs >= MAX_BACKGROUNDS) {
        skipped.push(place);
        continue;
      }
      bgs += 1;
      jobs.push(
        openai.images
          .generate({ model: 'gpt-image-1-mini', prompt: mgBackgroundPrompt(place), size: '1024x1536', quality: 'medium', n: 1 })
          .then((r) => writeFileSync(path.join(ASSETS, file), Buffer.from(r.data![0].b64_json!, 'base64'))),
      );
    }
    src.set(place, `storage:local/${file}`);
    urls[`storage:local/${file}`] = `${base}/${file}`;
  }
  await Promise.all(jobs);
  const named = (n: string) => src.get(n.trim().toLowerCase());
  const setting = <T extends MotionGraphicsSpec['setting']>(s: T): T =>
    s?.background && !s.backgroundSrc && named(s.background) ? { ...s, backgroundSrc: named(s.background) } : s;
  return {
    spec: {
      ...spec,
      setting: setting(spec.setting),
      scenes: spec.scenes.map((scene) => ({
        ...scene,
        setting: setting(scene.setting),
        elements: scene.elements?.map((el) =>
          'asset' in el && !el.src && named(el.asset) ? { ...el, src: named(el.asset) } : el,
        ),
        actions: scene.actions?.map((a) =>
          a.do === 'throw' && !a.whatSrc && named(a.what)
            ? { ...a, whatSrc: named(a.what) }
            : a.do === 'transform' && !a.intoSrc && named(a.into)
              ? { ...a, intoSrc: named(a.into) }
              : a,
        ),
      })),
    },
    urls,
    objects,
    bgs,
    skipped,
  };
}

async function main() {
  const ideasFile = process.argv[2];
  if (!ideasFile) throw new Error('Usage: mg-eval <ideas.json>');
  const ideas = JSON.parse(readFileSync(path.resolve(ideasFile), 'utf8')) as Array<{
    id: string;
    prompt: string;
    durationSec?: number;
  }>;
  mkdirSync(ASSETS, { recursive: true });
  const anthropic = new AnthropicService(fakeConfig as never);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const server = await serveDir(ASSETS);
  console.log('Bundling Remotion…');
  const serveUrl = await bundleRemotion();
  const report: unknown[] = [];

  for (const idea of ideas) {
    const dir = path.join(OUT, idea.id);
    mkdirSync(dir, { recursive: true });
    const started = Date.now();
    try {
      const raw = await anthropic.generateMotionGraphicsSpec(idea.prompt, {
        language: 'es-LA',
        durationSec: idea.durationSec ?? 45,
      });
      const usage = anthropic.lastMgUsage;
      const resolved = resolveSpecAssets(raw);
      const gen = await generateMissing(openai, resolved.spec, resolved.missing, resolved.backgrounds, server.base);
      const words = syntheticWords(gen.spec);
      const timing = computeMotionGraphicsTiming(gen.spec, words);
      const spec = resolveActionTimes(gen.spec, words, timing);
      writeFileSync(path.join(dir, 'spec.json'), JSON.stringify(spec, null, 2));

      const props: MotionGraphicsCompositionProps = { spec, timing, audioUrl: '', sfx: false, assetUrls: gen.urls };
      const composition = await selectComposition({ serveUrl, id: 'MotionGraphicsClip', inputProps: props as never });
      const shots = [
        { name: 'intro', t: Math.max(0.5, timing.intro[1] - 0.4) },
        ...timing.scenes.slice(0, 7).map(([s0, s1], i) => ({ name: `s${i + 1}`, t: s0 + Math.min(2.6, (s1 - s0) * 0.7) })),
      ];
      for (const [k, shot] of shots.entries()) {
        await renderStill({
          composition,
          serveUrl,
          output: path.join(dir, `${k + 1}-${shot.name}.png`),
          inputProps: props as never,
          frame: Math.round(shot.t * composition.fps),
          chromiumOptions: { disableWebSecurity: true },
        });
      }
      const unsynced = spec.scenes.flatMap((s) =>
        (s.actions ?? []).filter((a) => typeof a.at === 'string' && a.atSec === undefined).map((a) => String(a.at)),
      );
      const entry = {
        id: idea.id,
        ok: true,
        seconds: Math.round((Date.now() - started) / 1000),
        title: spec.title,
        theme: spec.theme,
        scenes: spec.scenes.length,
        settings: spec.scenes.filter((s) => s.setting ?? spec.setting).length,
        elements: spec.scenes.reduce((n, s) => n + (s.elements?.length ?? 0), 0),
        actions: spec.scenes.reduce((n, s) => n + (s.actions?.length ?? 0), 0),
        components: spec.scenes.map((s) => s.component),
        missingObjects: resolved.missing,
        generatedObjects: gen.objects,
        generatedBackgrounds: gen.bgs,
        skipped: gen.skipped,
        unsyncedActionWords: unsynced,
        usage,
      };
      report.push(entry);
      console.log(`✓ ${idea.id}: ${entry.scenes} escenas, ${entry.elements} objetos, ${entry.actions} acciones, gen ${gen.objects} obj / ${gen.bgs} fondos (${entry.seconds}s)`);
    } catch (error) {
      report.push({ id: idea.id, ok: false, error: (error as Error).message });
      console.log(`✗ ${idea.id}: ${(error as Error).message}`);
    }
  }
  server.close();
  writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
