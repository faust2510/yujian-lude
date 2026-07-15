import 'express-async-errors';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';

const { Client } = pg;
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../..');
const schema = readFileSync(path.join(serverRoot, 'db/schema.sql'), 'utf8');
const seed = readFileSync(path.join(serverRoot, 'db/seed.sql'), 'utf8');
const splitPastorReviewNodesMigration = readFileSync(
  path.join(serverRoot, 'db/migrations/0023_split_course_pastor_review_nodes.sql'),
  'utf8'
);
const MEMBER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REVIEWER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function databaseUrlFor(databaseName) {
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function close(server) {
  if (!server) return;
  server.closeAllConnections?.();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('two pastor nodes require two independent approvals before course completion', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `course_nodes_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: databaseUrlFor('postgres') });
  let appPool;
  let server;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    process.env.DATABASE_URL = databaseUrlFor(databaseName);
    const { pool } = await import('../db.js');
    const { default: courseRoutes } = await import('./courses.routes.js');
    appPool = pool;
    await pool.query(schema);
    await pool.query(seed);

    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, email_verified)
       VALUES ($1, 'course-member@example.test', 'test', 'free', TRUE),
              ($2, 'course-reviewer@example.test', 'test', 'pastor', TRUE)`,
      [MEMBER_ID, REVIEWER_ID]
    );
    await pool.query(
      `INSERT INTO profiles (user_id, nickname, birth_year, privacy_ok, completion)
       VALUES ($1, '课程学员', 1990, TRUE, 100), ($2, '课程牧者', 1980, TRUE, 100)`,
      [MEMBER_ID, REVIEWER_ID]
    );
    await pool.query('INSERT INTO points_balance (user_id, earned_total) VALUES ($1, 0)', [MEMBER_ID]);

    const course = await pool.query(
      `SELECT id FROM courses WHERE slug = 'keller-meaning-of-marriage'`
    );
    const courseId = course.rows[0].id;
    const nodes = await pool.query(
      `SELECT id, unit_index FROM course_units
        WHERE course_id = $1 AND is_pastor_node = TRUE ORDER BY unit_index`,
      [courseId]
    );
    assert.equal(nodes.rowCount, 2);

    await pool.query(
      `INSERT INTO course_progress (user_id, course_id, state, units_done, pastor_confirmed)
       VALUES ($1, $2, 'pastor_review', 10, 0)`,
      [MEMBER_ID, courseId]
    );
    await pool.query(
      `INSERT INTO course_exam_attempts (user_id, course_id, score, passed, answers)
       VALUES ($1, $2, 10, TRUE, '[]'::jsonb)`,
      [MEMBER_ID, courseId]
    );
    const reviewRows = [];
    for (const node of nodes.rows) {
      const inserted = await pool.query(
        `INSERT INTO course_pastor_reviews
           (user_id, course_id, unit_id, assigned_reviewer_id, state)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
        [MEMBER_ID, courseId, node.id, REVIEWER_ID]
      );
      reviewRows.push(inserted.rows[0]);
    }

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = req.headers['x-test-user'] === 'member'
        ? { id: MEMBER_ID, role: 'free', is_banned: false }
        : { id: REVIEWER_ID, role: 'pastor', is_banned: false };
      next();
    });
    app.use(courseRoutes);
    app.use((error, _req, res, _next) => {
      res.status(error.status || 500).json({ error: error.message });
    });
    server = await listen(app);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const approve = (id) => fetch(`${baseUrl}/course-pastor-reviews/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });

    const first = await approve(reviewRows[0].id);
    assert.equal(first.status, 200);
    assert.equal((await first.json()).courseState, 'pastor_review');
    let progress = await pool.query(
      'SELECT state, pastor_confirmed FROM course_progress WHERE user_id = $1 AND course_id = $2',
      [MEMBER_ID, courseId]
    );
    assert.equal(progress.rows[0].state, 'pastor_review');
    assert.equal(progress.rows[0].pastor_confirmed, 1);

    const second = await approve(reviewRows[1].id);
    assert.equal(second.status, 200);
    assert.equal((await second.json()).courseState, 'completed');
    progress = await pool.query(
      'SELECT state, pastor_confirmed, badge_awarded FROM course_progress WHERE user_id = $1 AND course_id = $2',
      [MEMBER_ID, courseId]
    );
    assert.equal(progress.rows[0].state, 'completed');
    assert.equal(progress.rows[0].pastor_confirmed, 2);
    assert.equal(progress.rows[0].badge_awarded, true);

    const rewards = await pool.query(
      `SELECT amount FROM points_ledger
        WHERE user_id = $1 AND reason = 'points.course_complete'`,
      [MEMBER_ID]
    );
    assert.equal(rewards.rowCount, 1);

    const completedSnapshot = await pool.query(
      `SELECT state, units_done, pastor_confirmed, completed_at, badge_awarded
         FROM course_progress WHERE user_id = $1 AND course_id = $2`,
      [MEMBER_ID, courseId]
    );
    const resubmitted = await fetch(`${baseUrl}/courses/keller-meaning-of-marriage/units/1/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-user': 'member' },
      body: JSON.stringify({ readConfirmed: true }),
    });
    assert.equal(resubmitted.status, 200);
    assert.equal((await resubmitted.json()).state, 'completed');
    const progressAfterResubmit = await pool.query(
      `SELECT state, units_done, pastor_confirmed, completed_at, badge_awarded
         FROM course_progress WHERE user_id = $1 AND course_id = $2`,
      [MEMBER_ID, courseId]
    );
    assert.deepEqual(progressAfterResubmit.rows[0], completedSnapshot.rows[0]);
    const rewardsAfterResubmit = await pool.query(
      `SELECT amount FROM points_ledger
        WHERE user_id = $1 AND reason = 'points.course_complete'`,
      [MEMBER_ID]
    );
    assert.equal(rewardsAfterResubmit.rowCount, 1);
  } finally {
    await close(server);
    if (appPool) await appPool.end();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
});

test('0023 reconciles legacy single-approval completion with the first pastor node', {
  skip: !TEST_DATABASE_URL,
  timeout: 30_000,
}, async () => {
  const databaseName = `course_nodes_migration_${process.pid}_${Date.now()}`;
  const admin = new Client({ connectionString: databaseUrlFor('postgres') });
  let database;

  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${databaseName}" TEMPLATE template0`);
    database = new Client({ connectionString: databaseUrlFor(databaseName) });
    await database.connect();
    await database.query(schema);
    await database.query(seed);

    await database.query('DROP INDEX idx_course_pastor_reviews_one_pending');
    await database.query('ALTER TABLE course_pastor_reviews DROP COLUMN unit_id');
    await database.query(
      `CREATE UNIQUE INDEX idx_course_pastor_reviews_one_pending
         ON course_pastor_reviews(user_id, course_id)
        WHERE state = 'pending'`
    );

    await database.query(
      `INSERT INTO users (id, email, password_hash, role, email_verified)
       VALUES ($1, 'legacy-course-member@example.test', 'test', 'free', TRUE),
              ($2, 'legacy-course-reviewer@example.test', 'test', 'pastor', TRUE)`,
      [MEMBER_ID, REVIEWER_ID]
    );
    const course = await database.query(
      `SELECT id FROM courses WHERE slug = 'keller-meaning-of-marriage'`
    );
    const courseId = course.rows[0].id;
    const nodes = await database.query(
      `SELECT id FROM course_units
        WHERE course_id = $1 AND is_pastor_node = TRUE
        ORDER BY unit_index`,
      [courseId]
    );
    assert.equal(nodes.rowCount, 2);

    await database.query(
      `INSERT INTO course_progress
         (user_id, course_id, state, units_done, pastor_confirmed, completed_at, badge_awarded)
       VALUES ($1, $2, 'completed', 10, 2, now(), TRUE)`,
      [MEMBER_ID, courseId]
    );
    await database.query(
      `INSERT INTO course_pastor_reviews
         (user_id, course_id, assigned_reviewer_id, state, reviewed_by, reviewed_at)
       VALUES ($1, $2, $3, 'approved', $3, now())`,
      [MEMBER_ID, courseId, REVIEWER_ID]
    );

    await database.query(splitPastorReviewNodesMigration);

    const migratedReview = await database.query(
      `SELECT unit_id FROM course_pastor_reviews
        WHERE user_id = $1 AND course_id = $2`,
      [MEMBER_ID, courseId]
    );
    assert.equal(migratedReview.rows[0].unit_id, nodes.rows[0].id);

    const migratedProgress = await database.query(
      `SELECT state, pastor_confirmed FROM course_progress
        WHERE user_id = $1 AND course_id = $2`,
      [MEMBER_ID, courseId]
    );
    assert.equal(migratedProgress.rows[0].state, 'pastor_review');
    assert.equal(migratedProgress.rows[0].pastor_confirmed, 1);
  } finally {
    if (database) await database.end();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await admin.end();
  }
});
