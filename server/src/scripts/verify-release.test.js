import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'verify-release.js'),
  'utf8',
);

test('release verification supplies every production-only mail setting', () => {
  assert.match(source, /PUBLIC_APP_URL:\s*'https:\/\//);
  assert.match(source, /SMTP_HOST:/);
  assert.match(source, /SMTP_PORT:/);
  assert.match(source, /SMTP_FROM:/);
  assert.match(source, /startSmtpSink/);
  assert.match(source, /smtpMessages/);
});
