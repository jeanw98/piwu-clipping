/**
 * One-shot MiniMax image→video smoke test.
 *
 * Usage:
 *   pnpm --filter @piwu/api exec ts-node --transpile-only src/scripts/minimax-smoke.ts ./path/to/vertical.png
 *
 * Requires MINIMAX_API_KEY and storage env (local or S3) in apps/api/.env or repo root .env.
 */
import { config as loadEnv } from 'dotenv';
import { promises as fs } from 'fs';
import * as path from 'path';
import { MinimaxService } from '../ai/minimax.service';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../config/env.schema';
import { validateEnv } from '../config/env.schema';
import {
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

loadEnv({ path: path.resolve(process.cwd(), '.env') });
loadEnv({ path: path.resolve(process.cwd(), '../../.env') });

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    throw new Error('Pass a vertical image path as the first argument');
  }
  const env = validateEnv(process.env as Record<string, unknown>);
  const config = {
    get<K extends keyof EnvConfig>(key: K) {
      return env[key];
    },
  } as ConfigService<EnvConfig, true>;

  const image = await fs.readFile(path.resolve(imagePath));
  const minimax = new MinimaxService(config);
  const result = await minimax.animateImage({
    image,
    prompt:
      'subtle natural motion, same subject, no scene change, no morphing',
    durationSec: 6,
    size: { width: 768, height: 1344 },
  });

  if (!result.isVideo || result.buffer.length < 1024) {
    throw new Error('MiniMax did not return a usable video');
  }

  const filename = `minimax-smoke-${Date.now()}.mp4`;
  if (env.STORAGE_DRIVER === 's3') {
    const prefix = env.S3_PREFIX.replace(/^\/+|\/+$/g, '');
    const key = `${prefix}/assets/${filename}`;
    const client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });
    await client.send(
      new PutObjectCommand({
        Bucket: env.AWS_BUCKET,
        Key: key,
        Body: result.buffer,
        ContentType: 'video/mp4',
      }),
    );
    console.log(`Uploaded s3://${env.AWS_BUCKET}/${key}`);
  } else {
    const outDir = path.resolve(process.cwd(), 'uploads/assets');
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, filename);
    await fs.writeFile(outPath, result.buffer);
    console.log(`Wrote ${outPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
