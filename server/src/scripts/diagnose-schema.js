import dotenv from 'dotenv';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(serverRoot, '.env') });

const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/yujian_lude';
const usingDefaultDatabaseUrl = !process.env.DATABASE_URL;

const requiredEnums = [
  ['user_role', ['free', 'vip', 'pastor', 'admin']],
  ['match_status', ['suggested', 'intent_sent', 'matched', 'under_review', 'approved', 'declined']],
  ['post_type', ['post', 'event', 'announcement']],
  ['moderation_state', ['approved', 'pending', 'rejected']],
  ['membership_state', ['approved', 'pending', 'rejected', 'kicked']],
  ['notif_kind', ['like', 'comment', 'reply', 'follow', 'group_join', 'post_approved', 'post_featured', 'event_new', 'report_resolved']],
];

const requiredTables = [
  'users',
  'profiles',
  'faith_profiles',
  'endorsements',
  'pastor_certifications',
  'courses',
  'course_units',
  'course_progress',
  'unit_attempts',
  'matches',
  'chat_channels',
  'chat_messages',
  'app_settings',
  'admin_audit_logs',
  'sessions',
  'login_attempts',
  'faith_tests',
  'community_groups',
  'community_admin_applications',
  'community_posts',
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
];

const requiredColumns = [
  ['users', ['email', 'password_hash', 'role', 'last_checkin_on']],
  ['admin_audit_logs', ['actor_id', 'action', 'target_type', 'target_id', 'detail']],
  ['login_attempts', ['email', 'ip', 'failed_count', 'locked_until', 'last_failed_at']],
  ['password_reset_tokens', ['user_id', 'token_hash', 'expires_at', 'used_at']],
  ['pastor_certifications', ['user_id', 'church_name', 'contact_email', 'state', 'reviewed_by', 'reviewed_at']],
  ['profiles', ['user_id', 'completion', 'privacy_ok']],
  ['faith_profiles', ['user_id', 'church_name', 'testimony']],
  ['endorsements', ['user_id', 'kind', 'state', 'verified_at']],
  ['matches', ['user_id', 'target_id', 'status', 'intent_sent_at']],
  ['chat_channels', ['match_id', 'user_a', 'user_b']],
  ['community_admin_applications', ['user_id', 'group_id', 'reason', 'state', 'reviewed_by', 'reviewed_at']],
  ['community_posts', ['author_id', 'group_id', 'post_type', 'body', 'moderation']],
  ['community_reports', ['reporter_id', 'target_type', 'target_id', 'reason', 'state', 'resolved_by', 'resolved_at']],
  ['community_memberships', ['user_id', 'group_id', 'role', 'state']],
  ['community_events', ['group_id', 'title', 'starts_at', 'created_by']],
  ['community_event_rsvps', ['event_id', 'user_id', 'status']],
];

const requiredUniqueIndexes = [
  ['matches', ['user_id', 'target_id']],
  ['login_attempts', ['email', 'ip']],
  ['chat_channels', ['user_a', 'user_b']],
  ['unit_attempts', ['user_id', 'unit_id']],
  ['community_follows', ['follower_id', 'followee_id']],
  ['community_memberships', ['user_id', 'group_id']],
  ['community_bookmarks', ['user_id', 'post_id']],
  ['community_event_rsvps', ['event_id', 'user_id']],
];

const requiredSettings = [
  'match.require_verified_pastor',
  'match.require_faith_test',
  'match.require_light_course',
  'match.light_course_id',
  'points.daily_checkin',
];

const requiredCourses = [
  ['christian-dating-basics', 4],
  ['keller-meaning-of-marriage', 10],
];

const pool = new Pool({
  connectionString: databaseUrl,
  options: '-c default_transaction_read_only=on',
});

async function one(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0] ?? null;
}

function sameColumns(actual, expected) {
  return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
}

