import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();

router.post('/relationships/initiate', requireAuth, async (req, res) => {
  const { partner_id } = req.body;
  if (!partner_id) return res.status(400).json({ error: '缺少 partner_id' });

  const examPassed = await one(
    `SELECT 1 FROM course_exam_attempts WHERE user_id = $1 AND passed = TRUE LIMIT 1`,
    [req.user.id]
  );
  if (!examPassed) return res.status(403).json({ error: '需先通过恋爱必修课考试' });

  const [user_a, user_b] = [req.user.id, partner_id].sort();
  try {
    await query(
      `INSERT INTO relationships (user_a, user_b) VALUES ($1, $2)`,
      [user_a, user_b]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: '关系已存在' });
    throw e;
  }
});

router.post('/relationships/:id/exam-confirm', requireAuth, async (req, res) => {
  const rel = await one(
    `SELECT * FROM relationships WHERE id = $1 AND state NOT IN ('confirmed','ended')`,
    [req.params.id]
  );
  if (!rel) return res.status(404).json({ error: '关系不存在' });

  const isA = rel.user_a === req.user.id;
  const isB = rel.user_b === req.user.id;
  if (!isA && !isB) return res.status(403).json({ error: '无权操作' });

  const col = isA ? 'user_a_exam_passed' : 'user_b_exam_passed';
  await query(`UPDATE relationships SET ${col} = TRUE WHERE id = $1`, [rel.id]);

  const updated = await one(
    `SELECT user_a_exam_passed, user_b_exam_passed FROM relationships WHERE id = $1`,
    [rel.id]
  );
  if (updated.user_a_exam_passed && updated.user_b_exam_passed) {
    await query(`UPDATE relationships SET state = 'pastoral_review' WHERE id = $1`, [rel.id]);
  }
  res.json({ ok: true });
});

router.post('/relationships/:id/pastor-approve', requireAuth, requireRole('pastor'), async (req, res) => {
  const rel = await one(
    `SELECT * FROM relationships WHERE id = $1 AND state = 'pastoral_review'`,
    [req.params.id]
  );
  if (!rel) return res.status(404).json({ error: '关系不存在或状态不符' });

  const endorsed = await one(
    `SELECT user_id FROM endorsements
      WHERE endorser_id = $1 AND user_id IN ($2, $3) AND kind = 'pastor' AND state = 'verified'
      LIMIT 1`,
    [req.user.id, rel.user_a, rel.user_b]
  );
  if (!endorsed) return res.status(403).json({ error: '非关系当事人的牧者' });

  const col = endorsed.user_id === rel.user_a ? 'pastor_a_approved' : 'pastor_b_approved';

  await tx(async (db) => {
    await db.query(`UPDATE relationships SET ${col} = TRUE WHERE id = $1`, [rel.id]);
    const { rows } = await db.query(
      `SELECT pastor_a_approved, pastor_b_approved FROM relationships WHERE id = $1`,
      [rel.id]
    );
    if (rows[0].pastor_a_approved && rows[0].pastor_b_approved) {
      await db.query(
        `UPDATE relationships SET state = 'confirmed', confirmed_at = now() WHERE id = $1`,
        [rel.id]
      );
      await db.query(
        `UPDATE matches SET status = 'in_relationship'
          WHERE user_id IN ($1,$2) OR target_id IN ($1,$2)`,
        [rel.user_a, rel.user_b]
      );
    }
  });
  res.json({ ok: true });
});

router.get('/relationships/mine', requireAuth, async (req, res) => {
  const rel = await one(
    `SELECT r.*,
            CASE WHEN r.user_a = $1 THEN pb.nickname ELSE pa.nickname END AS partner_nickname
       FROM relationships r
       LEFT JOIN profiles pa ON pa.user_id = r.user_a
       LEFT JOIN profiles pb ON pb.user_id = r.user_b
      WHERE (r.user_a = $1 OR r.user_b = $1) AND r.state <> 'ended'
      ORDER BY r.created_at DESC LIMIT 1`,
    [req.user.id]
  );
  res.json({ relationship: rel ?? null });
});

router.delete('/relationships/:id', requireAuth, async (req, res) => {
  const rel = await one(
    `SELECT * FROM relationships WHERE id = $1 AND state <> 'ended'`,
    [req.params.id]
  );
  if (!rel) return res.status(404).json({ error: '关系不存在' });
  if (rel.user_a !== req.user.id && rel.user_b !== req.user.id) {
    return res.status(403).json({ error: '无权操作' });
  }

  await tx(async (db) => {
    await db.query(
      `UPDATE relationships SET state = 'ended', ended_at = now() WHERE id = $1`,
      [rel.id]
    );
    await db.query(
      `DELETE FROM matches
        WHERE status = 'in_relationship'
          AND (user_id IN ($1,$2) OR target_id IN ($1,$2))`,
      [rel.user_a, rel.user_b]
    );
  });
  res.json({ ok: true });
});

export default router;
