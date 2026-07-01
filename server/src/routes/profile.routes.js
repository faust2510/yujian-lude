// 资料 + 信仰档案 + 牙者/引荐人背书
import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { awardPoints, recomputeExposure } from '../lib/rewards.js';
import { ProfileInputError, normalizeBaptismDate, normalizeFaithYears } from '../lib/profile-inputs.js';

const router = Router();

// 计算资料完整度（0-100）
function calcCompletion(p) {
  const fields = ['nickname', 'city', 'birth_year', 'education', 'goal', 'preference', 'intro'];
  const filled = fields.filter((f) => p[f] !== null && p[f] !== undefined && p[f] !== '').length;
  let pct = Math.round((filled / fields.length) * 100);
  if (p.privacy_ok) pct = Math.min(100, pct); // privacy 是前置条件
  return pct;
}

// 读自己的资料 + 信仰档案 + 背书 + 完课徽章
router.get('/me/profile', requireAuth, async (req, res) => {
  const uid = req.user.id;
  const profile = await one('SELECT * FROM profiles WHERE user_id=$1', [uid]);
  const faith = await one('SELECT * FROM faith_profiles WHERE user_id=$1', [uid]);
  const { rows: endorsements } = await query(
    'SELECT id, kind, name, church, state, created_at FROM endorsements WHERE user_id=$1 ORDER BY created_at',
    [uid]
  );
  const { rows: badges } = await query(
    `SELECT c.title, cp.completed_at FROM course_progress cp
       JOIN courses c ON c.id = cp.course_id
      WHERE cp.user_id=$1 AND cp.state='completed' AND cp.badge_awarded=TRUE`,
    [uid]
  );
  const exposure = await one('SELECT computed_score FROM exposure WHERE user_id=$1', [uid]);
  res.json({ profile, faith, endorsements, badges, exposure: exposure?.computed_score ?? null });
});

// 更新婚恋资料（完整填写发一次性积分）
router.put('/me/profile', requireAuth, async (req, res) => {
  const uid = req.user.id;
  const { nickname, city, birth_year, education, goal, preference, intro, privacy_ok } = req.body || {};
  const merged = { nickname, city, birth_year, education, goal, preference, intro, privacy_ok };
  const completion = calcCompletion(merged);

  await tx(async (db) => {
    await db.query(
      `INSERT INTO profiles (user_id, nickname, city, birth_year, education, goal, preference, intro, privacy_ok, completion, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (user_id) DO UPDATE SET
         nickname=$2, city=$3, birth_year=$4, education=$5, goal=$6,
         preference=$7, intro=$8, privacy_ok=$9, completion=$10, updated_at=now()`,
      [uid, nickname, city, birth_year, education, goal, preference, intro, !!privacy_ok, completion]
    );
    if (completion >= 100) await awardPoints(db, uid, 'points.profile_complete');
  });
  res.json({ ok: true, completion });
});

// 更新信仰档案（六项字段）
router.put('/me/faith', requireAuth, async (req, res) => {
  const uid = req.user.id;
  const { church_name, presbytery, region, denomination, baptism_date, testimony, faith_years, coworker } = req.body || {};
  let normalizedBaptismDate;
  let normalizedFaithYears;
  try {
    normalizedBaptismDate = normalizeBaptismDate(baptism_date);
    normalizedFaithYears = normalizeFaithYears(faith_years);
    await query(
      `INSERT INTO faith_profiles (user_id, church_name, presbytery, region, denomination, baptism_date, testimony, faith_years, coworker, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (user_id) DO UPDATE SET
         church_name=$2, presbytery=$3, region=$4, denomination=$5,
         baptism_date=$6, testimony=$7, faith_years=$8, coworker=$9, updated_at=now()`,
      [uid, church_name, presbytery, region, denomination, normalizedBaptismDate, testimony, normalizedFaithYears, coworker]
    );
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof ProfileInputError) return res.status(400).json({ error: err.message });
    console.error('[profile:faith]', err);
    return res.status(500).json({ error: '信仰档案保存失败，请稍后重试' });
  }
});

// 添加背书人（牙者/引荐人），初始 pending
router.post('/me/endorsements', requireAuth, async (req, res) => {
  const uid = req.user.id;
  const { kind, name, contact, church, note } = req.body || {};
  if (!['pastor', 'referrer'].includes(kind)) return res.status(400).json({ error: 'kind 须为 pastor 或 referrer' });
  if (!name || !contact) return res.status(400).json({ error: '姓名和联系方式必填' });
  const row = await one(
    `INSERT INTO endorsements (user_id, kind, name, contact, church, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, kind, name, state`,
    [uid, kind, name, contact, church || null, note || null]
  );
  res.status(201).json({ endorsement: row });
});

// 删除自己的背书人（仅 pending 可删）
router.delete('/me/endorsements/:id', requireAuth, async (req, res) => {
  const r = await query(
    `DELETE FROM endorsements WHERE id=$1 AND user_id=$2 AND state='pending'`,
    [req.params.id, req.user.id]
  );
  if (!r.rowCount) return res.status(400).json({ error: '无法删除（不存在或已审核）' });
  res.json({ ok: true });
});

export default router;
