// 牧者介绍信 路由（仅双方可见）
import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// 提交 / 更新我的牧者介绍信
router.put('/me/pastor-letter', requireAuth, async (req, res) => {
  const { pastor_name, pastor_contact, family_note, faith_note, spiritual_note, church_life_note } = req.body;
  if (!pastor_name || !pastor_contact) {
    return res.status(400).json({ error: '牧者姓名和联系方式为必填' });
  }
  await tx(async (db) => {
    await db.query(
      `INSERT INTO pastor_letters
         (user_id, pastor_name, pastor_contact, family_note, faith_note, spiritual_note, church_life_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE SET
         pastor_name=EXCLUDED.pastor_name, pastor_contact=EXCLUDED.pastor_contact,
         family_note=EXCLUDED.family_note, faith_note=EXCLUDED.faith_note,
         spiritual_note=EXCLUDED.spiritual_note, church_life_note=EXCLUDED.church_life_note,
         updated_at=now()`,
      [req.user.id, pastor_name, pastor_contact, family_note, faith_note, spiritual_note, church_life_note]
    );
  });
  res.json({ ok: true });
});

// 读取我的介绍信
router.get('/me/pastor-letter', requireAuth, async (req, res) => {
  const row = await one('SELECT * FROM pastor_letters WHERE user_id = $1', [req.user.id]);
  res.json({ letter: row ?? null });
});

// 读取匹配对象的介绍信（仅双方互有意向后可见）
router.get('/match/:targetId/pastor-letter', requireAuth, async (req, res) => {
  const { targetId } = req.params;
  // 检查双方是否互有意向（mutual intent）
  const mutual = await one(
    `SELECT 1 FROM matches a JOIN matches b
        ON a.user_id = b.target_id AND a.target_id = b.user_id
      WHERE a.user_id = $1 AND a.target_id = $2
        AND a.status IN ('intent_sent','under_review','approved')
        AND b.status IN ('intent_sent','under_review','approved')
      LIMIT 1`,
    [req.user.id, targetId]
  );
  if (!mutual) return res.status(403).json({ error: '仅双方互有意向后方可查看介绍信' });
  const row = await one(
    `SELECT pastor_name, family_note, faith_note, spiritual_note, church_life_note
       FROM pastor_letters WHERE user_id = $1 AND is_verified = TRUE`,
    [targetId]
  );
  res.json({ letter: row ?? null });
});

export default router;
