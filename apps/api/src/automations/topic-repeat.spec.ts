import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRepeatedTopic } from './topic-repeat';

describe('isRepeatedTopic', () => {
  const recent = [
    'Beber agua del océano: por qué te deshidrata en vez de hidratarte',
    'What if you stretched out all the DNA in your body',
    'Bucear en el océano oculto de Europa, la luna de Júpiter',
  ];

  it('flags the same subject reworded', () => {
    assert.ok(isRepeatedTopic('¿Qué pasaría si bebieras agua del océano? Te deshidratarías', recent));
    assert.ok(isRepeatedTopic('Stretching all your body DNA end to end', recent));
  });

  it('lets different subjects through', () => {
    assert.equal(isRepeatedTopic('Un día en Venus: lluvia de ácido sulfúrico', recent), null);
    assert.equal(isRepeatedTopic('What if the Moon disappeared tonight', recent), null);
  });

  it('ignores topics too short to compare', () => {
    assert.equal(isRepeatedTopic('Océano', recent), null);
  });
});
