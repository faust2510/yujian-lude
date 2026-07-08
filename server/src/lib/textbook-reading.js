export async function listTextbooksForUser(db, userId) {
  const { rows } = await db.query(
    `SELECT t.slug,
            t.title,
            t.author,
            t.description,
            t.cover_image,
            COUNT(tc.id)::int AS chapter_count,
            COUNT(trp.chapter_id) FILTER (WHERE trp.completed = TRUE)::int AS completed_count
       FROM textbooks t
       LEFT JOIN textbook_chapters tc ON tc.textbook_id = t.id
       LEFT JOIN textbook_reading_progress trp
         ON trp.chapter_id = tc.id
        AND trp.user_id = $1
      WHERE t.visibility = 'login_required'
      GROUP BY t.id
      ORDER BY t.created_at, t.title`,
    [userId]
  );

  return rows.map((row) => ({
    ...row,
    progress_percent: row.chapter_count > 0 ? Math.round((row.completed_count / row.chapter_count) * 100) : 0,
  }));
}

export async function getTextbookDetailForUser(db, { slug, userId }) {
  const { rows } = await db.query(
    `SELECT t.id AS textbook_id,
            t.slug,
            t.title,
            t.author,
            t.description,
            t.cover_image,
            tc.chapter_index,
            tc.title AS chapter_title,
            tc.word_count,
            COALESCE(trp.completed, FALSE) AS completed
       FROM textbooks t
       JOIN textbook_chapters tc ON tc.textbook_id = t.id
       LEFT JOIN textbook_reading_progress trp
         ON trp.chapter_id = tc.id
        AND trp.user_id = $2
      WHERE t.slug = $1
        AND t.visibility = 'login_required'
      ORDER BY tc.chapter_index`,
    [slug, userId]
  );

  if (rows.length === 0) return null;
  const first = rows[0];
  return {
    textbook: {
      id: first.textbook_id,
      slug: first.slug,
      title: first.title,
      author: first.author,
      description: first.description,
      cover_image: first.cover_image,
    },
    chapters: rows.map(({ chapter_index, chapter_title, word_count, completed }) => ({
      chapter_index,
      chapter_title,
      word_count,
      completed,
    })),
  };
}

export async function getChapterForUser(db, { slug, chapterIndex, userId }) {
  const { rows } = await db.query(
    `SELECT tc.id,
            tc.textbook_id,
            t.slug,
            t.title AS textbook_title,
            t.author,
            tc.chapter_index,
            tc.title,
            tc.body_html,
            tc.word_count,
            COALESCE(trp.completed, FALSE) AS completed
       FROM textbooks t
       JOIN textbook_chapters tc ON tc.textbook_id = t.id
       LEFT JOIN textbook_reading_progress trp
         ON trp.chapter_id = tc.id
        AND trp.user_id = $3
      WHERE t.slug = $1
        AND tc.chapter_index = $2
        AND t.visibility = 'login_required'
      LIMIT 1`,
    [slug, chapterIndex, userId]
  );
  const chapter = rows[0];
  if (!chapter) return null;

  const siblings = await db.query(
    `SELECT chapter_index, title
       FROM textbook_chapters
      WHERE textbook_id = $1
      ORDER BY chapter_index`,
    [chapter.textbook_id]
  );
  const index = siblings.rows.findIndex((row) => row.chapter_index === chapter.chapter_index);
  const prev = index > 0 ? siblings.rows[index - 1] : null;
  const next = index >= 0 && index < siblings.rows.length - 1 ? siblings.rows[index + 1] : null;

  return {
    textbook: {
      slug: chapter.slug,
      title: chapter.textbook_title,
      author: chapter.author,
    },
    chapter: {
      id: chapter.id,
      chapter_index: chapter.chapter_index,
      title: chapter.title,
      body_html: chapter.body_html,
      word_count: chapter.word_count,
      completed: chapter.completed,
      prev: prev ? { index: prev.chapter_index, title: prev.title } : null,
      next: next ? { index: next.chapter_index, title: next.title } : null,
    },
  };
}

export async function markChapterRead(db, { slug, chapterIndex, userId }) {
  const data = await getChapterForUser(db, { slug, chapterIndex, userId });
  if (!data) return null;
  await db.query(
    `INSERT INTO textbook_reading_progress (user_id, chapter_id, completed, completed_at, last_read_at)
     VALUES ($1, $2, TRUE, now(), now())
     ON CONFLICT (user_id, chapter_id)
     DO UPDATE SET completed = TRUE, completed_at = COALESCE(textbook_reading_progress.completed_at, now()), last_read_at = now()`,
    [userId, data.chapter.id]
  );
  return { ok: true };
}

export async function readingsForCourseUnits(db, { courseId, userId }) {
  const { rows } = await db.query(
    `SELECT cur.course_unit_id,
            t.slug AS textbook_slug,
            t.title AS textbook_title,
            tc.chapter_index,
            tc.title AS chapter_title,
            cur.required,
            COALESCE(trp.completed, FALSE) AS completed
       FROM course_unit_readings cur
       JOIN course_units cu ON cu.id = cur.course_unit_id
       JOIN textbook_chapters tc ON tc.id = cur.chapter_id
       JOIN textbooks t ON t.id = tc.textbook_id
       LEFT JOIN textbook_reading_progress trp
         ON trp.chapter_id = tc.id
        AND trp.user_id = $2
      WHERE cu.course_id = $1
      ORDER BY cu.unit_index, cur.sort_order, tc.chapter_index`,
    [courseId, userId]
  );
  const grouped = new Map();
  for (const row of rows) {
    const list = grouped.get(row.course_unit_id) || [];
    list.push(row);
    grouped.set(row.course_unit_id, list);
  }
  return grouped;
}

export async function incompleteRequiredReadings(db, { unitId, userId }) {
  const { rows } = await db.query(
    `SELECT t.slug AS textbook_slug,
            t.title AS textbook_title,
            tc.chapter_index,
            tc.title AS chapter_title,
            cur.required
       FROM course_unit_readings cur
       JOIN textbook_chapters tc ON tc.id = cur.chapter_id
       JOIN textbooks t ON t.id = tc.textbook_id
       LEFT JOIN textbook_reading_progress trp
         ON trp.chapter_id = tc.id
        AND trp.user_id = $2
      WHERE cur.course_unit_id = $1
        AND cur.required = TRUE
        AND COALESCE(trp.completed, FALSE) = FALSE
      ORDER BY cur.sort_order, tc.chapter_index`,
    [unitId, userId]
  );
  return rows;
}
