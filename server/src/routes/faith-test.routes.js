// 信仰知识测试 路由
import { Router } from 'express';
import { query, one, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { publicQuestions, grade } from '../lib/faith-questions.js';

const router = Router();

// 获取题目（不含答案）
router.get('/faith-test/questions', requireAuth, (_req, res) => {
  res.json({ questions: publicQuestions(), passThreshold: 15, total: 20 });
});

// 我的测试历史
router.get('/faith-test/status', requireAuth, async (req, res) => {
  const row = await one(
    `SELECT score, passed, attempt_no, created_at
       FROM faith_tests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [req.user.id]
  );
  res.json({ attempted: !!row, latest: row ?? null });
});

// 提交答卷（服务端评分，允许重考）
router.post('/faith-test/submit', requireAuth, async (req, res) => {
  const { answers } = req.body;
  if (!Array.isArray(answers) || answers.length !== 20) {
    return res.status(400).json({ error: '需提交 20 道题的答案' });
  }
  const { score, total, passed } = grade(answers);

  const prevCount = await one(
    `SELECT COUNT(*)::int AS n FROM faith_tests WHERE user_id = $1`,
    [req.user.id]
  );
  const attemptNo = (prevCount?.n ?? 0) + 1;

  await tx(async (db) => {
    await db.query(
      `INSERT INTO faith_tests (user_id, score, passed, answers, attempt_no)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, score, passed, JSON.stringify(answers), attemptNo]
    );
  });

  res.json({
    score, total, passed, attemptNo,
    message: passed
      ? `恭喜通过！答对 ${score}/${total} 题，已解锁匹配池资格。`
      : `本次答对 ${score}/${total} 题（通过线 15 题）。建议回到教会与牧者一起学习基要真理后再试。`,
  });
});

export default router;
