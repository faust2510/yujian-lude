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
    `SELECT id, chapter_index
       FROM textbook_chapters
      WHERE textbook_id = $1
      ORDER BY chapter_index`,
    [textbookId]
  );

  const units = unitsResult.rows;
  const chapters = chaptersResult.rows;
  const chapterByIndex = new Map(chapters.map((chapter) => [chapter.chapter_index, chapter]));
  const distribution = distributeChapterIndexes(chapters.length, units.length);

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
