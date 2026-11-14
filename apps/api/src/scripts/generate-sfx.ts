/**
 * Generate copyright-free sound effects with ffmpeg (pure synthesis).
 *   pnpm --filter @piwu/api sfx:generate
 * Writes apps/api/assets/sfx/{whoosh,pop,alert,ding}.mp3
 */
import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';
import * as path from 'path';

const OUT = path.resolve(__dirname, '../../assets/sfx');

const EFFECTS: Record<string, string[]> = {
  // Pink-noise swoosh, band-limited with soft attack/release.
  whoosh: [
    '-f', 'lavfi', '-i', 'anoisesrc=d=0.55:c=pink:a=0.6',
    '-af', 'highpass=f=350,lowpass=f=4200,afade=t=in:st=0:d=0.22,afade=t=out:st=0.25:d=0.3,volume=1.4',
  ],
  // Short pitch-drop blip.
  pop: [
    '-f', 'lavfi', '-i', "aevalsrc='0.8*sin(2*PI*(380+900*exp(-t*38))*t)*exp(-t*22)':d=0.18:s=44100",
  ],
  // Two-tone alarm beeps.
  alert: [
    '-f', 'lavfi', '-i', "aevalsrc='0.45*sin(2*PI*(if(lt(mod(t,0.24),0.12),880,660))*t)*lt(mod(t,0.24),0.2)':d=0.5:s=44100",
    '-af', 'afade=t=out:st=0.38:d=0.12',
  ],
  // Bell ding with harmonic.
  ding: [
    '-f', 'lavfi', '-i', "aevalsrc='0.6*sin(2*PI*1320*t)*exp(-t*5)+0.25*sin(2*PI*2640*t)*exp(-t*8)':d=1.1:s=44100",
  ],
};

mkdirSync(OUT, { recursive: true });
for (const [name, args] of Object.entries(EFFECTS)) {
  const file = path.join(OUT, `${name}.mp3`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', file]);
  console.log(`✓ ${path.relative(process.cwd(), file)}`);
}
