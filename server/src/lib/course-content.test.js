import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(serverRoot, relativePath), 'utf8');
}

function unitRows(sql, courseId) {
  const rowPattern = new RegExp(`\\('${courseId}',\\s*(\\d+),\\s*'([^']+)',\\s*'([^']+)'`, 'g');
  return [...sql.matchAll(rowPattern)].map((match) => ({
    unitIndex: Number(match[1]),
    title: match[2],
    material: match[3],
  }));
}

test('seed data keeps both marriage courses substantial', () => {
  const seed = readProjectFile('db/seed.sql');
  assert.doesNotMatch(seed, /成熟引荐人/);
  const kellerRows = unitRows(seed, '11111111-1111-1111-1111-111111111111');
  const datingRows = unitRows(seed, '22222222-2222-2222-2222-222222222222');

  assert.equal(kellerRows.length, 10);
  assert.equal(datingRows.length, 8);

  for (const row of [...kellerRows, ...datingRows]) {
    assert.match(row.material, /学习目标/);
    assert.match(row.material, /导读/);
    assert.match(row.material, /反思题/);
    assert.match(row.material, /讨论题/);
    assert.ok(row.material.length >= 220, `${row.title} material is too short`);
  }
});

test('latest course-content migration updates existing deployments', () => {
  const migration = readProjectFile('db/migrations/0004_expand_marriage_course_content.sql');

  assert.match(migration, /christian-dating-basics/);
  assert.match(migration, /keller-meaning-of-marriage/);
  assert.match(migration, /unit_index,\s*title,\s*material,\s*is_pastor_node/);
  assert.match(migration, /ON CONFLICT \(course_id, unit_index\)/);
  assert.match(migration, /学习目标/);
});

test('course pastor review schema is available to fresh and upgraded databases', () => {
  const schema = readProjectFile('db/schema.sql');
  const migration = readProjectFile('db/migrations/0010_course_pastor_reviews.sql');
  const hardeningMigration = readProjectFile('db/migrations/0011_harden_course_pastor_reviews.sql');
  const nodeMigration = readProjectFile('db/migrations/0023_split_course_pastor_review_nodes.sql');

  for (const source of [schema, migration]) {
    assert.match(source, /course_pastor_reviews/);
    assert.match(source, /reviewed_by/);
  }

  for (const source of [schema, hardeningMigration]) {
    assert.match(source, /endorser_user_id/);
    assert.match(source, /endorsement_id/);
    assert.match(source, /assigned_reviewer_id/);
  }
  assert.match(schema, /WHERE state = 'pending'/);
  assert.match(hardeningMigration, /DROP CONSTRAINT IF EXISTS course_pastor_reviews_user_id_course_id_key/);
  assert.match(hardeningMigration, /WHERE state = 'pending'/);
  assert.match(hardeningMigration, /points\.course_complete/);
  for (const source of [schema, nodeMigration]) {
    assert.match(source, /unit_id/);
    assert.match(source, /course_units/);
    assert.match(source, /user_id, course_id, unit_id/);
  }
});
