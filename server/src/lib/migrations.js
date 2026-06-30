import crypto from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const MIGRATION_FILE_RE = /^(\d{4,})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const MIGRATION_LOCK_KEY = 871_406_251;

export function checksumSql(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex');
}

export function parseMigrationFile(fileName, sql) {
  const match = MIGRATION_FILE_RE.exec(fileName);
  if (!match) {
    throw new Error(`Invalid migration filename: ${fileName}`);
  }
  return {
    version: match[1],
    name: match[2],
    fileName,
    checksum: checksumSql(sql),
    sql,
  };
}

export function sortMigrations(migrations) {
  const sorted = [...migrations].sort((a, b) => {
    const left = BigInt(a.version);
    const right = BigInt(b.version);
    if (left === right) return a.fileName.localeCompare(b.fileName);
    return left < right ? -1 : 1;
  });
  const seen = new Set();
  for (const migration of sorted) {
    if (seen.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    seen.add(migration.version);
  }
  return sorted;
}

export function planMigrations(migrations, appliedRows = []) {
  const sorted = sortMigrations(migrations);
  const known = new Set(sorted.map((migration) => migration.version));
  const applied = new Map(appliedRows.map((row) => [String(row.version), row]));

  for (const version of applied.keys()) {
    if (!known.has(version)) {
      throw new Error(`Applied migration ${version} was not found in this codebase`);
    }
  }

  for (const migration of sorted) {
    const row = applied.get(migration.version);
    if (row && row.checksum !== migration.checksum) {
      throw new Error(`Migration ${migration.version} checksum changed after it was applied`);
    }
  }

  return sorted.filter((migration) => !applied.has(migration.version));
}

export async function loadMigrationFiles(migrationsDir) {
  let entries;
  try {
    entries = await readdir(migrationsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const migrations = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.sql')) continue;
    const sql = await readFile(join(migrationsDir, entry.name), 'utf8');
    migrations.push(parseMigrationFile(entry.name, sql));
  }
  return sortMigrations(migrations);
}

export async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function migrationsTableExists(client) {
  const { rows } = await client.query(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists"
  );
  return rows[0]?.exists === true;
}

export async function listAppliedMigrations(client) {
  if (!(await migrationsTableExists(client))) return [];
  const { rows } = await client.query(
    'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version'
  );
  return rows;
}

export async function applyMigration(client, migration) {
  await client.query('BEGIN');
  try {
    await client.query(migration.sql);
    await client.query(
      `INSERT INTO schema_migrations (version, name, checksum)
       VALUES ($1, $2, $3)`,
      [migration.version, migration.name, migration.checksum]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function takeMigrationLock(client) {
  const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [MIGRATION_LOCK_KEY]);
  if (rows[0]?.locked !== true) {
    throw new Error('Another migration process is already running');
  }
}

async function releaseMigrationLock(client) {
  await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
}

export async function runMigrations(pool, { migrationsDir, dryRun = false }) {
  const migrations = await loadMigrationFiles(migrationsDir);
  const client = await pool.connect();
  let locked = false;
  try {
    await takeMigrationLock(client);
    locked = true;
    if (!dryRun) {
      await ensureMigrationsTable(client);
    }
    const applied = await listAppliedMigrations(client);
    const pending = planMigrations(migrations, applied);

    if (!dryRun) {
      for (const migration of pending) {
        await applyMigration(client, migration);
      }
    }

    return {
      migrations,
      applied,
      pending,
      appliedCount: dryRun ? 0 : pending.length,
    };
  } finally {
    if (locked) await releaseMigrationLock(client);
    client.release();
  }
}
