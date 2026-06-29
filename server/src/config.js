// 集中读取环境变量，做默认值与校验
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env 位于 server/ 根目录
dotenv.config({ path: path.join(__dirname, '..', '.env') });

export const config = {
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/yujian_lude',
  port: Number(process.env.PORT || 8090),
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret',
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 30),
  nodeEnv: process.env.NODE_ENV || 'development',
  cookieSecure: String(process.env.COOKIE_SECURE || 'false') === 'true',
};

export const isProd = config.nodeEnv === 'production';
