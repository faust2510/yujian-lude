// 数据库连接池 — 全应用共用一个 pg.Pool
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  // 生产环境若数据库要求 SSL，可在 DATABASE_URL 末尾加 ?sslmode=require
  // 或在此设置 ssl: { rejectUnauthorized: false }
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[db] 连接池意外错误：', err.message);
});

// 简单查询封装
export async function query(text, params) {
  return pool.query(text, params);
}

// 取单行（无则返回 null）
export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

// 事务封装：cb 接收一个 client，自动 BEGIN/COMMIT/ROLLBACK
export async function tx(cb) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await cb(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
