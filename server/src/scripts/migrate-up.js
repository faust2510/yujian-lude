// Versioned incremental migrations. Keeps schema.sql as fresh install baseline.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';
import { runMigrations } from '../lib/migrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', '..', 'db', 'migrations');
const dryRun = process.argv.includes('--dry-run');

async function run() {
  console.log(`[migrate:up] 检查增量迁移${dryRun ? '（dry-run）' : ''} ...`);
  const result = await runMigrations(pool, { migrationsDir, dryRun });

  if (result.pending.length === 0) {
    console.log('[migrate:up] 没有待执行迁移');
    return;
  }

  for (const migration of result.pending) {
    console.log(`[migrate:up] ${dryRun ? '待执行' : '已执行'} ${migration.version}_${migration.name}`);
  }

  if (dryRun) {
    console.log(`[migrate:up] dry-run 完成：${result.pending.length} 个待执行迁移`);
  } else {
    console.log(`[migrate:up] 完成：已执行 ${result.appliedCount} 个迁移`);
  }
}

run()
  .catch((err) => {
    console.error('[migrate:up] 失败：', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