async function tableExists(tableName) {
  const row = await one('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
  return row.exists;
}

async function enumValues(typeName) {
  const { rows } = await pool.query(
    `SELECT e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = $1
      ORDER BY e.enumsortorder`,
    [typeName]
  );
  return rows.map((row) => row.enumlabel);
}

async function tableColumns(tableName) {
  const { rows } = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [tableName]
  );
  return new Set(rows.map((row) => row.column_name));
}

async function hasUniqueIndex(tableName, expectedColumns) {
  const { rows } = await pool.query(
    `SELECT array_agg(a.attname ORDER BY keys.ord)::text[] AS columns
       FROM pg_index i
       JOIN pg_class tbl ON tbl.oid = i.indrelid
       JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
       JOIN unnest(i.indkey) WITH ORDINALITY AS keys(attnum, ord) ON TRUE
       JOIN pg_attribute a ON a.attrelid = tbl.oid AND a.attnum = keys.attnum
      WHERE ns.nspname = 'public'
        AND tbl.relname = $1
        AND i.indisunique = TRUE
      GROUP BY i.indexrelid`,
    [tableName]
  );
  return rows.some((row) => sameColumns(row.columns, expectedColumns));
}

async function settingExists(key) {
  const row = await one('SELECT EXISTS (SELECT 1 FROM app_settings WHERE key = $1) AS exists', [key]);
  return row.exists;
}

async function courseUnitCount(slug) {
  return one(
    `SELECT COUNT(u.id)::int AS units
       FROM courses c
       LEFT JOIN course_units u ON u.course_id = c.id
      WHERE c.slug = $1
      GROUP BY c.id`,
    [slug]
  );
}

async function run() {
  const missing = [];
  const tableMap = new Map();

  if (usingDefaultDatabaseUrl) {
    console.warn('[diagnose:schema] 未设置 DATABASE_URL，使用开发默认连接进行诊断。');
  }

  const meta = await one('SELECT current_database() AS database_name');
  console.log(`[diagnose:schema] 检查数据库：${meta.database_name}`);

  for (const [typeName, values] of requiredEnums) {
    const actual = await enumValues(typeName);
    if (actual.length === 0) {
      missing.push(`enum ${typeName}`);
      continue;
    }
    for (const value of values) {
      if (!actual.includes(value)) missing.push(`enum ${typeName}.${value}`);
    }
  }

  for (const tableName of requiredTables) {
    const exists = await tableExists(tableName);
    tableMap.set(tableName, exists);
    if (!exists) missing.push(`table ${tableName}`);
  }

  for (const [tableName, columns] of requiredColumns) {
    if (!tableMap.get(tableName)) continue;
    const actual = await tableColumns(tableName);
    for (const column of columns) {
      if (!actual.has(column)) missing.push(`column ${tableName}.${column}`);
    }
  }

  for (const [tableName, columns] of requiredUniqueIndexes) {
    if (!tableMap.get(tableName)) continue;
    if (!(await hasUniqueIndex(tableName, columns))) {
      missing.push(`unique ${tableName}(${columns.join(', ')})`);
    }
  }

  if (tableMap.get('app_settings')) {
    for (const key of requiredSettings) {
      if (!(await settingExists(key))) missing.push(`setting ${key}`);
    }
  }

  if (tableMap.get('courses') && tableMap.get('course_units')) {
    for (const [slug, minUnits] of requiredCourses) {
      const row = await courseUnitCount(slug);
      if (!row) {
        missing.push(`course ${slug}`);
      } else if (row.units < minUnits) {
        missing.push(`course_units ${slug} >= ${minUnits}, got ${row.units}`);
      }
    }
  }

  if (missing.length > 0) {
    console.error('[diagnose:schema] FAIL：当前数据库缺少 MVP/真实用户验收所需结构：');
    for (const item of missing) console.error(`- ${item}`);
    console.error('[diagnose:schema] 提示：当前 schema.sql 适合 fresh DB 初始化；旧库请先备份，再编写增量迁移。');
    process.exitCode = 1;
    return;
  }

  console.log('[diagnose:schema] PASS：当前数据库结构和关键 seed 数据满足上线前验收要求。');
}

run()
  .catch((err) => {
    console.error('[diagnose:schema] FAIL：', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
