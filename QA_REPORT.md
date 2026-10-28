# YTGuide verification — 27 October 2026

## Current release

Both approved phases are implemented and published to GitHub main. Phase 1 production deployment `dpl_HoieJMeeN156W9pHtWEypsPVsPqZ` passed before Phase 2 was released. Phase 2 production deployment `dpl_EyRfFaZryFruwKjd7xqFDyVB4pFV` is READY and serves https://ytguide-five.vercel.app/ from GitHub commit `0c835aa8d7b2f435af7655b5c03835f06fed0d10`. GitHub Actions run `40399728344` passed for that commit.

The first Phase 2 build failed because root dependency autodetection used Python 3.14. An explicit Node install command now lets the Python function builder select the committed Python 3.12 version. The subsequent production build passed. Build logs measured a 292.83 MB bundle before platform optimization; the platform accepted and deployed it. No paid inference service, plan upgrade or large-function override was enabled.

## Verified behaviour

- Specific goals participate in YouTube retrieval, cache keys and ranking. Live decorators and Kubernetes deployment searches returned distinct, relevant lessons using the configured server-side key.
- Hindi-script goals are accepted. Production catalogue query “दो तालिकाओं को जोड़ना” ranked SQL joins first; browser results confirmed the same semantic match.
- All three production requests returned `ranking: hybrid` and the actual multilingual MiniLM model identifier. Observed inference was 5182.9 ms for the first catalogue request, 1261.1 ms for decorators and 1837.3 ms for Kubernetes. Network/provider time is additional; these are individual observations, not latency guarantees.
- Production metadata returned 54 catalogue entries, live search configured and semantic model configured.
- Browser refresh retained the selected custom topic, Hindi goal, source and length instead of resetting to Python. Current page is also restored from the URL.
- Guest save/completion actions open sign-in. Guest notes, bookmarks and account collections remain locked. Workspace remains empty while signed out, and the API denies anonymous workspace access. No new guest study activity is persisted.
- Lesson dialog and privacy-enhanced YouTube iframe load; no autoplay. Iframe creation does not prove uninterrupted media playback in every region.
- Timer duration selection, start/pause, navigation, account gate, recovery navigation, theme persistence, source/language/length controls and empty-result handling were exercised across browser walkthroughs and DOM tests.
- Cold visits show an invitation without spending YouTube quota. Filter changes are debounced. Shared database caching, request leases, negative caching and a daily retrieval budget protect provider quota.
- Runtime log inspection after Phase 2 requests returned platform Node `url.parse()` deprecation warnings; no inference/application exception appeared in the returned window. This is a limited observation.

## Authentication and real cloud persistence

Identity uses Neon Auth, with signed session/JWT verification and ownership checks in the workspace API. User records live in Neon PostgreSQL. Account-scoped retry drafts do not replace cloud persistence; legacy guest data requires explicit import.

The exact production origin was added to Neon's previously empty trusted-domain allowlist. An earlier secure browser attempt returned **Invalid email or password**. On 27 October 2026, the owner subsequently confirmed successful account creation, login, collection creation and saved workspace data on production. This is owner-reported verification; it does not retroactively turn the earlier rejected attempt into a successful automated test. Email/password recovery and a separate-device walkthrough remain unverified.

Real tests on isolated branch `br-round-bread-b33r9v1p` passed signup, session cookies, JWT signature/issuer/audience/expiry, saves, notes/version conflicts, collections, bookmarks, playback positions, idempotent imports, two-user isolation, forged-token rejection and logout. The runner cleaned its fixture users/records; the disposable branch expires after one day. No production fixture accounts were created.

The scratch environment took 9–12 seconds to fetch public signing keys with Node, beyond the former seven-second timeout. QA used urllib over verified TLS for that exact public JWKS URL while retaining jose signature and claim checks. Production allows 15 seconds and reports unavailable verification separately from invalid credentials.

## Automated and model evidence

