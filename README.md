# YTGuide

A focused YouTube learning workspace with multilingual semantic recommendations: find a lesson, study it, and pick up where you left off.

Live site: https://ytguide-five.vercel.app/

Start here: [Architecture](SYSTEM_DESIGN.md) · [Interview guide](INTERVIEW_GUIDE.md) · [Verification](QA_REPORT.md) · [Roadmap](ROADMAP.md) · [Model card](models/semantic/MODEL_CARD.md)

The original college Python/ML workshop explored how students could find educational videos without an endless feed. This version keeps the Python ranking engine and adds a personal account workspace. There is no chatbot.

## Current behaviour

- Anyone can browse recommendations, watch a lesson, change appearance and use the focus timer.
- **Sign-in is required** to save lessons, take notes, mark completion, bookmark timestamps, create collections or save playback progress. Guests do not create new learning-activity records in local storage.
- Signed-in activity syncs to Neon PostgreSQL. Local storage is an **account-scoped cache and pending-write queue**, not the authoritative database. “Pending” and “Cloud synced” are distinct states.
- Legacy guest data from earlier releases remains untouched and can be explicitly imported after sign-in. It is not loaded as the active anonymous workspace.
- Seven preset subjects plus **Other topic**. Add the actual question or goal, language and duration filters.
- Search filters, entered goal and current page are encoded in the URL, so refresh restores them. Changing a filter starts a new search.
- Explicit technology names constrain candidates; multilingual neural embeddings compare the meaning of your goal with lesson metadata, alongside keyword relevance.
- Notes, saved/completed lessons, collections, timestamp bookmarks and resume positions belong to the authenticated user. The API checks authentication and ownership independently of the UI.
- Notes use optimistic version checks; conflicts require an explicit choice. Imports use receipts to avoid duplicate retry batches.
- Footer contact links and a public feedback form email the owner through Resend. Reply email is optional; no sign-in is required.
- Light/dark themes, keyboard navigation, reduced motion, notes export, JSON backup and focus timer are included. The timer resets on reload; search context does not.

## Live search configuration

**Production live search is configured and verified (27 October 2026).** The owner added `YOUTUBE_API_KEY` directly in Vercel Production. Live Python decorators, SQL joins and Kubernetes networking returned distinct YouTube results. Preview has no key and remains catalogue-only unless separately configured. The following steps document setup for a future environment.

To enable live retrieval:

