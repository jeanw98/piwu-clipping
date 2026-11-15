import { strict as assert } from 'node:assert';
import { join } from 'node:path';
import { describe, it } from 'node:test';
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
