# AI And Relationship Confirmation Design

## Goal

Move 遇见路得 beyond the MVP closure by adding two trust-centered workflows:

- AI 咨询 v1: a strict, source-bounded assistant for marriage preparation questions.
- 关系确立 v1: a visible relationship lifecycle from mutual interest to both-user confirmation, pastoral/admin review, confirmation, or ending.

## Current State

- `server/src/routes/ai.routes.js` records questions but always returns out-of-scope because `ragRetrieve()` is a stub.
- `server/src/routes/relationships.routes.js` creates relationship rows and lets users mark course/exam confirmation, but pastor approval returns `501`.
- `web/src/pages/Relationships.jsx` shows relationship status but cannot request confirmation or complete pastoral review.
- The MVP route anchors remain `/` homepage, `/app` React app, and `/api/*`.

## AI Consultation V1

AI v1 is not a free-form chatbot. It is a strict knowledge assistant:

- Knowledge base is local and deterministic for this release.
- Sources include platform course principles, faith-test boundaries, and platform relationship safety rules.
- Retrieval uses conservative keyword/topic matching. If no supported source is found, the answer is out-of-scope.
- Out-of-scope topics include medical, legal, emergency, abuse adjudication, mental-health diagnosis, prophecy, and questions requiring personal pastoral authority.
- Responses must include `outOfScope`, `sources`, and a user-readable answer.
- Every ask is stored in `ai_consultations`.

## Relationship Confirmation V1

The relationship lifecycle becomes:

1. `chatting`: users have a relationship row after mutual interest and can keep discerning.
2. `relationship_requested`: one side has requested formal confirmation.
3. `mutual_confirmed`: both users have confirmed they want to enter the confirmation process.
4. `pastoral_review`: the relationship waits for both sides to be confirmed by pastor/admin review.
5. `confirmed`: both users and both pastoral/admin sides are complete.
6. `ended`: either participant can end the relationship with an optional reason.

The existing `user_a_exam_passed` and `user_b_exam_passed` columns remain as compatibility fields for the course gate, but v1 adds explicit user confirmation columns. Before a user confirmation is accepted, the backend verifies that user has passed the configured light-course exam.

Pastoral/admin review v1 is station-side:

- `admin` can approve either side.
- `pastor` can approve either side in v1 because the current data model does not yet bind a certified pastor account to a specific user endorsement.
- Future email-confirmation work can replace this with tokenized pastor/referrer links.

## Frontend

- Add `/app/ai` navigation and page.
- Update `/app/relationships` so users can request/confirm, see review status, and end a relationship.
- Keep the UI practical and operational: no marketing hero, no new card-heavy landing surface.

## Verification

- Unit tests cover strict AI retrieval and relationship state transitions.
- MVP/real-user verification scripts cover at least one AI in-scope answer, one out-of-scope answer, and the relationship confirmation lifecycle through `confirmed`.
- Full release gate remains `npm run verify:release --prefix server`.
