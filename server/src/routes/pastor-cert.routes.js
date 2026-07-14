import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { validateAdminActorStatus, writeAdminAudit } from '../lib/admin-audit.js';
import {
  isUuid,
  normalizePastorCertificationApplication,
  validatePastorCertificationApplicant,
  validatePastorCertificationReview,
} from '../lib/pastor-certification.js';

const router = Router();
const ADMIN_USER_OP_LOCK_KEY = 871406252;

function routeError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendRouteError(res, error) {
  if (error.status) return res.status(error.status).json({ error: error.message });
  console.error('[pastor-cert] 操作失败：', error.message);
  return res.status(500).json({ error: '牧者认证操作失败' });
}

router.post('/pastor-cert/apply', requireAuth, async (req, res) => {
  const normalized = normalizePastorCertificationApplication({
    churchName: req.body?.church_name,
    denomination: req.body?.denomination,
    contactEmail: req.body?.contact_email,
    ordinationInfo: req.body?.ordination_info,
    statement: req.body?.statement,
  });
  if (!normalized.ok) return res.status(400).json({ error: normalized.error });

  try {
    const row = await tx(async (db) => {
      const userResult = await db.query(
        'SELECT id, role, is_banned FROM users WHERE id = $1 FOR UPDATE',
        [req.user.id]
      );
      const applicantError = validatePastorCertificationApplicant(userResult.rows[0]);
      if (applicantError) throw routeError(403, applicantError);

      const result = await db.query(
        `INSERT INTO pastor_certifications
           (user_id, church_name, denomination, contact_email, supporting_docs, state)
         VALUES ($1, $2, $3, $4, $5::jsonb, 'pending')
         ON CONFLICT (user_id) WHERE state = 'pending' DO NOTHING
         RETURNING id`,
        [
          req.user.id,
          normalized.value.churchName,
          normalized.value.denomination,
          normalized.value.contactEmail,
          JSON.stringify(normalized.value.supportingDocs),
        ]
      );
      if (!result.rows[0]) throw routeError(409, '已有待审核的牧者认证申请');
      return result.rows[0];
    });
    res.status(201).json({ ok: true, id: row.id });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: '已有待审核的牧者认证申请' });
    return sendRouteError(res, error);
  }
});

router.get('/pastor-cert/mine', requireAuth, async (req, res) => {
  const row = await one(
    `SELECT id, church_name, denomination, contact_email, supporting_docs, state, created_at
       FROM pastor_certifications
      WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [req.user.id]
  );
  res.json({ certification: row ?? null });
});

router.get('/pastor-cert/applications', requireAuth, requireRole('admin'), async (_req, res) => {
  const { rows } = await query(
    `SELECT pc.id, pc.user_id, pc.church_name, pc.denomination, pc.contact_email,
            pc.supporting_docs, pc.state, pc.created_at,
            u.email, p.nickname
       FROM pastor_certifications pc
       JOIN users u ON u.id = pc.user_id
       LEFT JOIN profiles p ON p.user_id = pc.user_id
      ORDER BY pc.created_at DESC`
  );
  res.json({ applications: rows });
});

router.patch('/pastor-cert/applications/:id', requireAuth, requireRole('admin'), async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: '申请 ID 格式不正确' });
  const action = req.body?.action;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action 须为 approve 或 reject' });
  }
  const state = action === 'approve' ? 'approved' : 'rejected';

  try {
    const out = await tx(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock($1)', [ADMIN_USER_OP_LOCK_KEY]);
      const actor = await db.query(
        'SELECT id, role, is_banned FROM users WHERE id = $1 FOR UPDATE',
        [req.user.id]
      );
      const actorError = validateAdminActorStatus(actor.rows[0]);
      if (actorError) throw routeError(403, actorError);

      const certificationResult = await db.query(
        'SELECT * FROM pastor_certifications WHERE id = $1 FOR UPDATE',
        [req.params.id]
      );
      const certification = certificationResult.rows[0];
      if (!certification) throw routeError(404, '牧者认证申请不存在');

      const applicantResult = await db.query(
        'SELECT id, role, is_banned FROM users WHERE id = $1 FOR UPDATE',
        [certification.user_id]
      );
      const reviewError = validatePastorCertificationReview({
        actorId: req.user.id,
        certification,
        applicant: applicantResult.rows[0],
        action,
      });
      if (reviewError) {
        const status = certification.user_id === req.user.id ? 403 : 409;
        throw routeError(status, reviewError);
      }

      if (action === 'approve') {
        const promoted = await db.query(
          `UPDATE users SET role = 'pastor' WHERE id = $1 AND role = 'free' AND is_banned = FALSE
           RETURNING id`,
          [certification.user_id]
        );
        if (!promoted.rows[0]) throw routeError(409, '申请人账号状态已变化，请刷新后重试');
      }

      const updated = await db.query(
        `UPDATE pastor_certifications
            SET state = $2, reviewed_by = $3, reviewed_at = now()
          WHERE id = $1
          RETURNING *`,
        [certification.id, state, req.user.id]
      );
      await writeAdminAudit(db, {
        actorId: req.user.id,
        action: 'pastor_cert.review',
        targetType: 'pastor_certification',
        targetId: certification.id,
        detail: { action, state, user_id: certification.user_id },
      });
      return updated.rows[0];
    });
    res.json({ ok: true, certification: out });
  } catch (error) {
    return sendRouteError(res, error);
  }
});

export default router;
