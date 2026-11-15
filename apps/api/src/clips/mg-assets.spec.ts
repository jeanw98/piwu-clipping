import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { ASSET_ALIASES } from './mg-asset-aliases';
import { loadLibrary, resolveAssetName, resolveSpecAssets } from './mg-assets';

const library = loadLibrary(join(__dirname, '../../assets/emoji/index.json'));

describe('resolveAssetName', () => {
  it('library is present', () => {
    assert.ok(library.length > 1000);
  });
  for (const [query, slug] of [
    ['palm tree', 'palm-tree'],
    ['Crab', 'crab'],
    ['crabs', 'crab'],
    ['rocket', 'rocket'],
    ['beach umbrella', 'beach-with-umbrella'],
    ['volcano', 'volcano'],
  ] as const) {
    it(`"${query}" → ${slug}`, () => {
      assert.equal(resolveAssetName(query, library)?.slug, slug);
    });
  }
  for (const [query, slug] of [
    ['car', 'automobile'],
    ['water', 'droplet'],
    ['tree', 'deciduous-tree'],
    ['computer', 'desktop-computer'],
    ['smartphone', 'mobile-phone'],
    ['virus', 'microbe'],
    ['ufo', 'flying-saucer'],
    ['burger', 'hamburger'],
    ['bees', 'honeybee'],
    ['police car', 'police-car'],
    ['doctor', 'health-worker'],
  ] as const) {
    it(`alias "${query}" → ${slug}`, () => {
      assert.equal(resolveAssetName(query, library)?.slug, slug);
    });
  }
  it('every alias points to an existing object', () => {
    const slugs = new Set(library.map((e) => e.slug));
    const broken = Object.entries(ASSET_ALIASES).filter(([, slug]) => !slugs.has(slug));
    assert.deepEqual(broken, []);
  });
  it('unknown objects return null', () => {
    assert.equal(resolveAssetName('quantum flux capacitor', library), null);
  });
});

describe('resolveSpecAssets', () => {
  it('sets src and reports missing names', () => {
    const { spec, missing } = resolveSpecAssets(
      {
        scenes: [
          {
            firstCue: 1,
            component: 'None',
            props: {},
            headline: [['PLAYA', 'PLAYA']],
            elements: [
              { asset: 'palm tree', x: 0.2, y: 0.8, scale: 1, anim: 'sway', delay: 0 },
              { asset: 'quantum flux capacitor', x: 0.7, y: 0.8, scale: 1, anim: 'pop', delay: 0 },
            ],
          },
        ],
      } as never,
      library,
    );
    const els = spec.scenes[0].elements as Array<{ src?: string }>;
    assert.equal(els[0].src, 'emoji/palm-tree.svg');
    assert.equal(els[1].src, undefined);
    assert.deepEqual(missing, ['quantum flux capacitor']);
  });
});

describe('resolveSpecAssets settings', () => {
  const base = {
    firstCue: 1,
    component: 'None',
    props: {},
    headline: [['X', 'X']],
  };
  it('library backdrop → backdropSrc', () => {
    const { spec, backgrounds } = resolveSpecAssets(
      { setting: { sky: 'day', ground: 'grass', horizon: 'none', weather: 'none', backdrop: 'stadium' }, scenes: [base] } as never,
      library,
    );
    assert.equal(spec.setting?.backdropSrc, 'emoji/stadium.svg');
    assert.deepEqual(backgrounds, []);
  });
  it('unknown backdrop becomes a background to generate', () => {
    const { spec, backgrounds } = resolveSpecAssets(
      { scenes: [{ ...base, setting: { sky: 'day', ground: 'none', horizon: 'none', weather: 'none', backdrop: 'eiffel tower' } }] } as never,
      library,
    );
    assert.equal(spec.scenes[0].setting?.backdropSrc, undefined);
    assert.equal(spec.scenes[0].setting?.background, 'eiffel tower');
    assert.deepEqual(backgrounds, ['eiffel tower']);
  });
  it('keeps an already generated background', () => {
    const { backgrounds } = resolveSpecAssets(
      { setting: { sky: 'day', ground: 'none', horizon: 'none', weather: 'none', background: 'roman forum', backgroundSrc: 'storage:assets/mg-bg-roman-forum.png' }, scenes: [base] } as never,
      library,
    );
    assert.deepEqual(backgrounds, []);
  });
});
