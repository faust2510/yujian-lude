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
  ['post_state', ['visible', 'pinned', 'removed', 'featured']],
  ['moderation_state', ['approved', 'pending', 'rejected']],
  ['membership_state', ['approved', 'pending', 'rejected', 'kicked']],
  ['notif_kind', ['like', 'comment', 'reply', 'follow', 'group_join', 'post_approved', 'post_featured', 'event_new', 'report_resolved']],
  ['relationship_state', ['chatting', 'exam_required', 'relationship_requested', 'mutual_confirmed', 'pastoral_review', 'confirmed', 'ended']],
  ['course_pastor_review_state', ['pending', 'approved', 'rejected']],
  ['vip_subscription_state', ['pending', 'approved', 'rejected', 'cancelled']],
];

const requiredTables = [
  'schema_migrations',
  'users',
  'profiles',
  'faith_profiles',
  'endorsements',
  'pastor_certifications',
  'pastor_letters',
  'courses',
  'course_units',
  'course_progress',
  'course_pastor_reviews',
  'unit_attempts',
  'course_exam_attempts',
  'textbooks',
  'textbook_chapters',
  'textbook_reading_progress',
  'course_unit_readings',
  'matches',
  'chat_channels',
  'chat_messages',
  'app_settings',
  'admin_audit_logs',
  'vip_subscription_requests',
  'sessions',
  'login_attempts',
  'faith_tests',
  'relationships',
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
  ['schema_migrations', ['version', 'name', 'checksum', 'applied_at']],
  ['users', ['email', 'password_hash', 'role', 'last_checkin_on']],
  ['admin_audit_logs', ['actor_id', 'action', 'target_type', 'target_id', 'detail']],
  ['vip_subscription_requests', ['user_id', 'tier', 'plan_snapshot', 'amount_minor', 'currency', 'duration_days', 'payment_reference', 'payment_confirmation_reference', 'state', 'reviewed_by', 'activated_until']],
  ['login_attempts', ['email', 'ip', 'failed_count', 'locked_until', 'last_failed_at']],
  ['password_reset_tokens', ['user_id', 'token_hash', 'expires_at', 'used_at']],
  ['pastor_certifications', ['user_id', 'church_name', 'contact_email', 'state', 'reviewed_by', 'reviewed_at']],
  ['pastor_letters', ['user_id', 'pastor_name', 'pastor_contact', 'is_verified', 'verified_by', 'verified_at']],
  ['profiles', ['user_id', 'completion', 'privacy_ok']],
  ['faith_profiles', ['user_id', 'church_name', 'testimony']],
  ['endorsements', ['user_id', 'endorser_user_id', 'kind', 'state', 'verified_at']],
  ['course_exam_attempts', ['user_id', 'course_id', 'score', 'passed', 'answers']],
  ['course_pastor_reviews', ['user_id', 'course_id', 'endorsement_id', 'assigned_reviewer_id', 'state', 'reviewed_by', 'reviewed_at']],
  ['textbooks', ['slug', 'title', 'visibility', 'source_filename', 'license_note']],
  ['textbook_chapters', ['textbook_id', 'chapter_index', 'title', 'body_html', 'body_text', 'word_count']],
  ['textbook_reading_progress', ['user_id', 'chapter_id', 'completed', 'completed_at', 'last_read_at']],
  ['course_unit_readings', ['course_unit_id', 'chapter_id', 'required', 'sort_order']],
  ['matches', ['user_id', 'target_id', 'status', 'intent_sent_at']],
  [
    'relationships',
    [
      'user_a',
      'user_b',
      'state',
      'confirmation_requested_by',
      'user_a_confirmed',
      'user_b_confirmed',
      'pastor_a_approved',
      'pastor_b_approved',
      'pastor_a_approved_by',
      'pastor_b_approved_by',
      'pastor_a_endorsement_id',
      'pastor_b_endorsement_id',
      'pastor_a_approved_at',
      'pastor_b_approved_at',
      'ended_reason',
    ],
  ],
  ['chat_channels', ['match_id', 'user_a', 'user_b']],
  ['community_groups', ['id', 'name', 'category', 'join_policy', 'cover_image', 'created_by']],
  ['community_admin_applications', ['user_id', 'group_id', 'reason', 'state', 'reviewed_by', 'reviewed_at']],
  ['community_posts', ['author_id', 'group_id', 'post_type', 'body', 'moderation']],
  ['community_reports', ['reporter_id', 'target_type', 'target_id', 'reason', 'state', 'resolved_by', 'resolved_at']],
  ['community_memberships', ['user_id', 'group_id', 'role', 'state']],
  ['community_events', ['group_id', 'title', 'starts_at', 'created_by']],
  ['community_event_rsvps', ['event_id', 'user_id', 'status']],
];

