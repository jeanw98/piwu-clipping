/**
 * PAID QA (~$0.015 per image): generate Motion Graphics backgrounds with the
 * production prompt and save them to tmp/mg-bg/<slug>.png for mg:preview.
 *   OPENAI_API_KEY=... ts-node src/scripts/mg-test-backgrounds.ts "inside a spaceship cockpit" "surface of Mars"
 * Reads OPENAI_API_KEY from the environment or apps/api/.env.
 */
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import OpenAI from 'openai';
import * as path from 'path';
import { mgBackgroundPrompt } from '../clips/mg-asset-generator.service';
import { slugify } from '../clips/mg-assets';

config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
  const places = process.argv.slice(2);
  if (!places.length) throw new Error('Pass one or more place descriptions');
  const out = path.resolve(__dirname, '../../tmp/mg-bg');
  mkdirSync(out, { recursive: true });
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  await Promise.all(
    places.map(async (place) => {
      const started = Date.now();
      const result = await openai.images.generate({
        model: 'gpt-image-1-mini',
        prompt: mgBackgroundPrompt(place),
        size: '1024x1536',
        quality: 'medium',
        n: 1,
      });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new Error(`No image for ${place}`);
      const file = path.join(out, `${slugify(place)}.png`);
      writeFileSync(file, Buffer.from(b64, 'base64'));
      console.log(`✓ ${place} → ${path.relative(process.cwd(), file)} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
