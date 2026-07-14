import { Router } from 'express';
import { query, one } from '../db.js';
import { requireAuth } from '../auth.js';
import { hasPassedRequiredCourseExam } from '../lib/relationship-eligibility.js';
import { getSetting } from '../settings.js';
import {
  confirmRelationshipParticipant,
  endRelationship,
  RELATIONSHIP_STATES,
} from '../lib/relationship-flow.js';

const router = Router();

router.post('/relationships/initiate', requireAuth, async (req, res) => {
  const { partner_id } = req.body;
  if (!partner_id) return res.status(400).json({ error: '缺少 partner_id' });
  if (partner_id === req.user.id) return res.status(400).json({ error: '不能与自己发起关系' });

  const target = await one('SELECT id FROM users WHERE id = $1', [partner_id]);
  if (!target) return res.status(404).json({ error: '目标用户不存在' });

  const matchedChannel = await one(
    `SELECT 1
       FROM chat_channels c
      WHERE ((c.user_a = $1 AND c.user_b = $2) OR (c.user_a = $2 AND c.user_b = $1))
        AND c.closed_at IS NULL
        AND EXISTS (
          SELECT 1 FROM matches m
           WHERE m.user_id = $1 AND m.target_id = $2
             AND m.status IN ('matched','under_review','approved')
        )
        AND EXISTS (
          SELECT 1 FROM matches m
           WHERE m.user_id = $2 AND m.target_id = $1
             AND m.status IN ('matched','under_review','approved')
        )
      LIMIT 1`,
    [req.user.id, partner_id]
  );
  if (!matchedChannel) {
    return res.status(403).json({ error: '仅可与已互相匹配且存在聊天通道的用户发起关系' });
  }

  const lightCourseId = await getSetting('match.light_course_id');
  const examPassed = await hasPassedRequiredCourseExam(one, {
    userId: req.user.id,
    requiredCourseId: lightCourseId,
  });
  if (!examPassed) return res.status(403).json({ error: '需先通过恋爱必修课考试' });

  const [user_a, user_b] = [req.user.id, partner_id].sort();
  const existing = await one(
    `SELECT * FROM relationships
      WHERE user_a = $1 AND user_b = $2 AND state <> 'ended'
      ORDER BY created_at DESC LIMIT 1`,
    [user_a, user_b]
  );
  if (existing) return res.json({ ok: true, relationship: existing });

  try {
    const row = await one(
      `INSERT INTO relationships (user_a, user_b) VALUES ($1, $2)
       ON CONFLICT (user_a, user_b) WHERE state <> 'ended' DO NOTHING
       RETURNING *`,
      [user_a, user_b]
    );
    if (row) return res.json({ ok: true, relationship: row });

    const concurrent = await one(
      `SELECT * FROM relationships
        WHERE user_a = $1 AND user_b = $2 AND state <> 'ended'
        ORDER BY created_at DESC LIMIT 1`,
      [user_a, user_b]
    );
    if (concurrent) return res.json({ ok: true, relationship: concurrent });
    return res.status(409).json({ error: '关系发起状态已变化，请重试' });
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

router.get('/relationship-reviews', requireAuth, async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const { rows } = await query(
    `WITH pending_sides AS (
       SELECT r.id AS relationship_id, 'user_a'::text AS side,
              r.user_a AS subject_id, r.user_b AS partner_id, r.created_at
         FROM relationships r
        WHERE r.state IN ('mutual_confirmed', 'pastoral_review')
          AND r.user_a_confirmed = TRUE
          AND r.user_b_confirmed = TRUE
          AND r.pastor_a_approved = FALSE
          AND r.user_a <> $1
          AND r.user_b <> $1
          AND r.pastor_b_approved_by IS DISTINCT FROM $1
       UNION ALL
       SELECT r.id AS relationship_id, 'user_b'::text AS side,
              r.user_b AS subject_id, r.user_a AS partner_id, r.created_at
         FROM relationships r
        WHERE r.state IN ('mutual_confirmed', 'pastoral_review')
          AND r.user_a_confirmed = TRUE
          AND r.user_b_confirmed = TRUE
          AND r.pastor_b_approved = FALSE
          AND r.user_a <> $1
          AND r.user_b <> $1
          AND r.pastor_a_approved_by IS DISTINCT FROM $1
     )
     SELECT DISTINCT ON (pending.relationship_id, pending.side)
            pending.relationship_id, pending.side, pending.subject_id, pending.partner_id,
            pending.created_at, subject_profile.nickname AS subject_nickname,
            partner_profile.nickname AS partner_nickname,
            e.id AS endorsement_id, e.kind AS endorsement_kind,
            e.name AS endorsement_name, e.church AS endorsement_church
       FROM pending_sides pending
       JOIN endorsements e
         ON e.user_id = pending.subject_id AND e.state = 'verified'
       LEFT JOIN users reviewer ON reviewer.id = e.endorser_user_id
       LEFT JOIN profiles subject_profile ON subject_profile.user_id = pending.subject_id
       LEFT JOIN profiles partner_profile ON partner_profile.user_id = pending.partner_id
      WHERE $2::boolean
         OR (
           e.endorser_user_id = $1
           AND reviewer.email_verified = TRUE
           AND reviewer.is_banned = FALSE
           AND (
             e.kind = 'referrer'
             OR (
               reviewer.role = 'pastor'
               AND EXISTS (
                 SELECT 1 FROM pastor_certifications cert
                  WHERE cert.user_id = reviewer.id AND cert.state = 'approved'
               )
             )
           )
         )
      ORDER BY pending.relationship_id, pending.side,
               (e.endorser_user_id = $1) DESC, e.verified_at DESC NULLS LAST, e.created_at DESC`,
    [req.user.id, isAdmin]
  );
  res.json({ reviews: rows });
});

router.post('/relationships/:id/pastor-approve', requireAuth, async (req, res) => {
  const side = req.body?.side;
  const rel = await one(
    `SELECT * FROM relationships WHERE id = $1 AND state NOT IN ('confirmed','ended')`,
    [req.params.id]
  );
  if (!rel) return res.status(404).json({ error: '关系不存在' });
  if (!['user_a', 'user_b'].includes(side)) return res.status(400).json({ error: 'side 必须是 user_a 或 user_b' });
  if (!rel.user_a_confirmed || !rel.user_b_confirmed) return res.status(409).json({ error: '需双方先确认关系意向' });
  if (rel.user_a === req.user.id || rel.user_b === req.user.id) {
    return res.status(403).json({ error: '关系参与者不能审核自己的关系' });
  }

  const isSideA = side === 'user_a';
  const sideUserId = isSideA ? rel.user_a : rel.user_b;
  const sideApproved = isSideA ? rel.pastor_a_approved : rel.pastor_b_approved;
  const otherReviewerId = isSideA ? rel.pastor_b_approved_by : rel.pastor_a_approved_by;
  if (sideApproved) return res.status(409).json({ error: '该侧已经完成审核' });
  if (otherReviewerId === req.user.id) {
    return res.status(409).json({ error: '双方审核必须由不同人员完成' });
  }

  const isAdmin = req.user.role === 'admin';
  const endorsement = await one(
    `SELECT e.id, e.user_id, e.endorser_user_id, e.kind, e.state
       FROM endorsements e
       LEFT JOIN users reviewer ON reviewer.id = e.endorser_user_id
      WHERE e.user_id = $1
        AND e.state = 'verified'
        AND (
          $2::boolean
          OR (
            e.endorser_user_id = $3
            AND reviewer.email_verified = TRUE
            AND reviewer.is_banned = FALSE
            AND (
              e.kind = 'referrer'
              OR (
                reviewer.role = 'pastor'
                AND EXISTS (
                  SELECT 1 FROM pastor_certifications cert
                   WHERE cert.user_id = reviewer.id AND cert.state = 'approved'
                )
              )
            )
          )
        )
      ORDER BY (e.endorser_user_id = $3) DESC, e.verified_at DESC NULLS LAST, e.created_at DESC
      LIMIT 1`,
    [sideUserId, isAdmin, req.user.id]
  );
  if (!endorsement) {
    return res.status(403).json({ error: '你不是该侧已验证的牧者或引荐人' });
  }

  const updated = await one(
    `WITH updated AS (
       UPDATE relationships
          SET pastor_a_approved = pastor_a_approved OR $2::text = 'user_a',
              pastor_b_approved = pastor_b_approved OR $2::text = 'user_b',
              pastor_a_approved_by = CASE
                WHEN $2::text = 'user_a' THEN COALESCE(pastor_a_approved_by, $3)
                ELSE pastor_a_approved_by
              END,
              pastor_b_approved_by = CASE
                WHEN $2::text = 'user_b' THEN COALESCE(pastor_b_approved_by, $3)
                ELSE pastor_b_approved_by
              END,
              pastor_a_endorsement_id = CASE
                WHEN $2::text = 'user_a' THEN COALESCE(pastor_a_endorsement_id, $4)
                ELSE pastor_a_endorsement_id
              END,
              pastor_b_endorsement_id = CASE
                WHEN $2::text = 'user_b' THEN COALESCE(pastor_b_endorsement_id, $4)
                ELSE pastor_b_endorsement_id
              END,
              pastor_a_approved_at = CASE
                WHEN $2::text = 'user_a' THEN COALESCE(pastor_a_approved_at, now())
                ELSE pastor_a_approved_at
              END,
              pastor_b_approved_at = CASE
                WHEN $2::text = 'user_b' THEN COALESCE(pastor_b_approved_at, now())
                ELSE pastor_b_approved_at
              END,
              state = CASE
                WHEN (pastor_a_approved OR $2::text = 'user_a')
                 AND (pastor_b_approved OR $2::text = 'user_b')
                THEN 'confirmed'::relationship_state
                ELSE 'pastoral_review'::relationship_state
              END,
              confirmed_at = CASE
                WHEN (pastor_a_approved OR $2::text = 'user_a')
                 AND (pastor_b_approved OR $2::text = 'user_b')
                THEN COALESCE(confirmed_at, now())
                ELSE confirmed_at
              END
        WHERE id = $1
          AND state NOT IN ('confirmed', 'ended')
          AND user_a_confirmed = TRUE
          AND user_b_confirmed = TRUE
          AND CASE
            WHEN $2::text = 'user_a' THEN pastor_a_approved = FALSE AND pastor_b_approved_by IS DISTINCT FROM $3
            ELSE pastor_b_approved = FALSE AND pastor_a_approved_by IS DISTINCT FROM $3
          END
          AND EXISTS (
            SELECT 1 FROM endorsements eligible
             WHERE eligible.id = $4
               AND eligible.user_id = CASE WHEN $2::text = 'user_a' THEN relationships.user_a ELSE relationships.user_b END
               AND eligible.state = 'verified'
               AND ($5::boolean OR eligible.endorser_user_id = $3)
          )
        RETURNING *
     ), audited AS (
       INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, detail)
       SELECT $3, 'relationship.pastor_review', 'relationship', id,
              jsonb_build_object('side', $2::text, 'endorsement_id', $4)
         FROM updated
     )
     SELECT * FROM updated`,
    [rel.id, side, req.user.id, endorsement.id, isAdmin]
  );
  if (!updated) return res.status(409).json({ error: '关系审核状态已变化，请刷新后重试' });
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
