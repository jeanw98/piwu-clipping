/**
 * Motion Graphics QA without paid APIs.
 *
 *   pnpm --filter @piwu/api mg:preview <spec.json> <timing.json> [--scenes 1,2,9] [--video [audio.mp3]] [--presenter robot.png]
 *
 * - Renders 6 PNG stills (intro + 5 scenes) with renderStill → tmp/mg-preview/
 * - `--presenter <png|webp|svg>` draws that image as the on-screen presenter (what-if).
 * - `--video` also renders the full MP4. Without an audio file it synthesizes
 *   a silent dummy track of the clip's length.
 *
 * timing.json may be either a MotionGraphicsTiming ({intro, scenes, cues, end})
 * or a reference file with real cue windows ({cues: [[s,e],…]}, like
 * docs/motion-graphics/nvidia/timing.json) — then words are synthesized per cue
 * and aligned with the same code the worker uses.
 */
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { execFileSync } from 'child_process';
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from 'fs';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import * as path from 'path';
import {
  motionGraphicsSpecSchema,
  type MotionGraphicsCompositionProps,
  type MotionGraphicsTiming,
  type WordTimestamp,
} from '@piwu/shared';
import {
  computeMotionGraphicsTiming,
  resolveActionTimes,
} from '../clips/motion-graphics-timing';
import { resolveSpecAssets, slugify } from '../clips/mg-assets';
import { withPresenter } from '../clips/mg-presenter';
import {
  bundleRemotion,
  RENDER_MEDIA_OPTIONS,
  REMOTION_PUBLIC_DIR,
} from '../remotion/remotion.service';

const OUT = path.resolve(__dirname, '../../tmp/mg-preview');
const BG_DIR = path.resolve(__dirname, '../../tmp/mg-bg');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function loadTiming(
  file: string,
  spec: ReturnType<typeof motionGraphicsSpecSchema.parse>,
): { timing: MotionGraphicsTiming; words: WordTimestamp[] } {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<MotionGraphicsTiming> & {
    cues?: Array<[number, number]>;
  };
  if (raw.intro && raw.scenes && raw.cues && typeof raw.end === 'number') {
    return { timing: raw as MotionGraphicsTiming, words: [] };
  }
  if (!raw.cues?.length) throw new Error('timing.json needs `cues`');
  const words: WordTimestamp[] = [];
  spec.cues.forEach(([text], c) => {
    let [start, end] = raw.cues![c] ?? [0, 0];
    if (end - start < 0.3) [start, end] = c === 0 ? [0.2, 3.3] : [start, start + 1.5];
    const tokens = text.split(/\s+/).filter(Boolean);
    const step = (end - 0.25 - start) / tokens.length;
    tokens.forEach((word, k) =>
      words.push({ word, start: start + k * step, end: start + (k + 0.85) * step }),
    );
  });
  return { timing: computeMotionGraphicsTiming(spec, words), words };
}

function pickScenes(n: number): number[] {
  const explicit = arg('--scenes');
  if (explicit) {
    return explicit
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isInteger(v) && v >= 0 && v < n)
      .slice(0, 5);
  }
  return Array.from(new Set([0, 1, 2, 3, 4].map((k) => Math.round((k * (n - 1)) / 4))));
}

/** Tiny static server so Chrome can load local QA files (audio, generated backgrounds). */
async function serveDir(dir: string): Promise<{ base: string; close: () => void }> {
  const types: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  };
  const server = createServer((req, res) => {
    const file = path.join(dir, path.basename(decodeURIComponent(req.url ?? '')));
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': statSync(file).size,
      'Access-Control-Allow-Origin': '*',
    });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, close: () => server.close() };
}

/** Use tmp/mg-bg/<slug>.png (from mg-test-backgrounds) for generated backgrounds. */
function attachLocalBackgrounds(
  spec: ReturnType<typeof motionGraphicsSpecSchema.parse>,
  base: string,
): { spec: typeof spec; assetUrls: Record<string, string> } {
  const assetUrls: Record<string, string> = {};
  const attach = <T extends typeof spec.setting>(setting: T): T => {
    if (!setting?.background || setting.backgroundSrc) return setting;
    const file = `${slugify(setting.background)}.png`;
    if (!existsSync(path.join(BG_DIR, file))) {
      console.log(`No local background for "${setting.background}" (procedural fallback)`);
      return setting;
    }
    const src = `storage:local/${file}`;
    assetUrls[src] = `${base}/${file}`;
    return { ...setting, backgroundSrc: src };
  };
  return {
    spec: {
      ...spec,
      setting: attach(spec.setting),
      scenes: spec.scenes.map((scene) => ({ ...scene, setting: attach(scene.setting) })),
    },
    assetUrls,
  };
}

