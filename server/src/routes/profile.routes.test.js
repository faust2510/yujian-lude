import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import express from 'express';

import { pool } from '../db.js';
import profileRoutes from './profile.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(__dirname, 'profile.routes.js'), 'utf8');

test('endorsement creation response includes church for immediate UI display', () => {
  assert.match(
    source,
    /RETURNING\s+id,\s*kind,\s*name,\s*church,\s*state/i
  );
});

test('saving either profile section recomputes and returns exposure', () => {
  assert.equal((source.match(/return recomputeExposure\(db, uid\)/g) || []).length, 2);
  assert.match(source, /res\.json\(\{ ok: true, completion, exposure \}\)/);
  assert.match(source, /res\.json\(\{ ok: true, exposure \}\)/);
});

test('profile save normalizes the complete birth date, derives birth year, and returns validation errors as 400', () => {
  assert.match(source, /normalizeBirthDate\(birth_date\)/);
  assert.match(source, /birth_date:\s*normalizedBirthDate/);
  assert.match(source, /const normalizedBirthYear = normalizedBirthDate \? Number\(normalizedBirthDate\.slice\(0, 4\)\) : null/);
  assert.match(source, /birth_year:\s*normalizedBirthYear/);
  assert.match(source, /err instanceof ProfileInputError/);
  assert.match(source, /res\.status\(400\)\.json\(\{ error: err\.message \}\)/);
});

test('endorsement ids are validated before database queries', () => {
  assert.match(source, /router\.param\('id',\s*validateUuidParam\)/);
});

test('profile privacy consent accepts booleans only', async () => {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  let databaseTouched = false;
  pool.query = async () => {
    databaseTouched = true;
    return { rows: [] };
  };
  pool.connect = async () => {
    databaseTouched = true;
    throw new Error('database must not be touched for invalid privacy consent');
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: '11111111-1111-4111-8111-111111111111', role: 'free' };
    next();
  });
  app.use(profileRoutes);
  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ error: error.message });
  });
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/me/profile`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ privacy_ok: 'false' }),
    });
    assert.equal(response.status, 400);
    assert.equal(databaseTouched, false);
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
