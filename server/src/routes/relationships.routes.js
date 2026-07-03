import { Router } from 'express';
import { query, one } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { hasPassedRequiredCourseExam } from '../lib/relationship-eligibility.js';
import { getSetting } from '../settings.js';
import {
  approveRelationshipPastorSide,
  confirmRelationshipParticipant,
  endRelationship,
  RELATIONSHIP_STATES,
} from '../lib/relationship-flow.js';

const router = Router();

router.post('/relationships/initiate', requireAuth, async (req, res) => {
  const { partner_id } = req.body;
  if (!partner_id) return res.status(400).json({ error: '缺少 partner_id' });

  const lightCourseId = await getSetting('match.light_course_id');
  const examPassed = await hasPassedRequiredCourseExam(one, {
    userId: req.user.id,
    requiredCourseId: lightCourseId,
  });
  if (!examPassed) return res.status(403).json({ error: '需先通过恋爱必修课考试' });

  const [user_a, user_b] = [req.user.id, partner_id].sort();
  const existing = await one('SELECT * FROM relationships WHERE user_a = $1 AND user_b = $2', [user_a, user_b]);
  if (existing?.state === RELATIONSHIP_STATES.ENDED) {
    return res.status(409).json({ error: '此前关系已结束，暂不支持自动重新发起' });
  }
  if (existing) return res.json({ ok: true, relationship: existing });

  try {
    const row = await one(
      `INSERT INTO relationships (user_a, user_b) VALUES ($1, $2)
       RETURNING *`,
      [user_a, user_b]
    );
    res.json({ ok: true, relationship: row });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: '关系已存在' });
    throw e;
  }
});

async function requirePassedLightCourse(userId) {
  const lightCourseId = await getSetting('match.light_course_id');
  return hasPassedRequiredCourseExam(one, { userId, requiredCourseId: lightCourseId });
}

async function loadActiveRelationship(id) {
  const rel = await one(
    `SELECT * FROM relationships WHERE id = $1 AND state NOT IN ('confirmed','ended')`,
    [id]
  );
  return rel;
}

async function handleRelationshipConfirmationRequest(req, res) {
  const rel = await loadActiveRelationship(req.params.id);
  if (!rel) return res.status(404).json({ error: '关系不存在' });

  const isA = rel.user_a === req.user.id;
  const isB = rel.user_b === req.user.id;
  if (!isA && !isB) return res.status(403).json({ error: '无权操作' });

  if (!(await requirePassedLightCourse(req.user.id))) {
    return res.status(403).json({ error: '需先通过恋爱必修课考试' });
  }

  const next = confirmRelationshipParticipant(rel, req.user.id);
  const updated = await one(
    `UPDATE relationships
        SET state = $2::relationship_state,
            confirmation_requested_by = COALESCE(confirmation_requested_by, $3),
            confirmation_requested_at = COALESCE(confirmation_requested_at, $4),
            user_a_confirmed = $5,
            user_b_confirmed = $6,
            user_a_confirmed_at = COALESCE(user_a_confirmed_at, $7),
            user_b_confirmed_at = COALESCE(user_b_confirmed_at, $8),
            user_a_exam_passed = CASE WHEN user_a = $9 THEN TRUE ELSE user_a_exam_passed END,
            user_b_exam_passed = CASE WHEN user_b = $9 THEN TRUE ELSE user_b_exam_passed END
      WHERE id = $1
      RETURNING *`,
    [
      rel.id,
      next.state,
      next.confirmation_requested_by,
      next.confirmation_requested_at,
      next.user_a_confirmed,
      next.user_b_confirmed,
      next.user_a_confirmed_at,
      next.user_b_confirmed_at,
      req.user.id,
    ]
  );
  res.json({ ok: true, relationship: updated });
}

router.post('/relationships/:id/request-confirmation', requireAuth, handleRelationshipConfirmationRequest);

// Backward-compatible alias for the older frontend button.
router.post('/relationships/:id/exam-confirm', requireAuth, handleRelationshipConfirmationRequest);

router.post('/relationships/:id/pastor-approve', requireAuth, requireRole('pastor', 'admin'), async (req, res) => {
  const side = req.body?.side;
  const rel = await one(
    `SELECT * FROM relationships WHERE id = $1 AND state NOT IN ('confirmed','ended')`,
    [req.params.id]
  );
  if (!rel) return res.status(404).json({ error: '关系不存在' });
  if (!['user_a', 'user_b'].includes(side)) return res.status(400).json({ error: 'side 必须是 user_a 或 user_b' });
  if (!rel.user_a_confirmed || !rel.user_b_confirmed) return res.status(409).json({ error: '需双方先确认关系意向' });

  const next = approveRelationshipPastorSide(rel, side);
  const updated = await one(
    `UPDATE relationships
        SET state = $2::relationship_state,
            pastor_a_approved = $3,
            pastor_b_approved = $4,
            confirmed_at = $5
      WHERE id = $1
      RETURNING *`,
    [rel.id, next.state, next.pastor_a_approved, next.pastor_b_approved, next.confirmed_at ?? rel.confirmed_at]
  );
  res.json({ ok: true, relationship: updated });
});

router.get('/relationships/mine', requireAuth, async (req, res) => {
  const rel = await one(
    `SELECT r.*,
            CASE WHEN r.user_a = $1 THEN pb.nickname ELSE pa.nickname END AS partner_nickname,
            CASE WHEN r.user_a = $1 THEN r.user_b ELSE r.user_a END AS partner_id
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

  const next = endRelationship(rel, req.body?.reason);
  const updated = await one(
    `UPDATE relationships SET state = $2::relationship_state, ended_at = $3, ended_reason = $4 WHERE id = $1 RETURNING *`,
    [rel.id, RELATIONSHIP_STATES.ENDED, next.ended_at, next.ended_reason]
  );
  res.json({ ok: true, relationship: updated });
});

export default router;
