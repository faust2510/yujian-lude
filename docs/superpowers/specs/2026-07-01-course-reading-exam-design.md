# Course Reading And Exam Design

## Goal

Upgrade courses from pure check-in completion to a reading-first flow: learners expand course units, read the lesson text, mark each unit as read, then pass a final exam before the course counts as complete.

## Scope

- Reuse `course_units.material` for per-unit reading text.
- Reuse `unit_attempts` as the per-unit read marker.
- Reuse `course_exam_attempts` for final exam submissions.
- Add original platform reading notes for the existing courses. For the Keller course, the material is an original guide and does not reproduce copyrighted book text.
- Keep the current course rewards and match-gate behavior, but trigger completion only after all units are read and the final exam is passed.

## Backend Design

- `GET /api/courses/:slug` returns unit `material`, unit read attempts, and the latest exam attempt.
- `POST /api/courses/:slug/units/:index/submit` becomes "mark unit as read" and requires `readConfirmed: true`.
- `GET /api/courses/:slug/exam` returns public final-exam questions only after all units are read.
- `POST /api/courses/:slug/exam/submit` grades answers, stores `course_exam_attempts`, and completes the course when passing requirements are met.

## Frontend Design

- Course cards become foldable panels.
- Each course expands into a unit directory.
- Each unit expands to show reading material and a "mark as read" action.
- After all units are read, an exam panel appears with radio questions.
- Completion/reward UI reflects exam pass status rather than check-in status.

## Testing

- Add unit tests for course exam public-question filtering and grading.
- Update MVP and real-user verification scripts to read all units, fetch the exam, submit correct answers, and assert completion.
- Run server tests, web build, and full release verification.
