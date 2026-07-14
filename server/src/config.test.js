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
  assert.equal(config.publicAppUrl, 'http://localhost:5173');
  assert.equal(config.mail.enabled, false);
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
    SESSION_SECRET: 'change-this-to-a-long-random-string',
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

test('production requires a public app URL and SMTP delivery settings', () => {
  const config = buildConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://prod.example/yujian_lude',
    SESSION_SECRET: 'x'.repeat(32),
    COOKIE_SECURE: 'true',
  });

  assert.throws(() => validateConfig(config), /PUBLIC_APP_URL/);
  assert.throws(() => validateConfig({
    ...config,
    publicAppUrl: 'https://meet.example.com',
    publicAppUrlExplicit: true,
  }), /SMTP_HOST/);
});

test('production accepts explicit safe settings', () => {
  const config = buildConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://prod.example/yujian_lude',
    SESSION_SECRET: 'x'.repeat(32),
    COOKIE_SECURE: 'true',
    EXPOSE_DEV_TOKENS: 'false',
    PUBLIC_APP_URL: 'https://meet.example.com',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'mailer',
    SMTP_PASS: 'secret',
    SMTP_FROM: '遇见路得 <no-reply@example.com>',
  });

  assert.doesNotThrow(() => validateConfig(config));
  assert.equal(config.mail.enabled, true);
});
