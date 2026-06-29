import { Router } from 'express';
import { query, one } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// 我的所有私聊通道
router.get('/chat/channels', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.user_a, c.user_b, c.opened_at,
            pa.nickname AS a_nickname, pb.nickname AS b_nickname,
            (SELECT body FROM chat_messages WHERE channel_id=c.id ORDER BY created_at DESC LIMIT 1) AS last_msg,
            (SELECT created_at FROM chat_messages WHERE channel_id=c.id ORDER BY created_at DESC LIMIT 1) AS last_at
       FROM chat_channels c
       JOIN profiles pa ON pa.user_id = c.user_a
       JOIN profiles pb ON pb.user_id = c.user_b
      WHERE c.user_a = $1 OR c.user_b = $1
      ORDER BY last_at DESC NULLS LAST, c.opened_at DESC`,
    [req.user.id]
  );
  const channels = rows.map(r => ({
    id: r.id,
    opened_at: r.opened_at,
    last_msg: r.last_msg,
    last_at: r.last_at,
    other_id: r.user_a === req.user.id ? r.user_b : r.user_a,
    other_nickname: r.user_a === req.user.id ? r.b_nickname : r.a_nickname,
  }));
  res.json({ channels });
});

// 某个通道的消息
router.get('/chat/channels/:id/messages', requireAuth, async (req, res) => {
  const ch = await one(
    `SELECT * FROM chat_channels WHERE id=$1 AND (user_a=$2 OR user_b=$2)`,
    [req.params.id, req.user.id]
  );
  if (!ch) return res.status(403).json({ error: '无权访问' });
  const { rows } = await query(
    `SELECT m.id, m.sender_id, p.nickname AS sender_nickname, m.body, m.created_at
       FROM chat_messages m JOIN profiles p ON p.user_id = m.sender_id
      WHERE m.channel_id = $1
      ORDER BY m.created_at DESC LIMIT 50`,
    [req.params.id]
  );
  res.json({ messages: rows.reverse() });
});

// 发送消息
router.post('/chat/channels/:id/messages', requireAuth, async (req, res) => {
  const text = req.body.body ?? req.body.text;
  if (!text?.trim()) return res.status(400).json({ error: '内容不能为空' });
  const ch = await one(
    `SELECT * FROM chat_channels WHERE id=$1 AND (user_a=$2 OR user_b=$2)`,
    [req.params.id, req.user.id]
  );
  if (!ch) return res.status(403).json({ error: '无权访问' });
  const msg = await one(
    `INSERT INTO chat_messages (channel_id, sender_id, body)
     VALUES ($1, $2, $3) RETURNING id, sender_id, body, created_at`,
    [req.params.id, req.user.id, text.trim()]
  );
  res.json({ message: msg });
});

export default router;
