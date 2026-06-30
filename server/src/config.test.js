import test from 'node:test';
import assert from 'node:assert/strict';

import { buildConfig, validateConfig } from './config.js';

test('builds development config with existing defaults', () => {
  const config = buildConfig({});

  assert.equal(config.databaseUrl, 'postgres://postgres:postgres@localhost:5432/yujian_lude');
  assert.equal(config.port, 8090);
  assert.equal(config.sessionSecret, 'dev-insecure-secret');
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.cookieSecure, false);
  assert.equal(config.exposeDevTokens, false);
});

test('production rejects implicit development database url', () => {
  const config = buildConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'x'.repeat(32),
    COOKIE_SECURE: 'true',
  });

  assert.throws(() => validateConfig(config), /DATABASE_URL/);
});

test('production rejects weak or default session secrets', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://prod.example/yujian_lude',
    COOKIE_SECURE: 'true',
  };

  assert.throws(() => validateConfig(buildConfig({
    ...base,
    SESSION_SECRET: 'dev-insecure-secret',
  })), /SESSION_SECRET/);
  assert.throws(() => validateConfig(buildConfig({
    ...base,
    SESSION_SECRET: 'too-short',
  })), /SESSION_SECRET/);
});

test('production requires secure cookies and disables dev tokens', () => {
  const base = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://prod.example/yujian_lude',
    SESSION_SECRET: 'x'.repeat(32),
  };

  assert.throws(() => validateConfig(buildConfig({
    ...base,
    COOKIE_SECURE: 'false',
  })), /COOKIE_SECURE/);
  assert.throws(() => validateConfig(buildConfig({
    ...base,
    COOKIE_SECURE: 'true',
    EXPOSE_DEV_TOKENS: 'true',
  })), /EXPOSE_DEV_TOKENS/);
});

test('production accepts explicit safe settings', () => {
  const config = buildConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://prod.example/yujian_lude',
    SESSION_SECRET: 'x'.repeat(32),
    COOKIE_SECURE: 'true',
    EXPOSE_DEV_TOKENS: 'false',
  });

  assert.doesNotThrow(() => validateConfig(config));
});
