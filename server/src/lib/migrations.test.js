import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  checksumSql,
  parseMigrationFile,
  planMigrations,
  runMigrations,
  sortMigrations,
} from './migrations.js';

test('parses migration filenames and calculates stable checksums', () => {
  const migration = parseMigrationFile('0002_add_profile_flag.sql', 'SELECT 1;\n');

  assert.equal(migration.version, '0002');
  assert.equal(migration.name, 'add_profile_flag');
  assert.equal(migration.fileName, '0002_add_profile_flag.sql');
  assert.equal(migration.checksum, checksumSql('SELECT 1;\n'));
  assert.match(migration.checksum, /^[a-f0-9]{64}$/);
});

test('rejects invalid migration filenames', () => {
  assert.throws(
    () => parseMigrationFile('add_profile_flag.sql', 'SELECT 1;'),
    /Invalid migration filename/
  );
});

test('sorts migrations by version and rejects duplicate versions', () => {
  const first = parseMigrationFile('0001_base.sql', 'SELECT 1;');
  const second = parseMigrationFile('0002_next.sql', 'SELECT 2;');
  const farFuture = parseMigrationFile('10000_far_future.sql', 'SELECT 10;');

  assert.deepEqual(
    sortMigrations([farFuture, second, first]).map((item) => item.version),
    ['0001', '0002', '10000']
  );
  assert.throws(
    () => sortMigrations([first, parseMigrationFile('0001_other.sql', 'SELECT 3;')]),
    /Duplicate migration version/
  );
});

test('plans only unapplied migrations', () => {
  const first = parseMigrationFile('0001_base.sql', 'SELECT 1;');
  const second = parseMigrationFile('0002_next.sql', 'SELECT 2;');

  const pending = planMigrations([first, second], [
    { version: first.version, checksum: first.checksum },
  ]);

  assert.deepEqual(pending.map((item) => item.version), ['0002']);
});

test('rejects applied migrations whose checksum changed', () => {
  const migration = parseMigrationFile('0001_base.sql', 'SELECT 1;');

  assert.throws(
    () => planMigrations([migration], [{ version: '0001', checksum: checksumSql('SELECT 2;') }]),
    /checksum changed/
  );
});

test('rejects applied migrations missing from the codebase', () => {
  const migration = parseMigrationFile('0001_base.sql', 'SELECT 1;');

  assert.throws(
    () => planMigrations([migration], [
      { version: '0001', checksum: migration.checksum },
      { version: '0002', checksum: checksumSql('SELECT 2;') },
    ]),
    /not found in this codebase/
  );
});

test('runs pending migrations in transactions and records them', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yl-migrations-'));
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
      if (sql.includes('to_regclass')) return { rows: [{ exists: true }] };
      if (sql.includes('FROM schema_migrations')) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client };

  try {
    await writeFile(join(dir, '0001_base.sql'), 'SELECT 1;\n');
    await writeFile(join(dir, '0002_next.sql'), 'SELECT 2;\n');

    const result = await runMigrations(pool, { migrationsDir: dir });

    assert.equal(result.appliedCount, 2);
    assert.equal(queries.filter((item) => item.sql === 'BEGIN').length, 2);
    assert.equal(queries.filter((item) => item.sql === 'COMMIT').length, 2);
    assert.equal(queries.filter((item) => item.sql.includes('INSERT INTO schema_migrations')).length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('takes and releases an advisory lock around migration runs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yl-migrations-'));
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
      if (sql.includes('to_regclass')) return { rows: [{ exists: true }] };
      if (sql.includes('FROM schema_migrations')) return { rows: [] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client };

  try {
    await writeFile(join(dir, '0001_base.sql'), 'SELECT 1;\n');

    await runMigrations(pool, { migrationsDir: dir });

    assert(queries[0].sql.includes('pg_try_advisory_lock'));
    assert(queries.some((item) => item.sql.includes('pg_advisory_unlock')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dry-run does not create the migrations table or apply SQL', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yl-migrations-'));
  const queries = [];
  const client = {
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
      if (sql.includes('to_regclass')) return { rows: [{ exists: false }] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client };

  try {
    await writeFile(join(dir, '0001_base.sql'), 'SELECT 1;\n');

    const result = await runMigrations(pool, { migrationsDir: dir, dryRun: true });

    assert.equal(result.appliedCount, 0);
    assert.deepEqual(result.pending.map((item) => item.version), ['0001']);
    assert.equal(queries.some((item) => item.sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')), false);
    assert.equal(queries.some((item) => item.sql === 'SELECT 1;\n'), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
