import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  getChapterForUser,
  getTextbookDetailForUser,
  listTextbooksForUser,
  markChapterRead,
} from '../lib/textbook-reading.js';

const defaultDb = { query };

function validateChapterIndex(req, res, next) {
  const chapterIndex = Number(req.params.index);
  if (!Number.isInteger(chapterIndex) || chapterIndex < 1) {
    return res.status(400).json({ error: '章节序号必须是正整数' });
  }
  req.chapterIndex = chapterIndex;
  next();
}

export function createTextbooksRouter({ db = defaultDb } = {}) {
  const router = Router();

  router.get('/textbooks', requireAuth, async (req, res) => {
    const textbooks = await listTextbooksForUser(db, req.user.id);
    res.json({ textbooks });
  });

  router.get('/textbooks/:slug', requireAuth, async (req, res) => {
    const detail = await getTextbookDetailForUser(db, { slug: req.params.slug, userId: req.user.id });
    if (!detail) return res.status(404).json({ error: '教材不存在' });
    return res.json(detail);
  });

  router.get('/textbooks/:slug/chapters/:index', validateChapterIndex, requireAuth, async (req, res) => {
    const data = await getChapterForUser(db, {
      slug: req.params.slug,
      chapterIndex: req.chapterIndex,
      userId: req.user.id,
    });
    if (!data) return res.status(404).json({ error: '章节不存在' });
    return res.json(data);
  });

  router.post('/textbooks/:slug/chapters/:index/read', validateChapterIndex, requireAuth, async (req, res) => {
    const out = await markChapterRead(db, {
      slug: req.params.slug,
      chapterIndex: req.chapterIndex,
      userId: req.user.id,
    });
    if (!out) return res.status(404).json({ error: '章节不存在' });
    return res.json(out);
  });

  return router;
}

export default createTextbooksRouter();
