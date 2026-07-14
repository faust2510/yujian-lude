// 集中读取环境变量，做默认值与校验
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env 位于 server/ 根目录
dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const DEV_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/yujian_lude';
export const DEV_SESSION_SECRET = 'dev-insecure-secret';
export const EXAMPLE_SESSION_SECRET = 'change-this-to-a-long-random-string';

export function buildConfig(env = process.env) {
  const smtpHost = String(env.SMTP_HOST || '').trim();
  const smtpFrom = String(env.SMTP_FROM || '').trim();
  return {
    databaseUrl: env.DATABASE_URL || DEV_DATABASE_URL,
    databaseUrlExplicit: !!env.DATABASE_URL,
    port: Number(env.PORT || 8090),
    sessionSecret: env.SESSION_SECRET || DEV_SESSION_SECRET,
    sessionSecretExplicit: !!env.SESSION_SECRET,
    sessionTtlDays: Number(env.SESSION_TTL_DAYS || 30),
    nodeEnv: env.NODE_ENV || 'development',
    cookieSecure: String(env.COOKIE_SECURE || 'false') === 'true',
    exposeDevTokens: String(env.EXPOSE_DEV_TOKENS || 'false') === 'true',
    publicAppUrl: String(env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
    publicAppUrlExplicit: !!env.PUBLIC_APP_URL,
    mail: {
      enabled: Boolean(smtpHost && smtpFrom),
      host: smtpHost,
      port: Number(env.SMTP_PORT || 587),
      secure: String(env.SMTP_SECURE || 'false') === 'true',
      user: String(env.SMTP_USER || '').trim(),
      pass: String(env.SMTP_PASS || ''),
      from: smtpFrom,
    },
  };
}

export function validateConfig(value) {
  const errors = [];
  if (value.nodeEnv === 'production') {
    if (!value.databaseUrlExplicit || value.databaseUrl === DEV_DATABASE_URL) {
      errors.push('DATABASE_URL must be set explicitly for production');
    }
    if (
      !value.sessionSecretExplicit ||
      value.sessionSecret === DEV_SESSION_SECRET ||
      value.sessionSecret === EXAMPLE_SESSION_SECRET ||
      String(value.sessionSecret).length < 32
    ) {
      errors.push('SESSION_SECRET must be at least 32 characters for production');
    }
    if (!value.cookieSecure) {
      errors.push('COOKIE_SECURE must be true for production');
    }
    if (value.exposeDevTokens) {
      errors.push('EXPOSE_DEV_TOKENS must be false for production');
    }
    if (!value.publicAppUrlExplicit || !String(value.publicAppUrl || '').startsWith('https://')) {
      errors.push('PUBLIC_APP_URL must be an explicit https URL for production');
    }
    if (!value.mail?.host) {
      errors.push('SMTP_HOST must be set for production');
    }
    if (!value.mail?.from) {
      errors.push('SMTP_FROM must be set for production');
    }
  }
  if (!Number.isInteger(value.mail?.port) || value.mail.port < 1 || value.mail.port > 65535) {
    errors.push('SMTP_PORT must be an integer between 1 and 65535');
  }
  if (Boolean(value.mail?.user) !== Boolean(value.mail?.pass)) {
    errors.push('SMTP_USER and SMTP_PASS must be set together');
  }
  if (errors.length) {
    throw new Error(`Invalid server configuration: ${errors.join('; ')}`);
  }
  return value;
}

export const config = validateConfig(buildConfig());

export const isProd = config.nodeEnv === 'production';
export const canExposeDevTokens = !isProd && config.exposeDevTokens;
