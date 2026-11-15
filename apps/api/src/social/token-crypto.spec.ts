import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { decryptToken, encryptToken, parseTokenKey } from './token-crypto';

describe('token-crypto', () => {
  const key = randomBytes(32);
  it('round-trips and never stores plaintext', () => {
    const sealed = encryptToken('ya29.secret-token', key);
    assert.ok(!sealed.includes('secret'));
    assert.equal(decryptToken(sealed, key), 'ya29.secret-token');
  });
  it('rejects tampering and wrong keys', () => {
    const sealed = encryptToken('abc', key);
    assert.throws(() => decryptToken(sealed, randomBytes(32)));
    const parts = sealed.split('.');
    parts[3] = Buffer.from('zzz').toString('base64url');
    assert.throws(() => decryptToken(parts.join('.'), key));
  });
  it('accepts base64 or hex 32-byte keys only', () => {
    assert.equal(parseTokenKey(key.toString('base64'))?.length, 32);
    assert.equal(parseTokenKey(key.toString('hex'))?.length, 32);
    assert.equal(parseTokenKey('short'), null);
    assert.equal(parseTokenKey(''), null);
  });
});

import { isAuthError } from './publish.processor';
describe('isAuthError', () => {
  it('detects auth failures that should not be retried', () => {
    assert.ok(isAuthError('YouTube upload init 401: Request had invalid authentication credentials'));
    assert.ok(isAuthError('Google refresh 400: invalid_grant'));
    assert.ok(isAuthError('TikTok creator info: access_token_invalid'));
    assert.ok(!isAuthError('YouTube upload init 403: quotaExceeded'));
    assert.ok(!isAuthError('Instagram tardó demasiado en procesar el video'));
  });
});
