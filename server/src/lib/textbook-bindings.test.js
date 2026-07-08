import assert from 'node:assert/strict';
import test from 'node:test';
import { distributeChapterIndexes, planCourseChapterDistribution } from './textbook-bindings.js';

test('distributeChapterIndexes puts overflow chapters on first and last units', () => {
  assert.deepEqual(distributeChapterIndexes(12, 10), [[1, 2], [3], [4], [5], [6], [7], [8], [9], [10], [11, 12]]);
});

test('distributeChapterIndexes leaves later units empty when chapters are fewer than units', () => {
  assert.deepEqual(distributeChapterIndexes(3, 5), [[1], [2], [3], [], []]);
});

test('planCourseChapterDistribution maps Meaning of Marriage to course-worthy sections', () => {
  const chapters = [
    '扉页',
    '目录',
    '引言',
    '第1章 婚姻的奥秘',
    '第2章 婚姻的力量',
    '第3章 婚姻的精髓',
    '第4章 婚姻的使命',
    '第5章 爱那个陌生人',
    '第6章 拥抱“他者”',
    '第7章 单身与婚姻',
    '第8章 性爱与婚姻',
    '跋',
    '附录： 决策过程与性别角色',
    '致谢',
    '注释',
    '版权页',
  ].map((title, index) => ({ chapter_index: index + 1, title }));

  const distribution = planCourseChapterDistribution({
    courseSlug: 'keller-meaning-of-marriage',
    textbookSlug: 'meaning-of-marriage',
    chapters,
    unitCount: 10,
  });

  assert.deepEqual(distribution, [[3, 4], [5], [6], [7], [8], [9], [10], [11], [12], [13]]);
  assert.equal(distribution.flat().includes(1), false);
  assert.equal(distribution.flat().includes(2), false);
  assert.equal(distribution.flat().includes(14), false);
  assert.equal(distribution.flat().includes(15), false);
  assert.equal(distribution.flat().includes(16), false);
});

test('planCourseChapterDistribution keeps generic textbooks using all chapter indexes', () => {
  const chapters = ['扉页', '目录', '核心章节'].map((title, index) => ({ chapter_index: index + 1, title }));

  assert.deepEqual(
    planCourseChapterDistribution({
      courseSlug: 'some-other-course',
      textbookSlug: 'some-other-textbook',
      chapters,
      unitCount: 2,
    }),
    [[1, 2], [3]]
  );
});
