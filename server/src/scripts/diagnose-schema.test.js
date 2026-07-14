import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hasUniqueIndex } from './diagnose-schema.js';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(__dirname, 'diagnose-schema.js'), 'utf8');
const serverRoot = path.resolve(__dirname, '../..');
const schemaPath = path.resolve(__dirname, '../../db/schema.sql');
const seedPath = path.resolve(__dirname, '../../db/seed.sql');
const pastorCertificationMigrationPath = path.resolve(
  __dirname,
  '../../db/migrations/0016_harden_pastor_certifications.sql'
);

function connectionUrlWithDatabase(databaseUrl, databaseName) {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function runSchemaDiagnosis(databaseUrl) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'diagnose-schema.js')], {
      cwd: serverRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve({
      code,
      signal,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
  });
}

function diagnosisDetails(result) {
  return `${result.stdout}\n${result.stderr}`.trim();
}

function catalogWithRows(rows) {
  return {
    async query() {
      return { rows };
    },
  };
}

test('schema diagnosis checks community post state enum values used by feeds', () => {
  assert.match(source, /\['post_state', \['visible', 'pinned', 'removed', 'featured'\]\]/);
});

test('schema diagnosis checks community group columns used by group creation', () => {
  assert.match(source, /\['community_groups', \['id', 'name', 'category', 'join_policy', 'cover_image', 'created_by'\]\]/);
});

test('schema diagnosis checks course exam attempts used by relationship gates', () => {
  assert.match(source, /'course_exam_attempts'/);
  assert.match(source, /\['course_exam_attempts', \['user_id', 'course_id', 'score', 'passed', 'answers'\]\]/);
});

test('schema diagnosis checks course pastor review workflow', () => {
  assert.match(source, /'course_pastor_reviews'/);
  assert.match(source, /\['course_pastor_reviews', \['user_id', 'course_id', 'endorsement_id', 'assigned_reviewer_id', 'state', 'reviewed_by', 'reviewed_at'\]\]/);
  assert.match(source, /\['endorsements', \['user_id', 'endorser_user_id', 'kind', 'state', 'verified_at'\]\]/);
});

test('unique index diagnosis fails when no candidate index exists', async () => {
  const found = await hasUniqueIndex(
    catalogWithRows([]),
    'pastor_certifications',
    ['user_id'],
    "state = 'pending'"
  );

  assert.equal(found, false);
});

test('unique index diagnosis rejects a candidate containing expression keys', async () => {
  const found = await hasUniqueIndex(
    catalogWithRows([{
      columns: ['user_id'],
      predicate: "(state = 'pending'::pastor_cert_state)",
      has_expressions: true,
    }]),
    'pastor_certifications',
    ['user_id'],
    "state = 'pending'"
  );

  assert.equal(found, false);
});

test('unique index diagnosis accepts the correct partial unique key', async () => {
  const found = await hasUniqueIndex(
    catalogWithRows([{
      columns: ['user_id'],
      predicate: "(state = 'pending'::pastor_cert_state)",
      has_expressions: false,
    }]),
    'pastor_certifications',
    ['user_id'],
    "state = 'pending'"
  );

  assert.equal(found, true);
});