async function main() {
  const [specPath, timingPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!specPath || !timingPath) {
    console.error('Usage: mg:preview <spec.json> <timing.json> [--scenes 1,2,3] [--video [audio.mp3]]');
    process.exit(1);
  }
  const parsedSpec = motionGraphicsSpecSchema.parse(
    JSON.parse(readFileSync(path.resolve(specPath), 'utf8')),
  );
  // Library objects only — no paid generation in QA.
  const resolved = resolveSpecAssets(parsedSpec);
  if (resolved.missing.length) {
    console.log(`Not in library (skipped): ${resolved.missing.join(', ')}`);
  }
  mkdirSync(BG_DIR, { recursive: true });
  const bgServer = await serveDir(BG_DIR);
  const attached = attachLocalBackgrounds(resolved.spec, bgServer.base);
  const assetUrls = attached.assetUrls;
  const loaded = loadTiming(path.resolve(timingPath), resolved.spec);
  const timing = loaded.timing;
  let spec = resolveActionTimes(attached.spec, loaded.words, timing);
  const presenterFile = arg('--presenter');
  if (presenterFile) {
    const file = `presenter${path.extname(presenterFile)}`;
    copyFileSync(path.resolve(presenterFile), path.join(BG_DIR, file));
    const src = `storage:local/${file}`;
    assetUrls[src] = `${bgServer.base}/${file}`;
    spec = withPresenter(spec, src, loaded.words);
  }
  mkdirSync(OUT, { recursive: true });
  for (const file of readdirSync(OUT)) {
    if (file.endsWith('.png')) unlinkSync(path.join(OUT, file));
  }

  const musicFile = existsSync(path.join(REMOTION_PUBLIC_DIR, 'music', `${spec.theme}.mp3`))
    ? `music/${spec.theme}.mp3`
    : null;
  const props: MotionGraphicsCompositionProps = {
    spec,
    timing,
    audioUrl: '',
    musicFile,
    sfx: true,
    assetUrls,
  };

  console.log('Bundling Remotion…');
  const serveUrl = await bundleRemotion();
  const composition = await selectComposition({
    serveUrl,
    id: 'MotionGraphicsClip',
    inputProps: props as unknown as Record<string, unknown>,
  });

  const shots: Array<{ name: string; t: number }> = [
    { name: 'intro', t: Math.min(timing.intro[1] - 0.4, 2.0) },
    ...pickScenes(timing.scenes.length).map((i) => {
      const [s0, s1] = timing.scenes[i];
      return {
        name: `scene${String(i + 1).padStart(2, '0')}-${spec.scenes[i].component}`,
        t: s0 + Math.min(2.4, (s1 - s0) * 0.6),
      };
    }),
  ];
  const t0 = Date.now();
  for (const [k, shot] of shots.entries()) {
    const output = path.join(OUT, `${k + 1}-${shot.name}.png`);
    await renderStill({
      composition,
      serveUrl,
      output,
      inputProps: props as unknown as Record<string, unknown>,
      frame: Math.round(shot.t * composition.fps),
      chromiumOptions: { disableWebSecurity: true },
    });
    console.log(`✓ ${path.relative(process.cwd(), output)}  (t=${shot.t.toFixed(2)}s)`);
  }
  console.log(`Stills in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  if (process.argv.includes('--video')) {
    const audioArg = arg('--video');
    let audioFile = audioArg && !audioArg.startsWith('--') ? path.resolve(audioArg) : '';
    if (!audioFile) {
      audioFile = path.join(OUT, 'dummy-voice.mp3');
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-f', 'lavfi',
        '-i', `anullsrc=r=44100:cl=mono`, '-t', String(Math.ceil(timing.end)),
        '-c:a', 'libmp3lame', '-b:a', '64k', audioFile,
      ]);
    }
    const server = await serveDir(path.dirname(audioFile));
    const videoProps = { ...props, audioUrl: `${server.base}/${path.basename(audioFile)}` };
    const output = path.join(OUT, 'full.mp4');
    const started = Date.now();
    try {
      const comp = await selectComposition({
        serveUrl,
        id: 'MotionGraphicsClip',
        inputProps: videoProps as unknown as Record<string, unknown>,
      });
      await renderMedia({
        ...(process.argv.includes('--legacy-render')
          ? { codec: 'h264' as const, concurrency: 1, chromiumOptions: { disableWebSecurity: true } }
          : RENDER_MEDIA_OPTIONS),
        composition: comp,
        serveUrl,
        outputLocation: output,
        inputProps: videoProps as unknown as Record<string, unknown>,
        onProgress: ({ progress }) => {
          process.stdout.write(`\rRendering ${(progress * 100).toFixed(0)}%   `);
        },
      });
    } finally {
      server.close();
    }
    console.log(
      `\n✓ ${path.relative(process.cwd(), output)} (${comp_frames(timing)} frames, ${((Date.now() - started) / 1000).toFixed(1)}s)`,
    );
  }
}

function comp_frames(timing: MotionGraphicsTiming) {
  return Math.ceil(timing.end * 30);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
  console.error(error);
  process.exit(1);
});
