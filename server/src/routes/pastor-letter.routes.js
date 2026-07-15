// 牧者介绍信 路由（仅双方可见）
import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { validateAdminActorStatus, writeAdminAudit } from '../lib/admin-audit.js';
import {
  isUuid,
  normalizePastorLetterInput,
  normalizePastorLetterReviewAction,
  normalizePastorLetterReviewVersion,
  validatePastorLetterReview,
} from '../lib/pastor-letter.js';

const router = Router();
const ADMIN_USER_OP_LOCK_KEY = 871406252;

function routeError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendRouteError(res, error) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error('[pastor-letter] 操作失败：', error.message);
  return res.status(500).json({ error: '牧者介绍信操作失败' });
}

function publicPastorLetter(row) {
  if (!row) return null;
  return {
    pastor_name: row.pastor_name,
    family_note: row.family_note,
    faith_note: row.faith_note,
    spiritual_note: row.spiritual_note,
    church_life_note: row.church_life_note,
    verified_at: row.verified_at,
  };
}

function ownPastorLetter(row) {
  if (!row) return null;
  return {
    id: row.id,
    pastor_name: row.pastor_name,
    pastor_contact: row.pastor_contact,
    family_note: row.family_note,
    faith_note: row.faith_note,
    spiritual_note: row.spiritual_note,
    church_life_note: row.church_life_note,
    is_verified: row.is_verified,
    verified_at: row.verified_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// 提交 / 更新我的牧者介绍信
router.put('/me/pastor-letter', requireAuth, async (req, res) => {
  const normalized = normalizePastorLetterInput({
    pastorName: req.body?.pastor_name,
    pastorContact: req.body?.pastor_contact,
    familyNote: req.body?.family_note,
    faithNote: req.body?.faith_note,
    spiritualNote: req.body?.spiritual_note,
    churchLifeNote: req.body?.church_life_note,
  });
  if (!normalized.ok) return res.status(400).json({ error: normalized.error });

  try {
    const letter = await tx(async (db) => {
      const result = await db.query(
        `INSERT INTO pastor_letters
           (user_id, pastor_name, pastor_contact, family_note, faith_note,
            spiritual_note, church_life_note, is_verified, verified_by, verified_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,NULL,NULL)
         ON CONFLICT (user_id) DO UPDATE SET
           pastor_name=EXCLUDED.pastor_name,
           pastor_contact=EXCLUDED.pastor_contact,
           family_note=EXCLUDED.family_note,
           faith_note=EXCLUDED.faith_note,
           spiritual_note=EXCLUDED.spiritual_note,
           church_life_note=EXCLUDED.church_life_note,
           is_verified=CASE WHEN
             ROW(pastor_letters.pastor_name, pastor_letters.pastor_contact,
                 pastor_letters.family_note, pastor_letters.faith_note,
                 pastor_letters.spiritual_note, pastor_letters.church_life_note)
             IS DISTINCT FROM
             ROW(EXCLUDED.pastor_name, EXCLUDED.pastor_contact,
                 EXCLUDED.family_note, EXCLUDED.faith_note,
                 EXCLUDED.spiritual_note, EXCLUDED.church_life_note)
             THEN FALSE ELSE pastor_letters.is_verified END,
           verified_by=CASE WHEN
             ROW(pastor_letters.pastor_name, pastor_letters.pastor_contact,
                 pastor_letters.family_note, pastor_letters.faith_note,
                 pastor_letters.spiritual_note, pastor_letters.church_life_note)
             IS DISTINCT FROM
             ROW(EXCLUDED.pastor_name, EXCLUDED.pastor_contact,
                 EXCLUDED.family_note, EXCLUDED.faith_note,
                 EXCLUDED.spiritual_note, EXCLUDED.church_life_note)
             THEN NULL ELSE pastor_letters.verified_by END,
           verified_at=CASE WHEN
             ROW(pastor_letters.pastor_name, pastor_letters.pastor_contact,
                 pastor_letters.family_note, pastor_letters.faith_note,
                 pastor_letters.spiritual_note, pastor_letters.church_life_note)
             IS DISTINCT FROM
             ROW(EXCLUDED.pastor_name, EXCLUDED.pastor_contact,
                 EXCLUDED.family_note, EXCLUDED.faith_note,
                 EXCLUDED.spiritual_note, EXCLUDED.church_life_note)
             THEN NULL ELSE pastor_letters.verified_at END,
           updated_at=CASE WHEN
             ROW(pastor_letters.pastor_name, pastor_letters.pastor_contact,
                 pastor_letters.family_note, pastor_letters.faith_note,
                 pastor_letters.spiritual_note, pastor_letters.church_life_note)
             IS DISTINCT FROM
             ROW(EXCLUDED.pastor_name, EXCLUDED.pastor_contact,
                 EXCLUDED.family_note, EXCLUDED.faith_note,
                 EXCLUDED.spiritual_note, EXCLUDED.church_life_note)
             THEN clock_timestamp() ELSE pastor_letters.updated_at END
         RETURNING id, pastor_name, pastor_contact, family_note, faith_note,
                   spiritual_note, church_life_note, is_verified, verified_at,
                   created_at, updated_at`,
        [
          req.user.id,
          normalized.value.pastorName,
          normalized.value.pastorContact,
          normalized.value.familyNote,
          normalized.value.faithNote,
          normalized.value.spiritualNote,
          normalized.value.churchLifeNote,
        ]
      );
      return result.rows[0];
    });
    res.json({ ok: true, letter: ownPastorLetter(letter) });
  } catch (error) {
    return sendRouteError(res, error);
  }
});

// 读取我的介绍信
router.get('/me/pastor-letter', requireAuth, async (req, res) => {
  const row = await one(
    `SELECT id, pastor_name, pastor_contact, family_note, faith_note,
            spiritual_note, church_life_note, is_verified, verified_at, created_at, updated_at
       FROM pastor_letters WHERE user_id = $1`,
    [req.user.id]
  );
  res.json({ letter: row ?? null });
});

router.get('/pastor-letters', requireAuth, requireRole('admin'), async (req, res) => {
  const page = Number(req.query.page ?? 1);
  if (!Number.isInteger(page) || page < 1) {
    return res.status(400).json({ error: 'page 须为正整数' });
  }
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  const totalRow = await one('SELECT COUNT(*)::int AS total FROM pastor_letters');
  const { rows } = await query(
    `SELECT l.id, l.user_id, l.pastor_name, l.pastor_contact, l.family_note,
            l.faith_note, l.spiritual_note, l.church_life_note, l.is_verified,
            l.verified_by, l.verified_at, l.created_at, l.updated_at::text AS updated_at,
            u.email, p.nickname, verifier.email AS verifier_email,
            verifier_profile.nickname AS verifier_nickname
       FROM pastor_letters l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN profiles p ON p.user_id = l.user_id
       LEFT JOIN users verifier ON verifier.id = l.verified_by
       LEFT JOIN profiles verifier_profile ON verifier_profile.user_id = l.verified_by
      ORDER BY l.is_verified ASC, l.updated_at DESC, l.id DESC
      LIMIT $1 OFFSET $2`,
    [pageSize, offset]
  );
  res.json({ letters: rows, total: totalRow?.total || 0, page, pageSize });
});

router.patch('/pastor-letters/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: '介绍信 ID 格式不正确' });
  const nextVerified = normalizePastorLetterReviewAction(req.body?.action);
  if (nextVerified === null) return res.status(400).json({ error: 'action 须为 approve 或 revoke' });
  const expectedUpdatedAt = normalizePastorLetterReviewVersion(req.body?.updated_at);
  if (!expectedUpdatedAt) return res.status(400).json({ error: '缺少有效的介绍信内容版本' });

  try {
    const letter = await tx(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_USER_OP_LOCK_KEY]);
      const actor = await db.query(
        'SELECT id, role, is_banned FROM users WHERE id = $1 FOR UPDATE',
        [req.user.id]
      );
      const actorError = validateAdminActorStatus(actor.rows[0]);
      if (actorError) throw routeError(403, actorError);

      const letterResult = await db.query(
        'SELECT *, updated_at::text AS updated_at_version FROM pastor_letters WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      const current = letterResult.rows[0];
      if (!current) throw routeError(404, '牧者介绍信不存在');
      const reviewError = validatePastorLetterReview({
        actorId: req.user.id,
        letter: current,
        nextVerified,
        expectedUpdatedAt,
      });
      if (reviewError) {
        const status = String(current.user_id) === String(req.user.id) ? 403 : 409;
        throw routeError(status, reviewError);
      }

      const updated = await db.query(
        `UPDATE pastor_letters
            SET is_verified = $2,
                verified_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END,
                verified_at = CASE WHEN $2 THEN now() ELSE NULL END,
                updated_at = clock_timestamp()
          WHERE id = $1
            AND updated_at = $4::timestamptz
          RETURNING *`,
        [current.id, nextVerified, req.user.id, expectedUpdatedAt]
      );
      if (!updated.rows[0]) throw routeError(409, '牧者介绍信内容已更新，请刷新后重新核验');
      await writeAdminAudit(db, {
        actorId: req.user.id,
        action: 'pastor_letter.review',
        targetType: 'pastor_letter',
        targetId: current.id,
        detail: { verified: nextVerified, user_id: current.user_id },
      });
      return updated.rows[0];
    });
    res.json({ ok: true, letter });
  } catch (error) {
    return sendRouteError(res, error);
  }
});

// 读取匹配对象的介绍信（仅双方互有意向后可见）
router.get('/match/:targetId/pastor-letter', requireAuth, async (req, res) => {
  const { targetId } = req.params;
  if (!isUuid(targetId)) return res.status(400).json({ error: '匹配对象不存在' });
  // 检查双方是否互有意向（mutual intent）
  const mutual = await one(
    `SELECT 1 FROM matches a JOIN matches b
        ON a.user_id = b.target_id AND a.target_id = b.user_id
      WHERE a.user_id = $1 AND a.target_id = $2
        AND a.status IN ('intent_sent','matched','under_review','approved')
        AND b.status IN ('intent_sent','matched','under_review','approved')
      LIMIT 1`,
    [req.user.id, targetId]
  );
  if (!mutual) return res.status(403).json({ error: '仅双方互有意向后方可查看介绍信' });
  const row = await one(
    `SELECT pastor_name, family_note, faith_note, spiritual_note, church_life_note, verified_at
       FROM pastor_letters WHERE user_id = $1 AND is_verified = TRUE`,
    [targetId]
  );
  res.json({ letter: publicPastorLetter(row) });
});

export default router;
