export function distributeChapterIndexes(chapterCount, unitCount) {
  const chapters = Math.max(0, Number(chapterCount) || 0);
  const units = Math.max(0, Number(unitCount) || 0);
  if (units === 0) return [];
  if (chapters === 0) return Array.from({ length: units }, () => []);

  const buckets = Array.from({ length: units }, () => []);
  for (let chapter = 1; chapter <= chapters; chapter += 1) {
    let unitIndex = chapter - 1;
    if (chapters > units && chapter === 2) unitIndex = 0;
    else if (chapters > units && chapter > 2) unitIndex = Math.min(units - 1, chapter - 2);
    buckets[Math.min(unitIndex, units - 1)].push(chapter);
  }
  return buckets;
}

const MEANING_OF_MARRIAGE_COURSE_SLUG = 'keller-meaning-of-marriage';
const MEANING_OF_MARRIAGE_TEXTBOOK_SLUG = 'meaning-of-marriage';
const MEANING_OF_MARRIAGE_EXCLUDED_TITLES = new Set(['扉页', '目录', '致谢', '注释', '版权页']);

function normalizedTitle(title) {
  return String(title || '').replace(/\s+/g, ' ').trim();
}

function meaningOfMarriageChapterIndexes(chapters) {
  return chapters
    .filter((chapter) => !MEANING_OF_MARRIAGE_EXCLUDED_TITLES.has(normalizedTitle(chapter.title)))
    .map((chapter) => chapter.chapter_index);
}

export function planCourseChapterDistribution({ courseSlug, textbookSlug, chapters, unitCount }) {
  const rows = Array.isArray(chapters) ? chapters : [];
  const units = Math.max(0, Number(unitCount) || 0);

  if (courseSlug === MEANING_OF_MARRIAGE_COURSE_SLUG && textbookSlug === MEANING_OF_MARRIAGE_TEXTBOOK_SLUG) {
    const courseChapterIndexes = meaningOfMarriageChapterIndexes(rows);
    if (courseChapterIndexes.length > 0) {
      return distributeChapterIndexes(courseChapterIndexes.length, units).map((bucket) =>
        bucket.map((chapterOffset) => courseChapterIndexes[chapterOffset - 1]).filter(Boolean)
      );
    }
  }

  return distributeChapterIndexes(rows.length, units);
}

export async function bindTextbookToCourse(db, { textbookId, courseSlug }) {
  if (!courseSlug) return 0;

  const unitsResult = await db.query(
    `SELECT cu.id, cu.unit_index
       FROM course_units cu
       JOIN courses c ON c.id = cu.course_id
      WHERE c.slug = $1
      ORDER BY cu.unit_index`,
    [courseSlug]
  );
  const chaptersResult = await db.query(
    `SELECT tc.id, tc.chapter_index, tc.title, t.slug AS textbook_slug
       FROM textbook_chapters tc
       JOIN textbooks t ON t.id = tc.textbook_id
      WHERE tc.textbook_id = $1
      ORDER BY tc.chapter_index`,
    [textbookId]
  );

  const units = unitsResult.rows;
  const chapters = chaptersResult.rows;
  const chapterByIndex = new Map(chapters.map((chapter) => [chapter.chapter_index, chapter]));
  const distribution = planCourseChapterDistribution({
    courseSlug,
    textbookSlug: chapters[0]?.textbook_slug,
    chapters,
    unitCount: units.length,
  });

  await db.query(
    `DELETE FROM course_unit_readings cur
      USING course_units cu, textbook_chapters tc
      WHERE cur.course_unit_id = cu.id
        AND cur.chapter_id = tc.id
        AND tc.textbook_id = $1
        AND cu.id = ANY($2::uuid[])`,
    [textbookId, units.map((unit) => unit.id)]
  );

  let inserted = 0;
  for (const [unitOffset, chapterIndexes] of distribution.entries()) {
    const unit = units[unitOffset];
    if (!unit) continue;
    for (const [sortOffset, chapterIndex] of chapterIndexes.entries()) {
      const chapter = chapterByIndex.get(chapterIndex);
      if (!chapter) continue;
      await db.query(
        `INSERT INTO course_unit_readings (course_unit_id, chapter_id, required, sort_order)
         VALUES ($1, $2, TRUE, $3)
         ON CONFLICT (course_unit_id, chapter_id)
         DO UPDATE SET required = EXCLUDED.required, sort_order = EXCLUDED.sort_order`,
        [unit.id, chapter.id, sortOffset]
      );
      inserted += 1;
    }
  }

  return inserted;
}
