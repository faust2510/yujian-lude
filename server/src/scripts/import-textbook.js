import { access } from 'node:fs/promises';
import path from 'node:path';
import { pool, tx } from '../db.js';
import { parseEpub } from '../lib/textbook-epub.js';
import { bindTextbookToCourse } from '../lib/textbook-bindings.js';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    args[key] = next && !next.startsWith('--') ? next : true;
    if (args[key] === next) index += 1;
  }
  return args;
}

async function upsertTextbook(db, { slug, book, sourceFilename, licenseNote }) {
  const result = await db.query(
    `INSERT INTO textbooks (slug, title, author, description, source_filename, license_note, visibility, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'login_required', now())
     ON CONFLICT (slug)
     DO UPDATE SET
       title = EXCLUDED.title,
       author = EXCLUDED.author,
       description = EXCLUDED.description,
       source_filename = EXCLUDED.source_filename,
       license_note = EXCLUDED.license_note,
       updated_at = now()
     RETURNING id`,
    [slug, book.title, book.author || null, book.description || null, sourceFilename, licenseNote || null]
  );
  return result.rows[0].id;
}

async function upsertChapters(db, { textbookId, chapters }) {
  for (const chapter of chapters) {
    await db.query(
      `INSERT INTO textbook_chapters (textbook_id, chapter_index, title, body_html, body_text, source_href, word_count, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (textbook_id, chapter_index)
       DO UPDATE SET
         title = EXCLUDED.title,
         body_html = EXCLUDED.body_html,
         body_text = EXCLUDED.body_text,
         source_href = EXCLUDED.source_href,
         word_count = EXCLUDED.word_count,
         updated_at = now()`,
      [
        textbookId,
        chapter.chapterIndex,
        chapter.title,
        chapter.bodyHtml,
        chapter.bodyText,
        chapter.sourceHref,
        chapter.wordCount,
      ]
    );
  }

  await db.query(
    'DELETE FROM textbook_chapters WHERE textbook_id = $1 AND chapter_index > $2',
    [textbookId, chapters.length]
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file || !args.slug) {
    console.error('[import:textbook] 用法：--file <epub-path> --slug <slug> [--course <course-slug>] [--license-note <note>]');
    process.exitCode = 1;
    return;
  }

  try {
    await access(args.file);
  } catch {
    console.error(`[import:textbook] EPUB 文件不存在：${args.file}`);
    process.exitCode = 1;
    return;
  }

  const book = await parseEpub(args.file);
  if (book.chapters.length === 0) {
    console.error('[import:textbook] EPUB 没有可导入章节');
    process.exitCode = 1;
    return;
  }

  const out = await tx(async (db) => {
    const textbookId = await upsertTextbook(db, {
      slug: args.slug,
      book,
      sourceFilename: path.basename(args.file),
      licenseNote: args['license-note'] || null,
    });
    await upsertChapters(db, { textbookId, chapters: book.chapters });
    const bound = await bindTextbookToCourse(db, { textbookId, courseSlug: args.course });
    return { chapters: book.chapters.length, bound };
  });

  console.log(`[import:textbook] imported ${args.slug}: ${out.chapters} chapters`);
  if (args.course) {
    console.log(`[import:textbook] bound ${args.slug} to ${args.course}: ${out.bound} required readings`);
  }
}

main()
  .catch((err) => {
    console.error('[import:textbook] 失败：', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
