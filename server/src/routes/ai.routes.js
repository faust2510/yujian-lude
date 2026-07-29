// AI 教导路由：仅基于已发布、已审核的课程单元生成回答。
import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import { config, isProd } from '../config.js';
import { answerWithTeachingSources, buildDevelopmentTeachingAnswer, buildTeachingPrompt, teachingSearchTerms } from '../lib/ai-teaching.js';
import { isAiQuestionOutOfScope } from '../lib/ai-knowledge.js';

const defaultDb = { query };
const ESCALATION_ANSWER = '这个问题超出了平台 AI 咨询的安全范围。请尽快联系你的牧者、属灵长辈，必要时联系当地专业机构或紧急服务。';

async function findPublishedTeachingSources(db, question) {
  const terms = teachingSearchTerms(question);
  if (!terms.length) return [];
  const { rows } = await db.query(
    `SELECT * FROM (
       SELECT concat(c.id::text, ':', cu.unit_index) AS id, c.title, cu.title AS chapter,
              concat('第 ', cu.unit_index, ' 课') AS location,
              left(regexp_replace(cu.material::text, '[{}\"]', '', 'g'), 2400) AS text, c.updated_at
         FROM courses c JOIN course_units cu ON cu.course_id = c.id
        WHERE c.is_published = TRUE AND c.publication_state = 'published' AND c.ai_eligible = TRUE
          AND cu.material::text ILIKE ANY($1::text[])
       UNION ALL
       SELECT concat('material:', m.id::text) AS id, c.title, m.original_name AS chapter,
              '已确认教材附件' AS location, left(m.extracted_text, 2400) AS text, c.updated_at
         FROM course_material_uploads m JOIN courses c ON c.id = m.course_id
        WHERE c.is_published = TRUE AND c.publication_state = 'published' AND c.ai_eligible = TRUE
          AND m.extraction_state = 'confirmed' AND m.extracted_text ILIKE ANY($1::text[])
     ) teaching_sources
     ORDER BY updated_at DESC LIMIT 3`,
    [terms.map((term) => `%${term}%`)],
  );
  return rows.filter((row) => row.text?.trim());
}

async function reserveDailyAiUse(db, userId, limit) {
  const { rows } = await db.query(
    `INSERT INTO ai_daily_usage (user_id, usage_date, request_count)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (user_id, usage_date) DO UPDATE SET request_count = ai_daily_usage.request_count + 1
       WHERE ai_daily_usage.request_count < $2
     RETURNING request_count`,
    [userId, limit],
  );
  if (!rows[0]) return null;
  return { used: rows[0].request_count, remainingToday: Math.max(0, limit - rows[0].request_count) };
}

async function callCompatibleModel({ question, sources, fetchImpl = fetch }) {
  if (!config.aiBaseUrl || !config.aiApiKey || !config.aiModel) {
    if (!isProd || config.aiTestMode) return buildDevelopmentTeachingAnswer(sources);
    throw Object.assign(new Error('AI 教导助手尚未配置'), { status: 503 });
  }
  const response = await fetchImpl(`${config.aiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.aiApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.aiModel,
      temperature: 0.2,
      messages: [{ role: 'user', content: buildTeachingPrompt({ question, sources }) }],
    }),
  });
  if (!response.ok) throw Object.assign(new Error('AI 教导助手暂时不可用'), { status: 503 });
  const body = await response.json();
  return body?.choices?.[0]?.message?.content || '';
}

export function createAiRouter({ db = defaultDb, generate = callCompatibleModel, dailyLimit = config.aiDailyLimit } = {}) {
  const router = Router();

  router.post('/ai/ask', requireAuth, async (req, res) => {
    const question = String(req.body?.question ?? '').trim();
    if (!question) return res.status(400).json({ error: '请输入问题' });
    if (question.length > 1200) return res.status(400).json({ error: '问题不能超过 1200 个字符' });
    if (isAiQuestionOutOfScope(question)) {
      await db.query(
        `INSERT INTO ai_consultations (user_id, question, answer, rag_sources, citations, out_of_scope)
         VALUES ($1, $2, $3, '[]'::jsonb, '[]'::jsonb, TRUE)`,
        [req.user.id, question, ESCALATION_ANSWER],
      );
      return res.json({ answer: ESCALATION_ANSWER, outOfScope: true, citations: [], remainingToday: dailyLimit });
    }
    try {
      const sources = await findPublishedTeachingSources(db, question);
      const result = await answerWithTeachingSources({ question, sources, generate });
      if (result.outOfScope) {
        await db.query(
          `INSERT INTO ai_consultations (user_id, question, answer, rag_sources, citations, out_of_scope)
           VALUES ($1, $2, $3, '[]'::jsonb, '[]'::jsonb, TRUE)`,
          [req.user.id, question, result.answer],
        );
        return res.json({ ...result, remainingToday: dailyLimit });
      }
      const usage = await reserveDailyAiUse(db, req.user.id, dailyLimit);
      if (!usage) return res.status(429).json({ error: '今日 AI 教导助手额度已用完，请明天再来。' });
      await db.query(
        `INSERT INTO ai_consultations (user_id, question, answer, rag_sources, citations, model_name, out_of_scope)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, FALSE)`,
        [req.user.id, question, result.answer, JSON.stringify(sources), JSON.stringify(result.citations), config.aiModel || null],
      );
      return res.json({ ...result, sources: result.citations, ...usage });
    } catch (error) {
      if (error.status === 503) return res.status(503).json({ error: 'AI 教导助手暂时不可用，请稍后重试或联系牧者。' });
      console.error('[ai:ask]', error);
      return res.status(500).json({ error: '咨询失败，请稍后重试' });
    }
  });

  router.get('/ai/history', requireAuth, async (req, res) => {
    const { rows } = await db.query(
      `SELECT question, answer, citations, out_of_scope, created_at
         FROM ai_consultations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [req.user.id],
    );
    res.json({ history: rows });
  });

  return router;
}

export { findPublishedTeachingSources, reserveDailyAiUse };
export default createAiRouter();
