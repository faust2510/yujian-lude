import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMailService, MailUnavailableError } from './mailer.js';

const authRoutesSource = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../routes/auth.routes.js'),
  'utf8',
);

const smtpConfig = {
  enabled: true,
  host: 'smtp.example.com',
  port: 465,
  secure: true,
  user: 'mailer',
  pass: 'secret',
  from: '遇见路得 <no-reply@example.com>',
};

function fakeTransport(sent, optionsSeen) {
  return (options) => {
    optionsSeen.push(options);
    return {
      async sendMail(message) {
        sent.push(message);
        return { messageId: 'test-message' };
      },
    };
  };
}

test('sends verification email through configured SMTP with an app link', async () => {
  const sent = [];
  const optionsSeen = [];
  const mail = createMailService({
    mailConfig: smtpConfig,
    publicAppUrl: 'https://meet.example.com',
    createTransport: fakeTransport(sent, optionsSeen),
  });

  await mail.sendVerificationEmail({ to: 'ruth@example.com', token: 'verify-token' });

  assert.deepEqual(optionsSeen, [{
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    auth: { user: 'mailer', pass: 'secret' },
  }]);
  assert.equal(sent[0].to, 'ruth@example.com');
  assert.equal(sent[0].from, smtpConfig.from);
  assert.match(sent[0].subject, /验证邮箱/);
  assert.match(sent[0].text, /https:\/\/meet\.example\.com\/app\/verify-email\?token=verify-token/);
  assert.match(sent[0].html, /verify-email\?token=verify-token/);
});

test('sends password reset email with a one-hour reset link', async () => {
  const sent = [];
  const mail = createMailService({
    mailConfig: { ...smtpConfig, user: '', pass: '' },
    publicAppUrl: 'https://meet.example.com/',
    createTransport: fakeTransport(sent, []),
  });

  await mail.sendPasswordResetEmail({ to: 'ruth@example.com', token: 'reset-token' });

  assert.match(sent[0].subject, /重置密码/);
  assert.match(sent[0].text, /https:\/\/meet\.example\.com\/app\/reset-password\?token=reset-token/);
  assert.match(sent[0].text, /1 小时/);
});

test('fails explicitly when email delivery is not configured', async () => {
  const mail = createMailService({
    mailConfig: { ...smtpConfig, enabled: false },
    publicAppUrl: 'http://localhost:5173',
    createTransport: () => assert.fail('transport should not be created'),
  });

  await assert.rejects(
    mail.sendVerificationEmail({ to: 'ruth@example.com', token: 'token' }),
    MailUnavailableError,
  );
});

test('account token routes deliver both production emails', () => {
  assert.match(authRoutesSource, /accountMail\.sendVerificationEmail/);
  assert.match(authRoutesSource, /accountMail\.sendPasswordResetEmail/);
  assert.match(authRoutesSource, /邮件服务未配置/);
  assert.doesNotMatch(authRoutesSource, /TODO 生产环境：发邮件/);
});