const requiredUniqueIndexes = [
  ['matches', ['user_id', 'target_id']],
  ['relationships', ['user_a', 'user_b'], "state <> 'ended'"],
  ['pastor_certifications', ['user_id'], "state = 'pending'"],
  ['pastor_letters', ['user_id']],
  ['vip_subscription_requests', ['user_id'], "state = 'pending'"],
  ['vip_subscription_requests', ['payment_confirmation_reference']],
  ['login_attempts', ['email', 'ip']],
  ['chat_channels', ['user_a', 'user_b']],
  ['unit_attempts', ['user_id', 'unit_id']],
  ['textbooks', ['slug']],
  ['textbook_chapters', ['textbook_id', 'chapter_index']],
  ['textbook_reading_progress', ['user_id', 'chapter_id']],
  ['course_unit_readings', ['course_unit_id', 'chapter_id']],
  ['course_pastor_reviews', ['user_id', 'course_id'], "state = 'pending'"],
  ['community_admin_applications', ['user_id'], "state = 'pending' AND group_id IS NULL"],
  ['community_admin_applications', ['user_id', 'group_id'], "state = 'pending' AND group_id IS NOT NULL"],
  ['community_follows', ['follower_id', 'followee_id']],
  ['community_memberships', ['user_id', 'group_id']],
  ['community_bookmarks', ['user_id', 'post_id']],
  ['community_event_rsvps', ['event_id', 'user_id']],
];

const requiredConstraints = [
  ['pastor_letters', 'pastor_letters_verification_consistent', 'c'],
  ['pastor_letters', 'pastor_letters_verified_by_fkey', 'f', 'r'],
];

const requiredTriggers = [
  ['pastor_letters', 'pastor_letters_reset_verification_on_content_change'],
];

const requiredSettings = [
  'match.require_verified_pastor',
  'match.require_faith_test',
  'match.require_light_course',
  'match.light_course_id',
  'points.daily_checkin',
  'pricing.vip_basic',
  'pricing.vip_pro',
];

const requiredCourses = [
  ['christian-dating-basics', 8],
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

function normalizeIndexPredicate(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/::[a-z0-9_"]+/g, '')
    .replace(/[()\s]/g, '');
}

export async function hasUniqueIndex(queryable, tableName, expectedColumns, expectedPredicate, schemaName = 'public') {
  const { rows } = await queryable.query(
    `SELECT ARRAY(
              SELECT a.attname
                FROM unnest(i.indkey) WITH ORDINALITY AS keys(attnum, ord)
                JOIN pg_attribute a
                  ON a.attrelid = tbl.oid
                 AND a.attnum = keys.attnum
               WHERE keys.ord <= i.indnkeyatts
               ORDER BY keys.ord
            )::text[] AS columns,
            pg_get_expr(i.indpred, i.indrelid) AS predicate,
            i.indexprs IS NOT NULL AS has_expressions
       FROM pg_index i
       JOIN pg_class tbl ON tbl.oid = i.indrelid
       JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
      WHERE ns.nspname = $1
        AND tbl.relname = $2
        AND i.indisunique = TRUE
        AND i.indisvalid = TRUE
        AND i.indisready = TRUE
        AND i.indexprs IS NULL`,
    [schemaName, tableName]
  );
  return rows.some((row) => (
    row.has_expressions !== true
    && sameColumns(row.columns, expectedColumns)
    && (
      normalizeIndexPredicate(row.predicate) === normalizeIndexPredicate(expectedPredicate)
    )
  ));
}

async function constraintExists(tableName, constraintName, constraintType, deleteAction) {
  const row = await one(
    `SELECT c.contype, c.confdeltype
       FROM pg_constraint c
       JOIN pg_class tbl ON tbl.oid = c.conrelid
       JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
      WHERE ns.nspname = 'public'
        AND tbl.relname = $1
        AND c.conname = $2`,
    [tableName, constraintName]
  );
  return Boolean(
    row
    && row.contype === constraintType
    && (deleteAction === undefined || row.confdeltype === deleteAction)
  );
}

async function triggerExists(tableName, triggerName) {
  const row = await one(
    `SELECT 1
       FROM pg_trigger t
       JOIN pg_class tbl ON tbl.oid = t.tgrelid
       JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
      WHERE ns.nspname = 'public'
        AND tbl.relname = $1
        AND t.tgname = $2
        AND t.tgisinternal = FALSE`,
    [tableName, triggerName]
  );
  return Boolean(row);
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

  for (const [tableName, columns, predicate] of requiredUniqueIndexes) {
    if (!tableMap.get(tableName)) continue;
    if (!(await hasUniqueIndex(pool, tableName, columns, predicate))) {
      missing.push(`unique ${tableName}(${columns.join(', ')})`);
    }
  }

  for (const [tableName, constraintName, constraintType, deleteAction] of requiredConstraints) {
    if (!tableMap.get(tableName)) continue;
    if (!(await constraintExists(tableName, constraintName, constraintType, deleteAction))) {
      missing.push(`constraint ${tableName}.${constraintName}`);
    }
  }

  for (const [tableName, triggerName] of requiredTriggers) {
    if (!tableMap.get(tableName)) continue;
    if (!(await triggerExists(tableName, triggerName))) {
      missing.push(`trigger ${tableName}.${triggerName}`);
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

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  run()
    .catch((err) => {
      console.error('[diagnose:schema] FAIL：', err.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}