- **19 Node/DOM tests and 35 Python tests passed**, with syntax checks. GitHub CI also passed model preparation, evaluation, tests and build.
- DOM account tests mock their service responses; the isolated cloud tests above separately exercise real services.
- Active catalogue: **54 verified entries**. Original export: **176 rows, 140 unique raw IDs**. Removing 36 duplicate occurrences and one malformed unique ID yields **139 valid unique legacy candidates**, stored separately from the active catalogue.
- Actual pretrained `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, quantized ONNX CPU inference, combines semantic similarity with TF-IDF and channel diversity. It was not trained by this project and does not assess teaching quality or watch video contents.
- Checksum-pinned model/tokenizer assets are fetched at build time; visitors do not download model weights. Missing/erroring inference has a clearly labelled keyword fallback.
- A small, manually authored 24-query development smoke set recorded top-one topic/intent matches of **22/24 hybrid vs 21/24 lexical**, MRR@5 **0.958 vs 0.889**. Two top-one misses remain in `data/ranking_evaluation.json`. This is not an independently judged quality study.
- Shared candidate caching passed against the isolated database through independent connections, with one provider fetch.

Neon reports Free (`free_v3`) and Vercel reports Hobby. No new paid account or subscription was introduced. Free tiers retain their normal quotas and cold-start limits.

## Contact/feedback release — 27 October 2026

- Added responsive, theme-aware contact links and a public feedback form, with a dedicated sending-only Resend credential held in Vercel Production.
- Five focused tests cover hostile origins/body limits/header injection, recipient ownership/idempotency, honeypot and rate rejection, provider/configuration failures, duplicate clicks and draft retention. All 24 Node/DOM tests pass locally.
- Python regression checks ran: 32 passed, three model-dependent cases skipped because local model assets were absent. CI downloads verified model assets before running the full suite.
- Real isolated Neon SQL checks validated the new table and capped shared counter updates: hits 1, 2 and 3 accepted; fourth returned no row.
- GitHub commit `caf9d604ab437d2d244ade733a3559413b0edafa` deployed READY as `dpl_AYYSCHo9CDUg9SXk6q5CUTRXqYr6`. GitHub CI run `40439716184` passed model preparation, evaluation, Python/Node tests, syntax and build.
- Signed-out production browser submission showed confirmed success and reset the form. Resend reported the single labelled test email delivered to the fixed owner recipient; subject: “YTGuide — new website feedback”. This establishes provider-reported delivery, not inbox-versus-spam placement.
- Desktop light and dark footer layouts were visually inspected. Responsive stacking/input sizing are implemented; a separate physical-phone walkthrough was not performed in this release.
- Production HTTP checks: GET 405, hostile Origin 403 and too-short message 400. No additional email was sent for these invalid requests.


## YTGuide audit fixes — 28 October 2026

The three YTGuide findings are fixed in this change:

- **YT-01:** Note edits enter the durable, account-scoped outbox synchronously. Only network dispatch waits 700 ms. Cached note versions survive reload, preserving optimistic conflict detection. Regression coverage includes immediate reload, coalesced typing, empty notes, offline replay and a newer cloud-note conflict. The immediate-reload test fails against the original frontend and passes with this fix.
- **YT-02:** Migration `004_bookmark_quota.sql` checks the stored 100-bookmark quota under a parent-lesson row lock. Both imports and manual inserts use this database invariant. An overflowing import transaction rolls back its bookmarks, notes and import marker together. Duplicate IDs remain harmless, even at capacity. Existing records are preserved.
- **YT-03:** The workspace returns the latest 1,000 history lessons plus all older saved, completed, noted, bookmarked and collection lessons. The PostgreSQL regression creates 1,100 newer history rows and verifies that retained older lessons are still returned without duplicates.

Validation completed locally:

- `npm run check` and `npm run build` passed.
- **32 Node tests passed**, including real PostgreSQL 16 import rollback, concurrent last-slot writes and workspace retention checks.
- **All 35 Python tests passed**, including the pinned ONNX semantic-model tests.
- CI now provisions disposable PostgreSQL 16 and sets `TEST_DATABASE_URL` so the database regressions run on every push and pull request. Without that setting, the local database test is explicitly skipped.

No production records or deployments were changed. The build was run without production database/auth credentials; real managed-auth preview verification and desktop/mobile browser coverage were not run for this change. Apply the additive migration through the normal build before serving the updated application.


## Complete workspace release — 28 October 2026

Scope: stabilize the currently shipped product. Proposed roadmap features (account deletion, JSON restore, collaboration, study paths and quizzes) are not advertised as implemented.

Additional defects fixed:

- Two tabs could overwrite one pending-change array. Durable per-operation records now preserve independent changes; Web Locks coordinate sending and stored in-flight markers prevent another tab from merging edits into a request already sent.
- A worker tab could advance a note version without showing that note’s text. Acknowledgements now preserve the base of unseen drafts, and conflict details are available to the originating tab.
- Token acquisition or a failed request crossing an account switch could affect the wrong workspace. Requests verify token ownership; late success/error paths check account generation.
- Reloading with pending changes previously skipped all other fresh cloud data. Pending operations now overlay the latest cloud snapshot, including offline additions and deletions.
- Temporary token/network errors no longer falsely expire authentication. Transient retries are delayed to prevent tabs from bouncing failed work between one another. Storage failures keep a warned in-memory draft until sync succeeds.
- Goal typing no longer creates a history entry per keystroke; stale searches cannot replace the empty custom-topic prompt; deleting a collection while editing it resets the form; rejected rename conflicts can be discarded and reconciled.
- Database migration 005 prevents concurrent manual creation/import from exceeding 50 collections.

| User flow | Evidence |
| --- | --- |
| Catalogue and multilingual recommendations | All 35 Python tests, including pinned ONNX inference; 24-query ranking evaluation |
| Managed accounts, sessions and logout | Preview `CLOUD_QA_PASS` with synthetic users and real provider/JWT/SQL; two-user ownership checks |
| Notes, saves, completion and reload | Chromium desktop/phone journeys through the UI into real PostgreSQL workspace operations |
| Concurrent tabs, immediate reload and offline retry | Dedicated Chromium journeys plus controlled in-flight/account-switch regressions |
| Collections, bookmarks and exports | Browser journeys and DOM tests; database ownership, quota, rollback and concurrency checks |
| Player position/seek/error handling | Controlled IFrame API fixture for pause/resume/seek; external YouTube availability remains provider-controlled |
| Timer, theme and keyboard/guest gates | DOM tests plus desktop/phone Chromium journeys; no horizontal overflow at 390 px |
| Password recovery | UI and adapter error/success contract tests. Actual reset-code arrival and completed recovery through a real inbox were not exercised in this release |
| Public feedback | Validation, rate limits, recipient, provider-failure, idempotency and UI tests; existing owner-confirmed production delivery evidence above |

Final local validation: **49 Node tests passed**, **35 Python tests passed**, **10 browser tests passed**. Build and syntax checks passed. The Chromium download’s primary host returned a bad archive; the official fallback succeeded, so browser coverage was actually executed. CI installs Chromium and runs the same desktop/phone suite with PostgreSQL on every push and pull request.

Browser fixtures do not transmit real credentials or feedback, and their temporary database schemas are removed. The production user’s saved lessons and notes were inspected without editing or deleting them. No zero-bug or all-providers/all-browsers guarantee is claimed. Real mailbox recovery and a physical second-device walkthrough remain distinct from the automated evidence above.
