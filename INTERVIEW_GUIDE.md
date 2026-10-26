# Presenting YTGuide in an interview

## What to say about the project

“YTGuide started in a college Python/ML workshop. We wanted students to choose a YouTube lesson without getting drawn into an endless feed. The original app used title bag-of-words similarity over a collected dataset. The newer version ranks the actual query, explains matches, handles provider failures, and gives students a workspace with notes, timestamp bookmarks, collections and cross-device persistence.”

## Your contribution: be specific

The known starting contributions are the student problem, workshop participation, original prototype/data-collection context, and the modernization requirements/scope. The old app names a four-person team; do not erase teammates or assign yourself every historical line.

The new account/sync/player implementation, tests and documentation were produced with AI assistance under Kushagra's direction. A defensible description is “I developed the project with AI assistance and can explain the design and validate the flows.” Do not claim a module as independently written if you did not write it. Do not invent authorship percentages or claim a model was trained to judge teaching quality.

Before claiming ownership of a design decision, read the actual implementation, run it, make a small change and explain its consequences. Familiarity is earned through debugging, not through memorizing this guide.

## A five-to-seven-minute demo

1. Choose Python, show the source notice, add a goal and open **Why this lesson?** Explain why text similarity is not a quality probability.
2. Open a lesson, add a note, create a bookmark at `12:35`, and manually mark the lesson complete.
3. Create “Interview revision,” attach the lesson, and filter that collection.
4. Start/pause/reset the timer; show that it can sit alongside the player.
5. Sign in using your own account, explicitly import guest data, and wait for **Cloud synced**.
6. Open the same account in another browser/device. Confirm notes/collections/progress arrive. Guest local storage alone cannot do this.
7. Demonstrate a stale-note conflict in two sessions: first save succeeds, second device receives a conflict rather than silently replacing it.
8. Show a direct unauthenticated workspace request returning 401 and the CI/preview integration evidence.

For the real cross-device demo, create your own account in advance and verify email delivery. A cloud-browser player that buffered is not proof of working media delivery on every device.

## Questions and defensible answers

**Why PostgreSQL rather than MongoDB?**
Users, lessons and collections have relationships and per-user uniqueness requirements. Composite keys and foreign keys help prevent invalid or cross-user membership rows; transactions make imports consistent. MongoDB could work, but would require different modelling and more application-enforced invariants. Familiarity alone is not a database selection criterion.

**Why managed authentication?**
Password hashing, sign-in sessions and recovery should not become an improvised security project. Neon Managed Auth owns that machinery. The application still must verify identity and enforce authorization on its own APIs.

**What is authentication versus authorization here?**
JWT verification establishes the caller's identity. Each SQL query uses that identity, and collection mutations check ownership. A signed-in user still cannot use another user's collection ID. Client-side hidden buttons are not access control.

**Why a same-origin auth proxy?**
The provider's HTTP-only session cookies are scoped to the app origin, reducing dependence on third-party cookies. The proxy only forwards known routes to a configured provider; it does not accept arbitrary target URLs or expose admin methods.

**What prevents SQL injection?**
Parameterized queries, validation, and no interpolation of user text as SQL syntax. This does not automatically solve authorization; ownership checks are a separate requirement.

**What happens if two devices edit one note?**
Each note has a version. The save includes the version the editor saw; the server updates only if it still matches. A stale write receives 409 and the latest note. The browser keeps the draft and offers a choice. This is optimistic concurrency, not real-time collaborative merging.

**Why not save the entire workspace JSON after every change?**
A stale browser could overwrite newer notes, bookmarks or completion flags. Per-field mutations reduce that overwrite surface. Small display metadata snapshots still use JSONB intentionally.

**What happens offline or after a lost response?**
Local drafts and queued operations remain on the device. The UI distinguishes pending changes from confirmed cloud sync. Retried imports have deterministic batch IDs and constraints; matching note content handles a save whose successful response was lost. This is retry-safe engineering, not a claim of universal exactly-once execution.

**Why not silently import local storage after login?**
A shared browser's guest data might belong to someone else. Import must be an explicit action. Account namespaces and server user ownership prevent accidental mixing.

**Does resume position mean completion?**
No. It is a player-reported timestamp. A person may seek or leave the video running. Completion is manually marked, and neither metric proves understanding.

**Is this an AI model that finds the best five videos?**
No objective “best five” guarantee exists here. The current model is TF-IDF content retrieval plus a diversity heuristic. A stronger claim would need independent relevance labels, held-out queries, baseline comparisons, and separate evidence of learning outcomes.

**What was wrong with your original dataset?**
Collecting it was valid. Duplicates, noisy candidates, old metadata and arbitrary first-row similarity were weaknesses. Putting data on Kaggle did not validate it.

**Why not add a chatbot immediately?**
The core study workflow and persistence needed attention first. A generic chatbot would add cost and another failure mode without proving better learning. The current release deliberately excludes it.

**Why keep both Python and Node?**
Python retains the original recommendation code. Node uses the official serverless SQL driver and auth ecosystem. Both deploy in one Vercel project; there is no separately operated microservices estate.

**Where are secrets and tokens stored?**
Database/API secrets are server environment variables. The auth provider owns HTTP-only session cookies. The browser obtains a short-lived API JWT into memory, rather than deliberately putting it in local storage. Local notes/cache are unencrypted browser data and have a different threat model.

**What would you improve next?**
A judged recommendation benchmark, actual student feedback, pagination at larger scale, cross-tab coordination, an explicit account-deletion/retention flow, wider device tests, and a shared YouTube quota cache. Add infrastructure based on measured requirements.

## Code-reading exercises

- Follow `public/account.js → /api/workspace → lib/identity.js → parameterized SQL` for one saved lesson.
- Change the channel-diversity coefficient, observe ranking changes, and explain the trade-off.
- Trigger a 409 note conflict and trace how the draft is retained.
- Retry a guest import and inspect why unique constraints/receipts avoid duplicates.
- Send another user's collection ID with your own session in the isolated preview fixture test.
- Inspect `db/001_workspace.sql` and explain every composite foreign key.
- Read the actual QA report. Distinguish passed tests, untested flows and external limitations.