test('PostgreSQL diagnosis and migration enforce one pending pastor certification', {
  skip: !process.env.TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `codex_pastor_index_${process.pid}_${randomUUID().replace(/-/g, '')}`;
  const maintenanceUrl = connectionUrlWithDatabase(process.env.TEST_DATABASE_URL, 'postgres');
  const databaseUrl = connectionUrlWithDatabase(process.env.TEST_DATABASE_URL, databaseName);
  const adminPool = new Pool({ connectionString: maintenanceUrl });
  let databaseCreated = false;
  let databasePool;

  try {
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    databaseCreated = true;
    databasePool = new Pool({ connectionString: databaseUrl });
    await databasePool.query(readFileSync(schemaPath, 'utf8'));
    await databasePool.query(readFileSync(seedPath, 'utf8'));

    await databasePool.query('DROP INDEX idx_pastor_certifications_one_pending');
    const withoutIndex = await runSchemaDiagnosis(databaseUrl);

    await databasePool.query(
      `CREATE UNIQUE INDEX idx_pastor_certifications_wrong_expression
         ON pastor_certifications(user_id, lower(church_name))
         WHERE state = 'pending'`
    );
    const withExpressionIndex = await runSchemaDiagnosis(databaseUrl);
    await databasePool.query('DROP INDEX idx_pastor_certifications_wrong_expression');

    await databasePool.query(
      `CREATE UNIQUE INDEX idx_pastor_certifications_with_include
         ON pastor_certifications(user_id)
         INCLUDE (church_name)
         WHERE state = 'pending'`
    );
    const withIncludeIndex = await runSchemaDiagnosis(databaseUrl);
    await databasePool.query('DROP INDEX idx_pastor_certifications_with_include');

    await databasePool.query(
      `CREATE UNIQUE INDEX idx_pastor_certifications_one_pending
         ON pastor_certifications(user_id)
         WHERE state = 'pending'`
    );
    const withCorrectIndex = await runSchemaDiagnosis(databaseUrl);
    await databasePool.query('DROP INDEX idx_pastor_certifications_one_pending');

    const firstUserId = 'aaaaaaaa-0000-0000-0000-000000000001';
    const secondUserId = 'bbbbbbbb-0000-0000-0000-000000000001';
    await databasePool.query(
      `INSERT INTO users (id, email, password_hash)
       VALUES ($1, 'pastor-index-a@example.com', 'test'),
              ($2, 'pastor-index-b@example.com', 'test')`,
      [firstUserId, secondUserId]
    );
    await databasePool.query(
      `INSERT INTO pastor_certifications
         (id, user_id, church_name, contact_email, state, created_at)
       VALUES
         ('10000000-0000-0000-0000-000000000001', $1, 'A', 'a1@example.com', 'pending', '2026-01-01T00:00:00Z'),
         ('10000000-0000-0000-0000-000000000002', $1, 'A', 'a2@example.com', 'pending', '2026-01-02T00:00:00Z'),
         ('20000000-0000-0000-0000-000000000001', $2, 'B', 'b1@example.com', 'pending', '2026-01-03T00:00:00Z'),
         ('20000000-0000-0000-0000-000000000002', $2, 'B', 'b2@example.com', 'pending', '2026-01-03T00:00:00Z')`,
      [firstUserId, secondUserId]
    );

    const migrationClient = await databasePool.connect();
    try {
      await migrationClient.query('BEGIN');
      await migrationClient.query(readFileSync(pastorCertificationMigrationPath, 'utf8'));
      await migrationClient.query('COMMIT');
    } catch (err) {
      await migrationClient.query('ROLLBACK');
      throw err;
    } finally {
      migrationClient.release();
    }

    const migrated = await databasePool.query(
      `SELECT id::text, state::text
         FROM pastor_certifications
        ORDER BY id`
    );
    assert.deepEqual(migrated.rows, [
      { id: '10000000-0000-0000-0000-000000000001', state: 'rejected' },
      { id: '10000000-0000-0000-0000-000000000002', state: 'pending' },
      { id: '20000000-0000-0000-0000-000000000001', state: 'rejected' },
      { id: '20000000-0000-0000-0000-000000000002', state: 'pending' },
    ]);

    const routeConflict = await databasePool.query(
      `INSERT INTO pastor_certifications
         (user_id, church_name, contact_email, state)
       VALUES ($1, 'A', 'route-conflict@example.com', 'pending')
       ON CONFLICT (user_id) WHERE state = 'pending' DO NOTHING
       RETURNING id`,
      [firstUserId]
    );
    assert.equal(routeConflict.rowCount, 0);

    await assert.rejects(
      databasePool.query(
        `INSERT INTO pastor_certifications
           (user_id, church_name, contact_email, state)
         VALUES ($1, 'A', 'duplicate@example.com', 'pending')`,
        [firstUserId]
      ),
      (err) => err.code === '23505'
    );

    assert.equal(withoutIndex.code, 1, diagnosisDetails(withoutIndex));
    assert.equal(withExpressionIndex.code, 1, diagnosisDetails(withExpressionIndex));
    assert.equal(withIncludeIndex.code, 0, diagnosisDetails(withIncludeIndex));
    assert.equal(withCorrectIndex.code, 0, diagnosisDetails(withCorrectIndex));
  } finally {
    if (databasePool) await databasePool.end();
    if (databaseCreated) {
      await adminPool.query(
        `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
          WHERE datname = $1
            AND pid <> pg_backend_pid()`,
        [databaseName]
      );
      await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    }
    await adminPool.end();
  }
});

test('schema diagnosis checks relationship review provenance', () => {
  assert.match(source, /'pastor_a_approved_by'/);
  assert.match(source, /'pastor_b_approved_by'/);
  assert.match(source, /'pastor_a_endorsement_id'/);
  assert.match(source, /'pastor_b_endorsement_id'/);
  assert.match(source, /'pastor_a_approved_at'/);
  assert.match(source, /'pastor_b_approved_at'/);
});

test('schema diagnosis checks VIP subscription operations', () => {
  assert.match(source, /\['vip_subscription_state', \['pending', 'approved', 'rejected', 'cancelled'\]\]/);
  assert.match(source, /'vip_subscription_requests'/);
  assert.match(source, /\['vip_subscription_requests', \['user_id', 'tier', 'plan_snapshot', 'amount_minor', 'currency', 'duration_days', 'payment_reference', 'payment_confirmation_reference', 'state', 'reviewed_by', 'activated_until'\]\]/);
  assert.match(source, /\['vip_subscription_requests', \['user_id'\], "state = 'pending'"\]/);
  assert.match(source, /\['vip_subscription_requests', \['payment_confirmation_reference'\]\]/);
  assert.match(source, /pg_get_expr\(i\.indpred, i\.indrelid\)/);
  assert.match(source, /i\.indisvalid = TRUE/);
  assert.match(source, /i\.indisready = TRUE/);
  assert.match(source, /\['relationships', \['user_a', 'user_b'\], "state <> 'ended'"\]/);
  assert.match(source, /\['course_pastor_reviews', \['user_id', 'course_id'\], "state = 'pending'"\]/);
});

test('schema diagnosis checks textbook reading system tables and constraints', () => {
  for (const table of ['textbooks', 'textbook_chapters', 'textbook_reading_progress', 'course_unit_readings']) {
    assert.match(source, new RegExp(`'${table}'`));
  }

  assert.match(source, /\['textbooks', \['slug', 'title', 'visibility', 'source_filename', 'license_note'\]\]/);
  assert.match(source, /\['textbook_chapters', \['textbook_id', 'chapter_index', 'title', 'body_html', 'body_text', 'word_count'\]\]/);
  assert.match(source, /\['textbook_reading_progress', \['user_id', 'chapter_id', 'completed', 'completed_at', 'last_read_at'\]\]/);
  assert.match(source, /\['course_unit_readings', \['course_unit_id', 'chapter_id', 'required', 'sort_order'\]\]/);
  assert.match(source, /\['textbook_chapters', \['textbook_id', 'chapter_index'\]\]/);
  assert.match(source, /\['textbook_reading_progress', \['user_id', 'chapter_id'\]\]/);
  assert.match(source, /\['course_unit_readings', \['course_unit_id', 'chapter_id'\]\]/);
});