1. Open [Google Cloud Console](https://console.cloud.google.com/), select/create a project and enable **YouTube Data API v3**.
2. Create a **new** API key in **APIs & Services → Credentials**. Restrict its API access to **YouTube Data API v3**. HTTP-referrer restrictions do not fit this server-side request; IP restrictions require fixed outbound IPs.
3. Add it directly in **Vercel → ytguide → Settings → Environment Variables** as `YOUTUBE_API_KEY`, for Production (and Preview if desired). Keep it server-side. Never paste it into chat or commit it.
4. Redeploy and test several distinct specific queries. Real-key search and quota handling must be checked after configuration.

Two historical notebook keys were exposed in Git history; those keys must be revoked by their owner. Do not reuse them.

**Live YouTube** explicitly reports missing configuration/provider failure rather than silently returning catalogue courses. **Automatic** may use the labelled catalogue fallback. When nothing matches, the page offers a direct YouTube search using the entered question rather than inventing results.

## Architecture and choices

| Component | Choice | Reason / trade-off |
| --- | --- | --- |
| Browser | Static HTML, CSS, JavaScript | Keeps the existing design and a small client; state orchestration is explicit |
| Auth client | Small same-origin HTTP adapter | Fresh uncached session checks after login/logout; removes a large unused SDK/UI dependency tree |
| Identity | Neon Managed Auth | Provider owns password verification, email codes and HTTP-only session cookies |
| Auth proxy | Node function, allowlisted routes | Same-origin cookies without third-party-cookie dependency; rejects unknown routes and hostile origins |
| Workspace API | Node + `jose` | Verifies JWT signature, issuer, audience and expiry before accessing user-owned records |
| Database | Neon PostgreSQL Free, Singapore | Relational users/lessons/collections, foreign keys and transactions fit SQL well |
| Retrieval | YouTube Data API v3 or maintained catalogue | API supplies real current candidates; catalogue is small and explicitly limited |
| Ranking | Quantized multilingual MiniLM + TF-IDF + channel diversity | Pretrained semantic relevance on CPU; extra cold-start/memory cost, no teaching-quality guarantee |
| Host | Vercel | Static assets plus Python and Node functions; account compute is configured near storage |

### Recommendation flow

`Subject + goal → technology-name normalization → live YouTube/shared cache or catalogue → language/duration/subject filters → pretrained embeddings + TF-IDF → channel diversity → up to five lessons`

The normalized goal is part of the live retrieval query **and cache key**. PostgreSQL shares 15-minute candidate caching and a conservative daily retrieval budget across function instances. The small per-instance cache is an extra optimization. Provider quotas still apply independently.

- Smoothed IDF: `log((1 + N) / (1 + document_frequency)) + 1`.
- Sublinear TF: `1 + log(term_count)`.
- Cosine similarity over normalized query/document vectors.
- Hybrid score: `0.8 × semantic cosine + 0.2 × TF-IDF cosine`; semantic matches below 0.30 are excluded. These are heuristic scores, not calibrated probabilities.
- Hybrid channel adjustment: `score / (1 + 0.15 × previously_selected_from_channel)`. The lexical comparison uses 0.25.

The current semantic ranker runs an actual pretrained neural sentence model, not a generative LLM. It does not watch videos, learn from private notes, judge teaching quality or promise “the best five videos.” No paid inference API is used. `ranking=lexical` selects the classical comparison; any inference fallback is labelled in the response and source notice.

### Where data lives

| Data | Anonymous visitor | Signed-in learner |
| --- | --- | --- |
| Search context/current page | URL | URL |
| Theme | Browser preference | Browser preference |
| New notes/saves/bookmarks/progress | Requires sign-in | PostgreSQL + scoped cache/outbox |
| Legacy guest data | Retained for explicit import, not actively used | Optional explicit import |
| Password/session | No session | Provider; HTTP-only cookies |
| API JWT | None | Short-lived, memory only |
| Video media | Not stored | Not stored |

Every note edit enters the account-scoped persistent outbox immediately; the 700 ms debounce delays only the network request. The draft and its cloud version survive reload, and a newer cloud note still requires explicit conflict resolution.

Cloud data is applied only after the account API responds successfully. Saving is locked while authentication is unresolved or expired. Normal sign-out clears synced account caches; pending writes can be retained with an explicit warning for recovery. Browser caches are not encrypted.

## Development and verification

Node.js 24 and Python 3.12:

```sh
npm ci --ignore-scripts
python -m pip install -r requirements.txt
node scripts/prepare-model.mjs
npm run check
npm run test:server
python -m unittest discover -s tests -v
python scripts/evaluate-ranking.py
npm run build
npm run dev
```

The Python local server serves static assets/recommendations, not Node account functions. Use a provisioned Vercel preview to test real managed authentication/database boundaries. Do not copy production credentials into source code.

The build applies additive database migrations when `DATABASE_URL` is available. Migration `004_bookmark_quota.sql` enforces the 100-bookmark limit per lesson for both manual saves and imports, with a parent-row lock for concurrent requests. An overflowing import batch is rejected atomically; guest originals stay available. Existing records are never pruned. Workspace loading keeps the latest 1,000 history lessons plus every saved, completed, noted, bookmarked or collection lesson, regardless of age. Preview builds run `scripts/verify-cloud.mjs` with isolated synthetic fixture users, test ownership/conflicts/CRUD, and clean up fixture records. It skips production. Unit/DOM tests use mocked services and do not by themselves establish real cloud success. `tests/workspace-db.test.mjs` runs against real PostgreSQL when `TEST_DATABASE_URL` points to a disposable test database; it creates and drops its own schema. CI provisions PostgreSQL 16 and runs these tests, including concurrent writes and import rollback. Never use a production URL for this setting.

Required server settings: `DATABASE_URL`, `NEON_AUTH_BASE_URL`. Optional: `YOUTUBE_API_KEY`. No secret is returned by the public readiness endpoint.

## Files

| Path | Responsibility |
| --- | --- |
| `public/app.js` | Search/navigation, account gates, lesson player and study controls |
| `public/account.js` | Sign-in forms, cloud outbox, retry/import/conflict handling |
| `src/auth-sdk.js` | Small same-origin auth HTTP adapter, bundled at build |
| `api/recommend.py` | Candidate retrieval, filtering and Python ranking |
| `api/auth.js` | Allowlisted provider proxy and cookie forwarding |
| `api/workspace.js` | Authenticated CRUD and ownership checks |
| `lib/identity.js` | JWT verification |
| `db/001_workspace.sql` | Schema and indexes |
| `tests/frontend.test.mjs` | Guest gates, URL restoration, account UI/sync orchestration using fixtures |
| `scripts/verify-cloud.mjs` | Actual preview-only auth/database fixtures |
| `legacy/` | Sanitized workshop artifacts; not served |

## Limits and future work

- A configured key is required for arbitrary current YouTube search. API quotas, metadata gaps and regional playback restrictions apply.
- Some lessons have no declared audio language; strict language filters exclude them.
- JWTs minted before logout may remain valid until their short expiry; the normal browser stops using them and clears its session.
- Pending writes are not a cloud success. Notes have version checks; other fields use last accepted per-field writes.
- YouTube controls its ads, branding and player suggestions. This app is not a browser blocker.
- Email delivery/reset needs a real owner-controlled mailbox test. Account deletion/retention, collaboration, study plans and JSON restore are future work.
- On 27 October 2026, the owner confirmed successful account creation, login, collections and saved workspace data. This is owner-reported production verification, separate from automated isolated-backend checks. Password reset/email delivery and a second-device walkthrough still need their own checks.

## Credits

Original workshop team: **Kushagra Pandey, Aryan Gupta, Harsh Mishra and Ayush Nishad**, guided by **Chandan Verma**. Kushagra supplied the project context, original prototype/data work, requirements and scope decisions. Modern implementation, tests and documentation were developed with AI assistance. Explain the parts you understand, reviewed, changed and tested; do not invent authorship percentages.

## Primary references

- [YouTube search API](https://developers.google.com/youtube/v3/docs/search/list)
- [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
- [Neon Auth](https://neon.com/docs/auth/overview)
- [Neon JWT contract](https://neon.com/docs/auth/guides/plugins/jwt)
- [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver)

## Release status — 27 October 2026

Both phases are deployed. GitHub main and the production Vercel deployment were verified at `b616e2567d0b6d9ff1919f79c43d833992167570`; GitHub Actions passed. Subsequent documentation updates do not change application behaviour. See [QA_REPORT.md](QA_REPORT.md) for evidence and limits.

The owner confirmed successful account creation, login, collection creation and saved workspace data on production. An earlier rejected-password attempt is historical, not a current unresolved login blocker.

Neon reports Free and Vercel reports Hobby. No paid inference API or plan upgrade was introduced. Existing compute, storage and YouTube quotas still apply.

## Phase 1 reliability release — 27 October 2026

- Unicode/Hindi-script goals are accepted; the Other topic field states when a goal is required.
- Anonymous workspace tools are hidden. Guest playback explicitly says progress requires sign-in.
- Signing in returns to the lesson and completes the requested save/completion action. Recovery screens have Back to sign in.
- Browser page navigation creates history entries. Fresh visits show an invitation to search instead of consuming provider quota immediately. Rapid filter changes are coalesced.
- Fixed the direct YouTube link in empty-result states.
- Public live candidate retrieval uses a PostgreSQL cache shared across function instances, 15-minute successful results and short failure caching. Database leases prevent duplicate in-flight retrievals. A conservative shared UTC-day budget reserves 101 units per retrieval, capped at 8,000; Google quotas still apply independently. The cache fails closed if unavailable rather than multiplying provider calls.
- Python uses the HTTP SQL endpoint/header contract from the pinned official Neon serverless driver; connection strings stay in server request headers. SQL is parameterized. No extra storage service or paid plan was added.
- Signing-key fetch timeouts return a retryable service error instead of claiming the user password/session is wrong.

The semantic model remains a separate Phase 2 release; no neural inference is claimed by Phase 1.

## Phase 2: semantic model, dataset and evaluation

- Model: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, quantized ONNX conversion pinned at `2c4055b12046f11709e9df2c122e59ffbdc2f900`. The build verifies SHA-256 hashes before packaging the 118,308,126-byte weights and 17,082,913-byte tokenizer. Visitors do not download these assets. See `models/semantic/MODEL_CARD.md` and its Apache-2.0 license.
- CPU inference uses ONNX Runtime, 128-token inputs, attention-mask mean pooling and 384-dimensional normalized vectors. Ranking combines 80% semantic similarity, 20% TF-IDF and educator diversity. Explicit named technologies constrain results. Selected Hindi technology spellings are normalized; this is not a general translator.
- `api/catalog.json` now contains 54 active metadata-checked lessons, including focused decorators, SQL joins and Kubernetes networking examples.
- `data/legacy_clean.json` preserves 139 valid unique legacy candidates from 176 original rows: 36 duplicate occurrences and one malformed unique ID were removed. Those unverified legacy candidates are not silently used as current lessons. The original notebooks and pickle artifacts remain intact.
- `data/dataset_manifest.json` records provenance/counts. `scripts/prepare-dataset.py` reproduces cleaning; `--refresh-focused` explicitly refreshes selected examples through the live API.
- We use pretrained weights for inference. We did **not** train the neural model on the workshop dataset.
- `data/ranking_evaluation.json` records a 24-query manually authored relevance smoke test. Hybrid ranked the expected topic first for 22/24 queries versus 21/24 for keyword ranking; MRR@5 was 0.958 versus 0.889. This is a small development check, not an independent teaching-quality or learning-outcome study. Two top-one cases remain misses. Local cold/warm inference times are recorded separately and are not end-to-end website latency claims.
- Model downloads and inference require no additional account/API key. Runtime compute and provider quotas still count toward existing free-tier limits; no plan was upgraded.

## Contact and feedback

The footer links to Kushagra's LinkedIn, GitHub and `kushagrapandey102@gmail.com`. `public/feedback.js` submits to the same-origin Node route `/api/feedback`. The recipient and subject are server-controlled; messages are plain text, with optional validated Reply-To. The browser retains the draft on failure and reuses a request ID on retry. Resend idempotency prevents duplicate accepted sends for the same payload within its retention window.

Set server-only `RESEND_API_KEY` to a dedicated sending-only key in Vercel Production. The current `onboarding@resend.dev` sender delivers only to the Resend account owner's configured address; it is not a general outbound mail service. Configure a verified sender before changing the recipient/use case. No visitor API key or mail-client launch is needed.

Migration `db/003_feedback.sql` adds shared counters: three attempts per address bucket per 15-minute window and 20 attempts per UTC day globally. Expired counter rows are removed after two days during submissions. HMAC identifiers are stored instead of raw addresses; feedback bodies and reply addresses are not stored in application tables. Resend and the recipient mailbox process the email. Origin checks, bounded JSON, validation and a honeypot provide additional abuse controls, not a guarantee against bots. Provider failure returns an actionable error and direct email remains available.

