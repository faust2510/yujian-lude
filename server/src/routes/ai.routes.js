// AI 咨询路由：严格知识库边界，超范围引导找牧者/专业帮助。
import { Router } from 'express';
import { query, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { buildAiAnswer } from '../lib/ai-knowledge.js';

const router = Router();
const AI_QUESTION_MAX_LENGTH = 2000;
const AI_RATE_LIMIT = 10;
const AI_RATE_WINDOW_MS = 60_000;

// 提问（免费使用；按用户限频并留痕用于改进知识库）
router.post('/ai/ask', requireAuth, async (req, res) => {
  const question = String(req.body?.question ?? '').trim();
  if (!question) return res.status(400).json({ error: '请输入问题' });
  if (question.length > AI_QUESTION_MAX_LENGTH) {
    return res.status(400).json({ error: `问题不能超过 ${AI_QUESTION_MAX_LENGTH} 个字符` });
  }
  const result = await tx(async (db) => {
    await db.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`ai-consultation:${req.user.id}`]
    );
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count
         FROM ai_consultations
        WHERE user_id = $1 AND created_at >= $2`,
      [req.user.id, new Date(Date.now() - AI_RATE_WINDOW_MS)]
    );
    if (Number(rows[0]?.count || 0) >= AI_RATE_LIMIT) return null;

    const answer = buildAiAnswer(question);
    await db.query(
      `INSERT INTO ai_consultations (user_id, question, answer, rag_sources, out_of_scope)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, question, answer.answer, JSON.stringify(answer.sources), answer.outOfScope]
    );
    return answer;
  });
  if (!result) return res.status(429).json({ error: '提问过于频繁，请稍后再试' });
  res.json(result);
});

// 我的咨询历史
router.get('/ai/history', requireAuth, async (req, res) => {
  const { rows } = await query(
    `SELECT user_id, question, answer, out_of_scope, created_at
       FROM ai_consultations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [req.user.id]
  );
  const history = rows
    .filter((row) => row.user_id === req.user.id)
    .map(({ question, answer, out_of_scope, created_at }) => ({
      question,
      answer,
      out_of_scope,
      created_at,
    }));
  res.json({ history });
});

export default router;
