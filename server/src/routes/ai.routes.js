// AI 咨询 路由 —— 对所有人完全免费、不限量；严格 RAG（只答知识库内，超范围引导找牧者）
// MVP：知识库检索为 stub，预留 ragRetrieve 接口；上线时接 ChromaDB + 大模型。
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

// 严格 RAG 检索占位：上线接入向量库（改革宗婚姻神学 + 圣经辅导 + 婚前辅导 + 约会智慧）
async function ragRetrieve(question) {
  // TODO: 接 ChromaDB，返回 {chunks:[{text,source}], hit:boolean}
  return { chunks: [], hit: false };
}

function buildAnswer(question, retrieved) {
  if (!retrieved.hit) {
    return {
      answer:
        '这个问题超出了我现在的辅导范围。建议你带着它去和你的牧者或属灵长辈面谈——有些问题需要认识你的人、在祷告中陪你一起寻求答案。',
      outOfScope: true,
      sources: [],
    };
  }
  // 命中知识库时，基于 chunks 组织回答（上线接大模型）
  return {
    answer: retrieved.chunks.map((c) => c.text).join('\n\n'),
    outOfScope: false,
    sources: retrieved.chunks.map((c) => c.source),
  };
}

// 提问（免费不限量，仅留痕用于改进知识库）
router.post('/ai/ask', requireAuth, async (req, res) => {
  const question = String(req.body?.question ?? '').trim();
  if (!question) return res.status(400).json({ error: '请输入问题' });
  const retrieved = await ragRetrieve(question);
  const result = buildAnswer(question, retrieved);
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
