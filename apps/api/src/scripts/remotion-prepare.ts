/**
 * Build-time Remotion preparation (used by Dockerfile.api):
 *   node dist/scripts/remotion-prepare.js --bundle <outDir>   # pre-bundle (build stage)
 *   node dist/scripts/remotion-prepare.js --browser           # download Chrome headless shell (runner stage)
 *
 * At runtime RemotionService uses REMOTION_SERVE_URL (the bundle dir) and
 * never bundles or downloads Chrome on the first render.
 */
import { ensureBrowser } from '@remotion/renderer';
import * as path from 'path';
import { bundleRemotion } from '../remotion/remotion.service';

async function main() {
  const args = process.argv.slice(2);
  const bundleIndex = args.indexOf('--bundle');
  if (bundleIndex >= 0) {
    const outDir = path.resolve(args[bundleIndex + 1] ?? 'remotion-bundle');
    const started = Date.now();
    const location = await bundleRemotion(outDir);
    console.log(`Remotion bundle → ${location} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }
  if (args.includes('--browser')) {
    await ensureBrowser();
    console.log('Remotion Chrome headless shell ready');
  }
  if (bundleIndex < 0 && !args.includes('--browser')) {
    console.error('Usage: remotion-prepare [--bundle <outDir>] [--browser]');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
