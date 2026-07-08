import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../db/migrations');
const sql = existsSync(migrationsDir)
  ? readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => readFileSync(path.join(migrationsDir, file), 'utf8'))
      .join('\n')
  : '';

test('legacy schema backfill covers community and account tables diagnosed by release checks', () => {
  for (const item of [
    'login_attempts',
    'admin_audit_logs',
    'community_reports',
    'community_likes',
    'community_comments',
    'community_follows',
    'community_hashtags',
    'community_post_hashtags',
    'notifications',
    'community_memberships',
    'community_bookmarks',
    'community_events',
    'community_event_rsvps',
    'password_reset_tokens',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${item}\\b`));
  }

  for (const item of ['post_type', 'moderation_state', 'membership_state', 'notif_kind']) {
    assert.match(sql, new RegExp(`CREATE TYPE ${item}\\b`));
  }

  for (const value of ['featured', 'removed']) {
    assert.match(sql, new RegExp(`ALTER TYPE post_state ADD VALUE IF NOT EXISTS '${value}'`, 'i'));
  }

  for (const value of ['post_featured', 'event_new', 'report_resolved']) {
    assert.match(sql, new RegExp(`ALTER TYPE notif_kind ADD VALUE IF NOT EXISTS '${value}'`, 'i'));
  }

  assert.match(sql, /ADD COLUMN IF NOT EXISTS post_type post_type/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS moderation moderation_state/i);
  assert.match(sql, /ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS category group_category/i);
  assert.match(sql, /ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS join_policy group_join_policy/i);
  assert.match(sql, /ALTER TABLE community_groups ADD COLUMN IF NOT EXISTS cover_image TEXT/i);
});
