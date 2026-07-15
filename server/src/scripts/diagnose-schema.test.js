import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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
const pastorLetterMigrationPath = path.resolve(
  __dirname,
  '../../db/migrations/0017_harden_pastor_letters.sql'
);
const pastorLetterInvariantMigrationPath = path.resolve(
  __dirname,
  '../../db/migrations/0018_enforce_pastor_letter_verification.sql'
);
const communityPermissionMigrationPath = path.resolve(
  __dirname,
  '../../db/migrations/0019_harden_community_admin_permissions.sql'
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

test('schema diagnosis checks pastor letter ownership and verification provenance', () => {
  assert.match(source, /'pastor_letters'/);
  assert.match(source, /\['pastor_letters', \['user_id', 'pastor_name', 'pastor_contact', 'is_verified', 'verified_by', 'verified_at'\]\]/);
  assert.match(source, /\['pastor_letters', \['user_id'\]\]/);
  assert.match(source, /pastor_letters_verification_consistent/);
  assert.match(source, /pastor_letters_reset_verification_on_content_change/);
  assert.match(source, /pastor_letters_verified_by_fkey/);
});

test('schema diagnosis requires one pending community admin application per scope', () => {
  assert.match(source, /\['community_admin_applications', \['user_id'\], "state = 'pending' AND group_id IS NULL"\]/);
  assert.match(source, /\['community_admin_applications', \['user_id', 'group_id'\], "state = 'pending' AND group_id IS NOT NULL"\]/);
});

test('community permission migration deduplicates applications and backfills approved group members', () => {
  assert.equal(existsSync(communityPermissionMigrationPath), true);
  const sql = readFileSync(communityPermissionMigrationPath, 'utf8');
  assert.match(sql, /LOCK TABLE community_admin_applications IN SHARE ROW EXCLUSIVE MODE/i);
  assert.match(sql, /ROW_NUMBER\(\) OVER[\s\S]*PARTITION BY user_id, group_id/i);
  assert.match(sql, /UPDATE community_memberships[\s\S]*SET role = 'admin'/i);
  assert.match(sql, /m\.state = 'approved'[\s\S]*m\.role = 'member'/i);
  assert.match(sql, /CREATE UNIQUE INDEX[\s\S]*community_admin_applications\(user_id\)[\s\S]*group_id IS NULL/i);
  assert.match(sql, /CREATE UNIQUE INDEX[\s\S]*community_admin_applications\(user_id, group_id\)[\s\S]*group_id IS NOT NULL/i);
});

test('PostgreSQL community permission migration deduplicates scopes and backfills only active members', {
  skip: !process.env.TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `codex_community_permissions_${process.pid}_${randomUUID().replace(/-/g, '')}`;
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
    await databasePool.query('DROP INDEX idx_community_admin_applications_global_pending');
    await databasePool.query('DROP INDEX idx_community_admin_applications_group_pending');

    const activeUserId = 'aaaaaaaa-1000-4000-8000-000000000001';
    const inactiveUserId = 'bbbbbbbb-1000-4000-8000-000000000001';
    const groupId = 'cccccccc-1000-4000-8000-000000000001';
    await databasePool.query(
      `INSERT INTO users (id, email, password_hash)
       VALUES ($1, 'community-active@example.test', 'test'),
              ($2, 'community-inactive@example.test', 'test')`,
      [activeUserId, inactiveUserId]
    );
    await databasePool.query(
      `INSERT INTO community_groups (id, name, created_by) VALUES ($1, '迁移测试小组', $2)`,
      [groupId, activeUserId]
    );
    await databasePool.query(
      `INSERT INTO community_memberships (user_id, group_id, role, state)
       VALUES ($1, $3, 'member', 'approved'),
              ($2, $3, 'member', 'kicked')`,
      [activeUserId, inactiveUserId, groupId]
    );
    await databasePool.query(
      `INSERT INTO community_admin_applications
         (id, user_id, group_id, reason, state, created_at)
       VALUES
         ('10000000-1000-4000-8000-000000000001', $1, NULL, 'global one', 'pending', '2026-01-01T00:00:00Z'),
         ('10000000-1000-4000-8000-000000000002', $1, NULL, 'global two', 'pending', '2026-01-02T00:00:00Z'),
         ('20000000-1000-4000-8000-000000000001', $1, $3, 'group one', 'pending', '2026-01-01T00:00:00Z'),
         ('20000000-1000-4000-8000-000000000002', $1, $3, 'group two', 'pending', '2026-01-02T00:00:00Z'),
         ('30000000-1000-4000-8000-000000000001', $1, $3, 'approved active', 'approved', '2026-01-03T00:00:00Z'),
         ('30000000-1000-4000-8000-000000000002', $2, $3, 'approved inactive', 'approved', '2026-01-03T00:00:00Z')`,
      [activeUserId, inactiveUserId, groupId]
    );

    await databasePool.query(readFileSync(communityPermissionMigrationPath, 'utf8'));

    const pending = await databasePool.query(
      `SELECT group_id::text, COUNT(*)::int AS count
         FROM community_admin_applications
        WHERE user_id = $1 AND state = 'pending'
        GROUP BY group_id
        ORDER BY group_id NULLS FIRST`,
      [activeUserId]
    );
    assert.deepEqual(pending.rows, [
      { group_id: null, count: 1 },
      { group_id: groupId, count: 1 },
    ]);

    const memberships = await databasePool.query(
      `SELECT user_id::text, role::text, state::text
         FROM community_memberships
        WHERE group_id = $1
        ORDER BY user_id`,
      [groupId]
    );
    assert.deepEqual(memberships.rows, [
      { user_id: activeUserId, role: 'admin', state: 'approved' },
      { user_id: inactiveUserId, role: 'member', state: 'kicked' },
    ]);

    await assert.rejects(
      databasePool.query(
        `INSERT INTO community_admin_applications (user_id, reason, state)
         VALUES ($1, 'duplicate global', 'pending')`,
        [activeUserId]
      ),
      (error) => error.code === '23505'
    );
    await assert.rejects(
      databasePool.query(
        `INSERT INTO community_admin_applications (user_id, group_id, reason, state)
         VALUES ($1, $2, 'duplicate group', 'pending')`,
        [activeUserId, groupId]
      ),
      (error) => error.code === '23505'
    );

    const diagnosis = await runSchemaDiagnosis(databaseUrl);
    assert.equal(diagnosis.code, 0, diagnosisDetails(diagnosis));
  } finally {
    if (databasePool) await databasePool.end();
    if (databaseCreated) {
      await adminPool.query(
        `SELECT pg_terminate_backend(pid)
           FROM pg_stat_activity
          WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [databaseName]
      );
      await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    }
    await adminPool.end();
  }
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

test('PostgreSQL pastor letter migration deduplicates legacy rows and enables route upserts', {
  skip: !process.env.TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `codex_pastor_letters_${process.pid}_${randomUUID().replace(/-/g, '')}`;
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

    const freshColumns = await databasePool.query(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pastor_letters'
          AND column_name IN ('verified_by', 'verified_at')
        ORDER BY column_name`
    );
    assert.deepEqual(freshColumns.rows, [
      { column_name: 'verified_at', data_type: 'timestamp with time zone' },
      { column_name: 'verified_by', data_type: 'uuid' },
    ]);
    assert.equal(await hasUniqueIndex(databasePool, 'pastor_letters', ['user_id']), true);

    await databasePool.query('DROP INDEX idx_pastor_letters_user');
    await databasePool.query(
      `ALTER TABLE pastor_letters
         DROP COLUMN verified_by,
         DROP COLUMN verified_at`
    );
    const legacyDiagnosis = await runSchemaDiagnosis(databaseUrl);
    assert.equal(legacyDiagnosis.code, 1, diagnosisDetails(legacyDiagnosis));

    const firstUserId = 'aaaaaaaa-1000-0000-0000-000000000001';
    const secondUserId = 'bbbbbbbb-1000-0000-0000-000000000001';
    const verifierId = 'cccccccc-1000-0000-0000-000000000001';
    await databasePool.query(
      `INSERT INTO users (id, email, password_hash)
       VALUES ($1, 'pastor-letter-a@example.com', 'test'),
              ($2, 'pastor-letter-b@example.com', 'test'),
              ($3, 'pastor-letter-verifier@example.com', 'test')`,
      [firstUserId, secondUserId, verifierId]
    );
    await databasePool.query(
      `INSERT INTO pastor_letters
         (id, user_id, pastor_name, pastor_contact, is_verified, created_at, updated_at)
       VALUES
         ('11000000-0000-0000-0000-000000000001', $1, 'A older created', 'a1@example.com', FALSE, '2026-01-01T00:00:00Z', '2026-01-03T00:00:00Z'),
         ('11000000-0000-0000-0000-000000000002', $1, 'A winner', 'a2@example.com', TRUE, '2026-01-02T00:00:00Z', '2026-01-03T00:00:00Z'),
         ('11000000-0000-0000-0000-000000000003', $1, 'A older updated', 'a3@example.com', TRUE, '2026-01-04T00:00:00Z', '2026-01-02T00:00:00Z'),
         ('22000000-0000-0000-0000-000000000001', $2, 'B lower id', 'b1@example.com', FALSE, '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z'),
         ('22000000-0000-0000-0000-000000000002', $2, 'B winner', 'b2@example.com', FALSE, '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z')`,
      [firstUserId, secondUserId]
    );

    const migrationClient = await databasePool.connect();
    try {
      await migrationClient.query('BEGIN');
      await migrationClient.query(readFileSync(pastorLetterMigrationPath, 'utf8'));
      await migrationClient.query('COMMIT');
      const afterOwnershipMigration = await runSchemaDiagnosis(databaseUrl);
      assert.equal(afterOwnershipMigration.code, 1, diagnosisDetails(afterOwnershipMigration));
      await migrationClient.query('BEGIN');
      await migrationClient.query(readFileSync(pastorLetterInvariantMigrationPath, 'utf8'));
      await migrationClient.query('COMMIT');
    } catch (err) {
      await migrationClient.query('ROLLBACK');
      throw err;
    } finally {
      migrationClient.release();
    }

    const migrated = await databasePool.query(
      `SELECT id::text, user_id::text, pastor_name, is_verified,
              verified_by::text,
              verified_at IS NOT DISTINCT FROM updated_at AS verified_at_backfilled
         FROM pastor_letters
        ORDER BY user_id`
    );
    assert.deepEqual(migrated.rows, [
      {
        id: '11000000-0000-0000-0000-000000000002',
        user_id: firstUserId,
        pastor_name: 'A winner',
        is_verified: false,
        verified_by: null,
        verified_at_backfilled: false,
      },
      {
        id: '22000000-0000-0000-0000-000000000002',
        user_id: secondUserId,
        pastor_name: 'B winner',
        is_verified: false,
        verified_by: null,
        verified_at_backfilled: false,
      },
    ]);

    const routeUpsert = await databasePool.query(
      `INSERT INTO pastor_letters (user_id, pastor_name, pastor_contact)
       VALUES ($1, 'A route update', 'route@example.com')
       ON CONFLICT (user_id) DO UPDATE SET
         pastor_name = EXCLUDED.pastor_name,
         pastor_contact = EXCLUDED.pastor_contact,
         updated_at = now()
       RETURNING id::text, pastor_name`,
      [firstUserId]
    );
    assert.deepEqual(routeUpsert.rows, [{
      id: '11000000-0000-0000-0000-000000000002',
      pastor_name: 'A route update',
    }]);

    await assert.rejects(
      databasePool.query(
        `INSERT INTO pastor_letters (user_id, pastor_name, pastor_contact)
         VALUES ($1, 'A duplicate', 'duplicate@example.com')`,
        [firstUserId]
      ),
      (err) => err.code === '23505'
    );

    await assert.rejects(
      databasePool.query(
        'UPDATE pastor_letters SET is_verified = TRUE WHERE user_id = $1',
        [firstUserId]
      ),
      (err) => err.code === '23514'
    );
    await databasePool.query(
      `UPDATE pastor_letters
          SET is_verified = TRUE, verified_by = $1, verified_at = now()
        WHERE user_id = $2`,
      [verifierId, firstUserId]
    );
    await assert.rejects(
      databasePool.query('DELETE FROM users WHERE id = $1', [verifierId]),
      (err) => err.code === '23503'
    );
    const verifierCleanup = await databasePool.query(
      'SELECT verified_by::text FROM pastor_letters WHERE user_id = $1',
      [firstUserId]
    );
    assert.equal(verifierCleanup.rows[0].verified_by, verifierId);

    await databasePool.query(
      `UPDATE pastor_letters SET faith_note = 'changed after verification' WHERE user_id = $1`,
      [firstUserId]
    );
    const resetAfterEdit = await databasePool.query(
      `SELECT is_verified, verified_by::text, verified_at
         FROM pastor_letters WHERE user_id = $1`,
      [firstUserId]
    );
    assert.deepEqual(resetAfterEdit.rows, [{ is_verified: false, verified_by: null, verified_at: null }]);

    assert.equal(await hasUniqueIndex(databasePool, 'pastor_letters', ['user_id']), true);
    const migratedDiagnosis = await runSchemaDiagnosis(databaseUrl);
    assert.equal(migratedDiagnosis.code, 0, diagnosisDetails(migratedDiagnosis));
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
