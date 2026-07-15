import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'verify-release.js'),
  'utf8',
);
const realUsersSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'verify-real-users-flow.js'),
  'utf8',
);

let authEmailAcceptance = {};
let authEmailAcceptanceLoadError = null;
try {
  authEmailAcceptance = await import('./auth-email-acceptance.js');
} catch (error) {
  authEmailAcceptanceLoadError = error;
}

function smtpMessage({ to, path: linkPath, token }) {
  return [
    'From: no-reply@release.example.test',
    `To: ${to}`,
    'Subject: account email',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    `Open https://release.example.test${linkPath}?token=3D${token}`,
  ].join('\r\n');
}

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('release verification supplies every production-only mail setting', () => {
  assert.match(source, /PUBLIC_APP_URL:\s*'https:\/\//);
  assert.match(source, /SMTP_HOST:/);
  assert.match(source, /SMTP_PORT:/);
  assert.match(source, /SMTP_FROM:/);
  assert.match(source, /startSmtpSink/);
  assert.match(source, /smtpMessages/);
  assert.match(source, /TEST_DATABASE_URL/);
});

test('extracts verification and reset links from quoted-printable SMTP bodies', () => {
  assert.ifError(authEmailAcceptanceLoadError);
  const { extractAccountLink } = authEmailAcceptance;
  assert.equal(typeof extractAccountLink, 'function');

  const verifyLink = extractAccountLink(smtpMessage({
    to: 'release@example.test',
    path: '/app/verify-email',
    token: 'verify-token',
  }), '/app/verify-email');
  const resetLink = extractAccountLink(smtpMessage({
    to: 'release@example.test',
    path: '/app/reset-password',
    token: 'reset-token',
  }), '/app/reset-password');

  assert.equal(verifyLink.toString(), 'https://release.example.test/app/verify-email?token=verify-token');
  assert.equal(resetLink.toString(), 'https://release.example.test/app/reset-password?token=reset-token');
});

test('consumes tokens parsed from real auth emails once and rejects replay', async () => {
  assert.ifError(authEmailAcceptanceLoadError);
  const { verifyAuthEmailTokenFlow } = authEmailAcceptance;
  assert.equal(typeof verifyAuthEmailTokenFlow, 'function');

  const smtpMessages = [];
  const requests = [];
  let verifyAttempts = 0;
  let resetAttempts = 0;
  let verifyInFlight = 0;
  let resetInFlight = 0;
  let verificationOverlapObserved = false;
  let resetOverlapObserved = false;
  const email = 'release@example.test';
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ path: `${parsed.pathname}${parsed.search}`, method: options.method || 'GET', body, headers: options.headers });

    if (parsed.pathname.endsWith('/auth/register')) {
      return jsonResponse(201, { user: { id: 1, email } }, { 'set-cookie': 'session=test-session; Path=/; HttpOnly' });
    }
    if (parsed.pathname.endsWith('/auth/send-verify')) {
      assert.equal(options.headers.Cookie, 'session=test-session');
      smtpMessages.push(smtpMessage({ to: `wrong-${email}`, path: '/app/verify-email', token: 'wrong-recipient-token' }));
      smtpMessages.push(smtpMessage({ to: email, path: '/app/verify-email', token: 'verify-from-email' }));
      return jsonResponse(200, { ok: true });
    }
    if (parsed.pathname.endsWith('/auth/verify')) {
      assert.equal(parsed.searchParams.get('token'), 'verify-from-email');
      verifyAttempts += 1;
      const attempt = verifyAttempts;
      verifyInFlight += 1;
      verificationOverlapObserved ||= verifyInFlight > 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      verifyInFlight -= 1;
      return jsonResponse(attempt === 1 ? 200 : 400, attempt === 1 ? { ok: true } : { error: 'token invalid' });
    }
    if (parsed.pathname.endsWith('/auth/forgot-password')) {
      smtpMessages.push(smtpMessage({ to: `wrong-${email}`, path: '/app/reset-password', token: 'wrong-recipient-token' }));
      smtpMessages.push(smtpMessage({ to: email, path: '/app/reset-password', token: 'reset-from-email' }));
      return jsonResponse(200, { ok: true });
    }
    if (parsed.pathname.endsWith('/auth/reset-password')) {
      assert.equal(body.token, 'reset-from-email');
      resetAttempts += 1;
      const attempt = resetAttempts;
      resetInFlight += 1;
      resetOverlapObserved ||= resetInFlight > 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      resetInFlight -= 1;
      return jsonResponse(attempt === 1 ? 200 : 400, attempt === 1 ? { ok: true } : { error: 'reset link invalid' });
    }
    return jsonResponse(404, { error: 'unexpected request' });
  };

  const result = await verifyAuthEmailTokenFlow({
    apiBase: 'http://127.0.0.1:8092/api',
    smtpMessages,
    fetchImpl,
    email,
    password: 'Passw0rd!2026',
    newPassword: 'NewPassw0rd!2026',
  });

  assert.deepEqual(result, { verificationReplayRejected: true, resetReplayRejected: true });
  assert.equal(verifyAttempts, 2);
  assert.equal(resetAttempts, 2);
  assert.equal(verificationOverlapObserved, true);
  assert.equal(resetOverlapObserved, true);
  assert.equal(requests.some(({ body }) => body?.token === 'reset-from-email'), true);
});

test('production real-user verification does not mint a reset token through the database', () => {
  assert.doesNotMatch(realUsersSource, /createPasswordResetToken/);
  assert.doesNotMatch(realUsersSource, /createPublicToken|hashToken/);
  assert.match(source, /verifyAuthEmailTokenFlow/);
});
