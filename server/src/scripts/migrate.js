// Fresh 初始化脚本：对 DATABASE_URL 执行 schema.sql 和 seed.sql。
// 用法：
//   npm run migrate --prefix server  # fresh DB schema + seed
//   npm run seed --prefix server     # 只执行 seed.sql
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..', '..', 'db');
const seedOnly = process.argv.includes('--seed') || process.argv.includes('--seed-only');

async function run() {
  const schema = await readFile(join(dbDir, 'schema.sql'), 'utf8');
  const seed = await readFile(join(dbDir, 'seed.sql'), 'utf8');

  const client = await pool.connect();
  try {
    if (!seedOnly) {
      console.log('[migrate] 执行 schema.sql ...');
      await client.query(schema);
    }
    console.log('[migrate] 执行 seed.sql ...');
    await client.query(seed);
    console.log('[migrate] 完成 ✓');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[migrate] 失败：', err);
  process.exit(1);
});
