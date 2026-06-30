import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { writeAdminAudit } from '../lib/admin-audit.js';

const router = Router();

router.post('/pastor-cert/apply', requireAuth, async (req, res) => {
  const { church_name, denomination, contact_email, statement } = req.body;
  if (!church_name || !contact_email) return res.status(400).json({ error: '教会和联系方式为必填' });
  try {
    const row = await one(
      `INSERT INTO pastor_certifications (user_id, church_name, denomination, contact_email, supporting_docs, state)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
      [req.user.id, church_name, denomination || null, contact_email, statement ? { statement } : null]
    );
    res.json({ ok: true, id: row.id });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: '已有申请' });
    throw e;
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
  const { action } = req.body;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action 须为 approve 或 reject' });
  }
  const state = action === 'approve' ? 'approved' : 'rejected';

  const out = await tx(async (db) => {
    const { rows } = await db.query(
      `UPDATE pastor_certifications
          SET state = $1, reviewed_by = $2, reviewed_at = now()
        WHERE id = $3 AND state = 'pending'
        RETURNING user_id`,
      [state, req.user.id, req.params.id]
    );
    if (!rows[0]) return null;
    if (action === 'approve') {
      await db.query(`UPDATE users SET role = 'pastor' WHERE id = $1`, [rows[0].user_id]);
    }
    await writeAdminAudit(db, {
      actorId: req.user.id,
      action: 'pastor_cert.review',
      targetType: 'pastor_certification',
      targetId: req.params.id,
      detail: { action, state, user_id: rows[0].user_id },
    });
    return rows[0];
  });
  if (!out) return res.status(404).json({ error: '申请不存在或已处理' });
  res.json({ ok: true });
});

export default router;
