import test from 'node:test';
import assert from 'node:assert/strict';

import { isCertifiedPastor } from './certified-pastor.js';

const activePastor = {
  email_verified: true,
  is_banned: false,
  role: 'pastor',
};

test('recognizes only an active verified pastor with an approved certification', () => {
  assert.equal(isCertifiedPastor(activePastor, { state: 'approved' }), true);
});

test('rejects unverified, banned, or non-pastor users', () => {
  assert.equal(isCertifiedPastor({ ...activePastor, email_verified: false }, { state: 'approved' }), false);
  assert.equal(isCertifiedPastor({ ...activePastor, is_banned: true }, { state: 'approved' }), false);
  assert.equal(isCertifiedPastor({ ...activePastor, role: 'member' }, { state: 'approved' }), false);
});

test('rejects users without an approved certification', () => {
  assert.equal(isCertifiedPastor(activePastor, null), false);
  assert.equal(isCertifiedPastor(activePastor, { state: 'pending' }), false);
  assert.equal(isCertifiedPastor(activePastor, { state: 'rejected' }), false);
});

test('accepts certification collections when any application is approved', () => {
  assert.equal(
    isCertifiedPastor(activePastor, [{ state: 'rejected' }, { state: 'approved' }]),
    true
  );
});
