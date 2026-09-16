import assert from 'node:assert/strict';
import test from 'node:test';
import { findObsoleteAuthCookieNames } from './obsoleteAuthCookies.js';

test('finds optional Better Auth cache cookies without touching the session token', () => {
  const names = findObsoleteAuthCookieNames([
    '__Secure-gav.session_token=keep-this',
    '__Secure-gav.session_data=remove-this',
    '__Secure-gav.session_data.0=remove-chunk',
    'theme=pink',
  ].join('; '));

  assert.deepEqual(names, [
    '__Secure-gav.session_data',
    '__Secure-gav.session_data.0',
  ]);
});

test('also cleans obsolete non-secure development cookies', () => {
  const names = findObsoleteAuthCookieNames(
    'gav.account_data=old; gav.dont_remember=old; gav.session_token=keep',
  );

  assert.deepEqual(names, ['gav.account_data', 'gav.dont_remember']);
});

test('returns an empty list when no obsolete cookie is present', () => {
  assert.deepEqual(findObsoleteAuthCookieNames(undefined), []);
  assert.deepEqual(findObsoleteAuthCookieNames('__Secure-gav.session_token=keep'), []);
});
