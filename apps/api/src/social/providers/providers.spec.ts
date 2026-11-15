import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { InstagramProvider } from './instagram.provider';
import { TikTokProvider } from './tiktok.provider';
import { timing } from './types';
import { YouTubeProvider } from './youtube.provider';

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
const realFetch = globalThis.fetch;
let calls: Call[] = [];

/** Route table: first matching (method, url substring) answers. */
function mockFetch(routes: Array<[string, string, (call: Call) => Response]>) {
  globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: (init.method ?? 'GET').toUpperCase(),
      headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)),
      body: init.body,
    };
    calls.push(call);
    const route = routes.find(([method, part]) => method === call.method && call.url.includes(part));
    if (!route) return new Response(`no route for ${call.method} ${call.url}`, { status: 599 });
    return route[2](call);
  }) as typeof fetch;
}
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] ?? '' }) as never;
const video = Buffer.from('fake-mp4-bytes');
const input = { video, videoUrl: 'https://cdn.example.com/v.mp4', title: 'Mi clip', caption: 'Hola #shorts', privacy: 'public' as const };

beforeEach(() => {
  calls = [];
  timing.pollMs = 0;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('YouTubeProvider', () => {
  const yt = new YouTubeProvider(config({ GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec' }));

  it('builds an offline-consent auth URL with upload scope', () => {
    const url = new URL(yt.authUrl('st', 'https://api.x/social/youtube/callback'));
    assert.equal(url.searchParams.get('access_type'), 'offline');
    assert.match(url.searchParams.get('scope')!, /youtube\.upload/);
    assert.equal(url.searchParams.get('state'), 'st');
  });

  it('resumable upload: init with metadata, then PUT bytes', async () => {
    mockFetch([
      ['POST', 'upload/youtube/v3/videos', () => new Response('', { status: 200, headers: { Location: 'https://upload.session/1' } })],
      ['PUT', 'upload.session/1', () => json({ id: 'abc123' })],
    ]);
    const result = await yt.publish({ accessToken: 'tok', scopes: [] }, { externalId: 'ch', displayName: 'c' }, input);
    assert.equal(result.externalUrl, 'https://www.youtube.com/shorts/abc123');
    const meta = JSON.parse(calls[0].body as string);
    assert.equal(meta.snippet.title, 'Mi clip #Shorts');
    assert.equal(meta.status.privacyStatus, 'public');
    assert.equal(calls[0].headers.Authorization, 'Bearer tok');
    assert.equal(calls[1].headers['Content-Length'], String(video.length));
  });

  it('surfaces Google errors', async () => {
    mockFetch([['POST', 'upload/youtube', () => json({ error: { message: 'quotaExceeded' } }, { status: 403 })]]);
    await assert.rejects(
      yt.publish({ accessToken: 't', scopes: [] }, { externalId: 'c', displayName: 'c' }, input),
      /403/,
    );
  });

  it('rejects a Google account without a channel', async () => {
    mockFetch([['GET', 'youtube/v3/channels', () => json({ items: [] })]]);
    await assert.rejects(yt.profile({ accessToken: 't', scopes: [] }), /canal/);
  });
});

describe('InstagramProvider', () => {
  const ig = new InstagramProvider(config({ INSTAGRAM_APP_ID: 'app', INSTAGRAM_APP_SECRET: 'sec' }));

  it('exchanges the code for a long-lived token', async () => {
    mockFetch([
      ['POST', 'api.instagram.com/oauth/access_token', () => json({ access_token: 'short', user_id: 1, permissions: ['instagram_business_basic'] })],
      ['GET', 'graph.instagram.com/access_token', () => json({ access_token: 'long', expires_in: 5184000 })],
    ]);
    const tokens = await ig.exchangeCode('code#_', 'https://api.x/cb');
    assert.equal(tokens.accessToken, 'long');
    assert.ok(tokens.expiresAt!.getTime() > Date.now() + 50 * 86400_000);
    assert.match(String(calls[0].body), /code=code(&|$)/); // trailing "#_" stripped
  });

  it('container → wait FINISHED → publish → permalink', async () => {
    let polls = 0;
    mockFetch([
      ['POST', '/ig1/media_publish', () => json({ id: 'media9' })],
      ['POST', '/ig1/media', () => json({ id: 'cont1' })],
      ['GET', '/cont1?', () => json({ status_code: ++polls < 2 ? 'IN_PROGRESS' : 'FINISHED' })],
      ['GET', '/media9?', () => json({ permalink: 'https://instagram.com/reel/xyz' })],
    ]);
    const result = await ig.publish({ accessToken: 't', scopes: [] }, { externalId: 'ig1', displayName: '@me' }, input);
    assert.equal(result.externalPostId, 'media9');
    assert.equal(result.externalUrl, 'https://instagram.com/reel/xyz');
    assert.match(String(calls[0].body), /media_type=REELS/);
    assert.equal(polls, 2);
  });

  it('fails clearly when Meta cannot process the video', async () => {
    mockFetch([
      ['POST', '/ig1/media', () => json({ id: 'cont1' })],
      ['GET', '/cont1?', () => json({ status_code: 'ERROR', status: 'Video format unsupported' })],
    ]);
    await assert.rejects(
      ig.publish({ accessToken: 't', scopes: [] }, { externalId: 'ig1', displayName: '@me' }, input),
      /unsupported/,
    );
  });

  it('needs a public https video URL', async () => {
    await assert.rejects(
      ig.publish({ accessToken: 't', scopes: [] }, { externalId: 'ig1', displayName: '@me' }, { ...input, videoUrl: '/storage/renders/x.mp4' }),
      /URL pública/,
    );
  });
});

describe('TikTokProvider', () => {
  const tt = new TikTokProvider(config({ TIKTOK_CLIENT_KEY: 'ck', TIKTOK_CLIENT_SECRET: 'cs' }));

  it('picks the closest allowed privacy (unaudited apps → SELF_ONLY) and uploads in one chunk', async () => {
    mockFetch([
      ['POST', 'creator_info/query', () => json({ data: { privacy_level_options: ['SELF_ONLY'] }, error: { code: 'ok', message: '' } })],
      ['POST', 'video/init', () => json({ data: { publish_id: 'p1', upload_url: 'https://upload.tiktok/1' }, error: { code: 'ok', message: '' } })],
      ['PUT', 'upload.tiktok/1', () => new Response('', { status: 201 })],
      ['POST', 'status/fetch', () => json({ data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [777] }, error: { code: 'ok', message: '' } })],
    ]);
    const result = await tt.publish(
      { accessToken: 't', scopes: [] },
      { externalId: 'o', displayName: '@me', meta: { username: 'me' } },
      input,
    );
    const init = JSON.parse(calls[1].body as string);
    assert.equal(init.post_info.privacy_level, 'SELF_ONLY');
    assert.equal(init.source_info.total_chunk_count, 1);
    assert.equal(calls[2].headers['Content-Range'], `bytes 0-${video.length - 1}/${video.length}`);
    assert.equal(result.externalUrl, 'https://www.tiktok.com/@me/video/777');
  });

  it('uses PUBLIC_TO_EVERYONE when the app is audited', async () => {
    mockFetch([
      ['POST', 'creator_info/query', () => json({ data: { privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'] }, error: { code: 'ok', message: '' } })],
      ['POST', 'video/init', () => json({ data: { publish_id: 'p1', upload_url: 'https://upload.tiktok/1' }, error: { code: 'ok', message: '' } })],
      ['PUT', 'upload.tiktok/1', () => new Response('', { status: 201 })],
      ['POST', 'status/fetch', () => json({ data: { status: 'PUBLISH_COMPLETE' }, error: { code: 'ok', message: '' } })],
    ]);
    await tt.publish({ accessToken: 't', scopes: [] }, { externalId: 'o', displayName: 'x' }, input);
    assert.equal(JSON.parse(calls[1].body as string).post_info.privacy_level, 'PUBLIC_TO_EVERYONE');
  });

  it('reports TikTok API errors', async () => {
    mockFetch([['POST', 'creator_info/query', () => json({ data: {}, error: { code: 'access_token_invalid', message: 'token expired' } })]]);
    await assert.rejects(
      tt.publish({ accessToken: 't', scopes: [] }, { externalId: 'o', displayName: 'x' }, input),
      /token expired/,
    );
  });
});
