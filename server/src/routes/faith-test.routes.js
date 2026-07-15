// 信仰知识测试 路由
import { Router } from 'express';
import { one, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { publicQuestions, grade, isValidAnswerSet } from '../lib/faith-questions.js';

const defaultDb = { one, tx };

export function createFaithTestRouter({ db = defaultDb } = {}) {
  const router = Router();

  // 获取题目（不含答案）
  router.get('/faith-test/questions', requireAuth, (_req, res) => {
    res.json({ questions: publicQuestions(), passThreshold: 15, total: 20 });
  });

  // 我的测试历史
  router.get('/faith-test/status', requireAuth, async (req, res) => {
    const [row, qualification] = await Promise.all([
      db.one(
        `SELECT score, passed, attempt_no, created_at
           FROM faith_tests WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [req.user.id]
      ),
      db.one(
        `SELECT EXISTS(
           SELECT 1 FROM faith_tests WHERE user_id = $1 AND passed = TRUE
         ) AS qualified`,
        [req.user.id]
      ),
    ]);
    res.json({ attempted: !!row, latest: row ?? null, qualified: !!qualification?.qualified });
  });

  // 提交答卷（服务端评分，允许重考）
  router.post('/faith-test/submit', requireAuth, async (req, res) => {
    const { answers } = req.body;
    if (!isValidAnswerSet(answers)) {
      return res.status(400).json({ error: '需提交 20 道题的答案' });
    }
    const { score, total, passed } = grade(answers);

    const { attemptNo, qualified } = await db.tx(async (transaction) => {
      await transaction.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
        [req.user.id]
      );
      const { rows: attemptRows } = await transaction.query(
        `SELECT COALESCE(MAX(attempt_no), 0)::int + 1 AS next_attempt_no
           FROM faith_tests WHERE user_id = $1`,
        [req.user.id]
      );
      const attemptNo = attemptRows[0].next_attempt_no;
      await transaction.query(
        `INSERT INTO faith_tests (user_id, score, passed, answers, attempt_no)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, score, passed, JSON.stringify(answers), attemptNo]
      );
      const { rows: qualificationRows } = await transaction.query(
        `SELECT COALESCE(BOOL_OR(passed), FALSE) AS qualified
           FROM faith_tests WHERE user_id = $1`,
        [req.user.id]
      );
      return { attemptNo, qualified: !!qualificationRows[0]?.qualified };
    });

    res.json({
      score, total, passed, qualified, attemptNo,
      message: passed
        ? `恭喜通过！答对 ${score}/${total} 题，已解锁匹配池资格。`
        : qualified
          ? `本次答对 ${score}/${total} 题（通过线 15 题），你此前已通过，匹配池资格继续保留。`
        : `本次答对 ${score}/${total} 题（通过线 15 题）。建议回到教会与牧者一起学习基要真理后再试。`,
    });
  });

  return router;
}

export default createFaithTestRouter();
