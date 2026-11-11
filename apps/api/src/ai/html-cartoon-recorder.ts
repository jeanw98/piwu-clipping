import { Logger } from '@nestjs/common';
import { existsSync, promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { chromium, type Page } from 'playwright';
import { spawn } from 'child_process';

const logger = new Logger('HtmlCartoonRecorder');

function resolvePoppinsFont(): string | null {
  const candidates = [
    path.join(__dirname, 'html-cartoon', 'fonts', 'Poppins-Bold.ttf'),
    path.join(
      process.cwd(),
      'src',
      'ai',
      'html-cartoon',
      'fonts',
      'Poppins-Bold.ttf',
    ),
    path.join(
      process.cwd(),
      'apps',
      'api',
      'src',
      'ai',
      'html-cartoon',
      'fonts',
      'Poppins-Bold.ttf',
    ),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export interface HtmlRecordOptions {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  /** Optional timing payload; injected via __PIWU_INJECT_TIMING before frames. */
  timing?: unknown;
}

function run(
  cmd: string,
  args: string[],
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-800)}`));
    });
  });
}

async function framesToMp4(
  framesDir: string,
  fps: number,
  mp4Path: string,
  ext: 'jpg' | 'png',
): Promise<void> {
  await run(
    'ffmpeg',
    [
      '-y',
      '-framerate',
      String(fps),
      '-i',
      path.join(framesDir, `frame-%05d.${ext}`),
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      mp4Path,
    ],
    15 * 60_000,
  );
}

async function seekFrame(page: Page, t: number): Promise<void> {
  await page.evaluate(async (time) => {
    const w = window as unknown as {
      render?: (t: number) => void;
      __PIWU_SET_TIME?: (t: number) => void;
    };
    if (typeof w.render === 'function') w.render(time);
    else if (typeof w.__PIWU_SET_TIME === 'function') w.__PIWU_SET_TIME(time);
    else throw new Error('window.render / __PIWU_SET_TIME missing');
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
  }, t);
}

/**
 * Deterministic capture: render(t) each frame → JPEG → ffmpeg H.264.
 */
export async function renderHtmlToMp4(
  html: string,
  options: HtmlRecordOptions,
): Promise<Buffer> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'piwu-html-cartoon-'));
  const htmlPath = path.join(workDir, 'index.html');
  const mp4Path = path.join(workDir, 'out.mp4');
  const framesDir = path.join(workDir, 'frames');
  await fs.mkdir(framesDir, { recursive: true });
  await fs.writeFile(htmlPath, html, 'utf8');
  const fontSrc = resolvePoppinsFont();
  if (fontSrc) {
    const fontDir = path.join(workDir, 'fonts');
    await fs.mkdir(fontDir, { recursive: true });
    await fs.copyFile(fontSrc, path.join(fontDir, 'Poppins-Bold.ttf'));
  } else {
    logger.warn('Poppins-Bold.ttf not found — captions may use fallback font');
  }
  const fileUrl = `file://${htmlPath}`;

  const totalFrames = Math.max(1, Math.ceil(options.durationSec * options.fps));
  logger.log(
    `Frame-seeking canvas: ${totalFrames} frames @ ${options.fps}fps (${options.durationSec.toFixed(2)}s)`,
  );

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (err) => {
      logger.warn(`Canvas pageerror: ${err.message}`);
    });
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { render?: unknown }).render ===
          'function' ||
        typeof (window as unknown as { __PIWU_SET_TIME?: unknown })
          .__PIWU_SET_TIME === 'function',
      { timeout: 15_000 },
    );
    await page
      .evaluate(async () => {
        const w = window as unknown as { ready?: Promise<unknown> };
        if (w.ready) await w.ready;
      })
      .catch(() => undefined);

    if (options.timing) {
      await page.evaluate((tm) => {
        const w = window as unknown as {
          __PIWU_INJECT_TIMING?: (t: unknown) => void;
        };
        if (typeof w.__PIWU_INJECT_TIMING === 'function') {
          w.__PIWU_INJECT_TIMING(tm);
        }
      }, options.timing);
    }

    // Confirm TM present
    await page.waitForFunction(
      () => {
        const w = window as unknown as { TM?: { sc?: unknown[] } };
        return Array.isArray(w.TM?.sc) && (w.TM?.sc?.length ?? 0) > 0;
      },
      { timeout: 5_000 },
    ).catch(() => {
      logger.warn('TM.sc not confirmed; continuing with design SC fallback');
    });

    for (let i = 0; i < totalFrames; i++) {
      const t = i / options.fps;
      await seekFrame(page, t);
      await page.screenshot({
        path: path.join(framesDir, `frame-${String(i).padStart(5, '0')}.jpg`),
        type: 'jpeg',
        quality: 84,
        animations: 'disabled',
      });
      if (i > 0 && i % Math.max(30, Math.floor(totalFrames / 10)) === 0) {
        logger.log(`HTML cartoon frames ${i}/${totalFrames}`);
      }
    }
    await page.close();
    await framesToMp4(framesDir, options.fps, mp4Path, 'jpg');
    return fs.readFile(mp4Path);
  } finally {
    await browser.close().catch(() => undefined);
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
