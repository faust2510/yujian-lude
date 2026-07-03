// AI 咨询路由：严格知识库边界，超范围引导找牧者/专业帮助。
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { buildAiAnswer } from '../lib/ai-knowledge.js';

const router = Router();

// 提问（免费不限量，仅留痕用于改进知识库）
router.post('/ai/ask', requireAuth, async (req, res) => {
  const question = String(req.body?.question ?? '').trim();
  if (!question) return res.status(400).json({ error: '请输入问题' });
  const result = buildAiAnswer(question);
  await query(
    `INSERT INTO ai_consultations (user_id, question, answer, rag_sources, out_of_scope)
     VALUES ($1, $2, $3, $4, $5)`,
    [req.user.id, question, result.answer, JSON.stringify(result.sources), result.outOfScope]
  );
  res.json(result);
});

// 我的咨询历史
router.get('/ai/history', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT question, answer, out_of_scope, created_at
       FROM ai_consultations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [req.user.id]
  );
  res.json({ history: rows });
});

export default router;
