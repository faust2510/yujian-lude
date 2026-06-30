// 集中读取环境变量，做默认值与校验
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env 位于 server/ 根目录
dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const DEV_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/yujian_lude';
export const DEV_SESSION_SECRET = 'dev-insecure-secret';

export function buildConfig(env = process.env) {
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
  }
  if (errors.length) {
    throw new Error(`Invalid server configuration: ${errors.join('; ')}`);
  }
  return value;
}

export const config = validateConfig(buildConfig());

export const isProd = config.nodeEnv === 'production';
export const canExposeDevTokens = !isProd && config.exposeDevTokens;
