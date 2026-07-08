import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getChapterForUser,
  incompleteRequiredReadings,
  readingsForCourseUnits,
} from './textbook-reading.js';

test('incompleteRequiredReadings returns required unread chapters', async () => {
  const db = {
    query: async () => ({
      rows: [{ chapter_title: '第 1 章', textbook_title: '婚姻的意义' }],
    }),
  };

  const rows = await incompleteRequiredReadings(db, { unitId: 'unit-1', userId: 'user-1' });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].chapter_title, '第 1 章');
});

test('readingsForCourseUnits groups readings by unit id', async () => {
  const db = {
    query: async () => ({
      rows: [
        { course_unit_id: 'unit-1', chapter_index: 1, chapter_title: '第 1 章', completed: true },
        { course_unit_id: 'unit-2', chapter_index: 2, chapter_title: '第 2 章', completed: false },
      ],
    }),
  };

  const grouped = await readingsForCourseUnits(db, { courseId: 'course-1', userId: 'user-1' });

  assert.equal(grouped.get('unit-1')[0].completed, true);
  assert.equal(grouped.get('unit-2')[0].chapter_title, '第 2 章');
});

test('getChapterForUser returns null when no chapter is found', async () => {
  const db = { query: async () => ({ rows: [] }) };

  const chapter = await getChapterForUser(db, { slug: 'missing', chapterIndex: 1, userId: 'user-1' });

  assert.equal(chapter, null);
});
