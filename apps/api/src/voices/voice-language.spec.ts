import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { voiceMatchesLanguage } from '@piwu/shared';

describe('voiceMatchesLanguage', () => {
  it('separates Latin-American from Castilian Spanish', () => {
    assert.equal(voiceMatchesLanguage('es-LA', { language: 'es', accent: 'mexican' }), true);
    assert.equal(voiceMatchesLanguage('es-LA', { language: 'es', accent: 'latin american' }), true);
    assert.equal(voiceMatchesLanguage('es-LA', { language: 'es', locale: 'es-AR' }), true);
    assert.equal(voiceMatchesLanguage('es-LA', { language: 'es', accent: 'peninsular' }), false);
    assert.equal(voiceMatchesLanguage('es-LA', { locale: 'es-ES' }), false);
    assert.equal(voiceMatchesLanguage('es-ES', { language: 'es', accent: 'castilian' }), true);
    assert.equal(voiceMatchesLanguage('es-ES', { language: 'es', accent: 'mexican' }), false);
  });

  it('rejects voices of another language or with no info (accented reads)', () => {
    assert.equal(voiceMatchesLanguage('es-LA', { language: 'en', accent: 'american' }), false);
    assert.equal(voiceMatchesLanguage('es-LA', {}), false);
    assert.equal(voiceMatchesLanguage('es-LA', { language: 'es' }), false);
  });

  it('handles English and Portuguese variants', () => {
    assert.equal(voiceMatchesLanguage('en-US', { language: 'en', accent: 'american' }), true);
    assert.equal(voiceMatchesLanguage('en-US', { language: 'en', accent: 'british' }), false);
    assert.equal(voiceMatchesLanguage('en-GB', { language: 'en', locale: 'en-GB' }), true);
    assert.equal(voiceMatchesLanguage('pt-BR', { language: 'pt', accent: 'brazilian' }), true);
    assert.equal(voiceMatchesLanguage('pt-BR', { language: 'pt', locale: 'pt-PT' }), false);
    assert.equal(voiceMatchesLanguage('it-IT', { language: 'it' }), true);
  });
});
