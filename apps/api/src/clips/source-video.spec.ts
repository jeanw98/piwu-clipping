import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ownedSourcePath } from './source-upload.service';
import { explainDownloadError, progressParser } from './youtube-media';

describe('explainDownloadError', () => {
  it('explains the YouTube bot check and suggests uploading', () => {
    const msg = explainDownloadError(
      "ERROR: [youtube] OarAd2Zao98: Sign in to confirm you’re not a bot. This helps protect our community.",
      'youtube',
    );
    assert.match(msg, /anti-bots/);
    assert.match(msg, /Subir archivo/);
  });
  it('maps private, unavailable and Instagram login errors', () => {
    assert.match(explainDownloadError('ERROR: Private video', 'youtube'), /privado/);
    assert.match(explainDownloadError('ERROR: Video unavailable', 'youtube'), /no está disponible/);
    assert.match(explainDownloadError('ERROR: [youtube] x: This video is unavailable', 'youtube'), /no está disponible/);
    assert.match(explainDownloadError('ERROR: [Instagram] abc: login required', 'instagram'), /Instagram pidió iniciar sesión/);
  });
});

describe('progressParser', () => {
  it('stays monotonic across video+audio downloads', () => {
    const seen: number[] = [];
    const parse = progressParser(true, (f) => seen.push(f));
    for (const pct of [0, 25, 50, 100, 0, 50, 100]) parse(`PIWU ${pct.toFixed(1)}%`);
    parse('[download] something else');
    for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1]);
    assert.equal(seen[seen.length - 1], 1);
  });
});

describe('ownedSourcePath', () => {
  it('accepts only the uploader’s own source files', () => {
    assert.equal(ownedSourcePath('storage:sources/u1/abc-123.mp4', 'u1'), 'sources/u1/abc-123.mp4');
    assert.equal(ownedSourcePath('storage:sources/u2/abc-123.mp4', 'u1'), null);
    assert.equal(ownedSourcePath('storage:sources/u1/../x.mp4', 'u1'), null);
    assert.equal(ownedSourcePath('storage:renders/u1/a.mp4', 'u1'), null);
  });
});
