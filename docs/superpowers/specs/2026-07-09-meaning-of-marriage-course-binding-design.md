# Meaning of Marriage Course Binding Design

## Goal

Make the imported textbook 《婚姻的意义》 useful inside the `keller-meaning-of-marriage` course by binding course units to meaningful book sections instead of front matter.

## Scope

- Applies only to textbook slug `meaning-of-marriage` when bound to course slug `keller-meaning-of-marriage`.
- Keeps the generic chapter distribution behavior for other books and courses.
- Does not commit or expose the EPUB source file.
- Does not change the frontend API contract; the existing `requiredReadings` list remains the UI input.

## Binding Rule

For 《婚姻的意义》, exclude front/back matter from required course readings:

- `扉页`
- `目录`
- `致谢`
- `注释`
- `版权页`

Bind the remaining course-worthy sections across the 10 course units:

| Course unit | Required reading |
| --- | --- |
| 1 | `引言`, `第1章 婚姻的奥秘` |
| 2 | `第2章 婚姻的力量` |
| 3 | `第3章 婚姻的精髓` |
| 4 | `第4章 婚姻的使命` |
| 5 | `第5章 爱那个陌生人` |
| 6 | `第6章 拥抱“他者”` |
| 7 | `第7章 单身与婚姻` |
| 8 | `第8章 性爱与婚姻` |
| 9 | `跋` |
| 10 | `附录： 决策过程与性别角色` |

## Architecture

Add a small planning helper in `server/src/lib/textbook-bindings.js` that receives `courseSlug`, `textbookSlug`, `chapters`, and `unitCount`, then returns chapter-index buckets. `bindTextbookToCourse` will use this helper after querying chapter titles and the textbook slug.

## Testing

- Add a unit test that proves the Keller course mapping excludes front/back matter.
- Keep the existing generic distribution tests green.
- Re-import the local EPUB after implementation to rewrite current `course_unit_readings`.
- Run backend tests and release verification before reporting completion.
