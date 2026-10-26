# YTGuide

**A focused YouTube learning workspace: find a lesson, study it, and pick up where you left off.**

Live site: **https://ytguide-five.vercel.app/**

YTGuide began as a college Python/ML workshop project for students who get distracted while looking for lessons on YouTube. It now combines explainable Python recommendations with an optional account-backed study workspace. There is no chatbot in this release.

## Current capabilities

- Seven subjects, an optional learning goal, language/duration filters, and up to five explained results.
- Python TF-IDF cosine similarity, video-ID deduplication, and channel diversity.
- A maintained catalogue of 39 YouTube candidates; public metadata checked on 26 October 2026. Availability can subsequently change.
- Optional live YouTube retrieval. **A fresh `YOUTUBE_API_KEY` is still required**; missing credentials/provider failure produce a labelled catalogue fallback. Catalogue results are never described as a fresh search.
- Guest mode without signup, plus email/password accounts through **Neon Managed Auth**.
- **Neon PostgreSQL** persistence for account lessons, notes, progress, bookmarks, collections and import receipts.
- Saved lessons, manually marked completion, recently opened lessons, and collection filters.
- Resume position and clickable timestamped bookmarks through the YouTube IFrame Player API. Position is saved about every 15 seconds and on pause/close when the player reports it.
- Local-first note drafts, a persistent pending-change queue, retry controls, and optimistic note conflict handling.
- Explicit guest-to-account import in retry-safe batches. Cloud notes take priority over conflicting guest notes; guest originals remain on the device.
- Markdown notes export, JSON workspace backup export, light/dark mode, keyboard navigation, reduced-motion support, and a focus timer.

See [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md), [INTERVIEW_GUIDE.md](INTERVIEW_GUIDE.md), and [QA_REPORT.md](QA_REPORT.md) for decisions, an interview walkthrough, and tested limitations.

## Walkthrough

1. Choose a topic in **Discover lessons**, optionally add a goal, and find a shortlist. Read the source notice and expand **Why this lesson?** for matched terms.
2. Open a lesson and deliberately load the YouTube player. There is no autoplay. If the player cannot play in your region/browser, use **Open on YouTube**.
3. Write notes and bookmark a moment. Leave the timestamp blank to use the current player position, or enter `mm:ss`, such as `12:35`.
4. Save a lesson and manually mark it complete. Playback position is progress, not evidence that you understood the subject.
5. In **My workspace**, create a collection and filter saved/recent/completed/noted lessons. Add a lesson to collections from its focus dialog. Removing a collection leaves lessons and notes intact.
6. Use the timer alongside the player. It continues in the corner when the lesson closes and resets on page reload.
7. Choose **Sign in / sync** to create an account or sign in. Verification and reset flows use the managed provider's email-code capability when enabled. Do not paste passwords or codes into an AI chat.
8. Your account opens its own cloud workspace. **Import guest workspace** is an explicit choice, not an automatic upload of a shared browser's data.
9. Check the sync status. **Saved locally / pending** is different from **Cloud synced**. Retry pending changes before signing out. A note conflict lets you choose the cloud note or explicitly replace it with your draft.
10. Export notes or a full JSON workspace backup to keep a separate copy. JSON restore through file upload is not part of this release.

### Where does the data live?

| Information | Guest | Signed in |
| --- | --- | --- |
| Saved/completed lessons | Browser local storage | PostgreSQL, with scoped local cache/pending changes |
| Notes, bookmarks, collections | Browser local storage | PostgreSQL, with local drafts |
| Playback position | Browser local storage | PostgreSQL + local cache |
| Appearance | Browser local storage | Browser local storage |
| Running timer | Page memory; resets on reload | Page memory; resets on reload |
| Password/session | Not applicable | Managed by Neon Auth; HTTP-only session cookies |
| Short-lived API JWT | Not applicable | Memory only, never deliberately saved to local storage |
| Actual video/audio | Not stored | Not stored |

Synced account caches are cleared on normal sign-out. If changes remain pending and the user explicitly signs out anyway, that account's scoped cache is retained for later recovery. Guest data remains separate. Browser storage is unencrypted; a person with access to your browser profile can inspect local data. Different domains have separate guest workspaces.

## Why these technology choices?

| Choice | Reason | Trade-off |
| --- | --- | --- |
| PostgreSQL on Neon Free | Users, lessons, collections and memberships are related; composite keys, foreign keys and transactions enforce consistency | Requires provisioning, migrations and quota management |
| Neon Managed Auth | Managed password/session/email flows; shares the selected provider and avoids writing password hashing/session code | Vendor dependency; current SDK is pinned to a beta release, so upgrades need regression tests |
| Node.js for account APIs | Official Neon serverless SQL driver and `jose` token verification | A second runtime alongside Python |
| Python for ranking | Retains the project's original ML focus and keeps retrieval code inspectable | TF-IDF does not understand deep semantics or teaching quality |
| Existing static frontend | Keeps the implemented UI and avoids a framework migration just to add accounts | State and sync orchestration are maintained explicitly |
| Same-origin auth proxy | Browser sessions work on the application's origin rather than depending on third-party auth cookies | Proxy routes, cookies, origins and errors need careful testing |
| Per-field mutations | A position update cannot accidentally replace notes/completion/collections | More API action types than one whole-workspace save |
| Versioned note writes | Stops a stale device from silently overwriting another device's note | Conflicts require an explicit user decision |
| JSONB lesson metadata | Stores a small display snapshot alongside per-user state | Some metadata duplication; not a global canonical video index |

Knowing MERN does not make MongoDB the automatic answer. This release's relationships and consistency requirements are a strong fit for SQL. A document database could work, but would move more invariants into application code.

## Recommendation pipeline

`Topic + goal → live candidates or catalogue → filters/deduplication → query TF-IDF cosine → channel diversity → up to five results`

The model compares the **actual query** with candidates. It does not use the first topic row as a substitute for the student.

- `idf(t) = log((1 + N) / (1 + df(t))) + 1`
- Sublinear term frequency: `tf(t) = 1 + log(count(t))`
- Cosine similarity over normalized query/document vectors.
- Greedy channel adjustment: `similarity / (1 + 0.25 × prior_selections_from_channel)`.

A similarity score is text relevance, not a teaching-quality probability. No supervised quality model, deep-learning inference, or generative AI runs here. A collected dataset is a valid starting experiment; duplications, noise, staleness and absent evaluation were the original weaknesses. Publishing on Kaggle did not establish quality.

## Local development

Python 3.12 and Node.js 22+ are required. Production runs Python and Node functions on Vercel.

```sh
npm ci
npm run build             # auth bundle; migration skipped locally without DATABASE_URL
npm run dev               # static + recommendation API at localhost:3000
npm run check
npm run test:server
python -m unittest discover -s tests -v
```

The small Python local server covers guest UI and ranking. Full account API testing uses a Vercel preview with its provisioned Neon branch; `python scripts/dev.py` does not emulate Node account functions. For full local platform emulation, link the correct Vercel project and use `vercel dev` with separately provisioned development variables. Do not copy production credentials into source code or request them in chat.

## Deployment and migrations

- Vercel project: `ytguide`, repository: `kushagrapandey-cmd/First_ML_project`.
- Static output: `public/`; build: `npm run build`; runtime functions in `api/`.
- Database and account functions use Singapore (`sin1`) to keep compute near storage.
- Neon resource: `ytguide-db`, Free plan. Managed Auth enabled; realtime is not needed.
- Preview database branching is enabled; production uses a stable database branch.
- `scripts/migrate.mjs` applies additive migration 1 with an advisory transaction lock. Builds fail on migration errors instead of releasing an app with missing tables.
- `scripts/verify-cloud.mjs` runs actual auth/database fixture checks only for preview deployments. It never logs fixture passwords, cookies, tokens or connection strings. Fixtures are synthetic, not user identities.
- CI runs Python tests, Node boundary tests, syntax checks and the browser bundle build without cloud credentials.

Required integration-injected server configuration:

```text
DATABASE_URL
NEON_AUTH_BASE_URL
```

Optional server configuration:

```text
YOUTUBE_API_KEY
```

Do not expose the database URL or API key in browser code. `/api/workspace?action=config` returns only readiness booleans and the public same-origin auth path.

### Enable live YouTube search

Enable YouTube Data API v3 in your Google Cloud project, create a **new restricted key**, add `YOUTUBE_API_KEY` as a Vercel Secret, and redeploy. The two historical notebook keys must be revoked; removing them from the latest files did not remove Git-history exposure. Real-key live success still needs its own test after configuration.

### Managed email and production readiness

Managed Auth provides verification/reset emails. Shared-provider email codes are useful for demos; the provider recommends custom SMTP before a wider production launch. Email delivery and password recovery must be tested with a real mailbox under the owner's control. No paid plan, third-party SMTP account, or chatbot subscription was enabled by this release.

## Repository map

| Path | Responsibility |
| --- | --- |
| `public/app.js` | Lessons, local workspace, collections/bookmarks, player, timer |
| `public/account.js` | Account UI, cloud outbox/retry, import and conflict workflow |
| `src/auth-sdk.js` | Managed auth SDK adapter; bundled at build time |
| `api/recommend.py` | Python ranker and optional YouTube adapter |
| `api/auth.js` | Bounded same-origin auth proxy; admin routes excluded |
| `api/workspace.js` | Authenticated workspace actions and ownership checks |
| `lib/identity.js` | JWKS JWT signature, issuer, audience and expiry validation |
| `lib/db.js` | Lazy SQL client and transaction-scoped user context |
| `lib/validation.js` | Input/body limits, origin checks and responses |
| `db/001_workspace.sql` | Schema, constraints and indexes |
| `scripts/` | Build, migrations, fixture verification and catalogue maintenance |
| `legacy/` | Sanitized original workshop app/notebooks/model artifacts; not served |

## Boundaries and limitations

- Catalogue mode is finite, not a fresh index of YouTube. Live mode consumes provider quota; its per-instance cache is not a distributed quota guarantee.
- The workspace API limits requests per authenticated user in PostgreSQL. It is not a complete bot/fraud defence against mass account creation.
- JWTs are short-lived. A token minted before logout can remain valid until expiry; normal browser logout clears the session and this app stops using its token.
- Notes have optimistic version checks. Saved/completed flags and position use last accepted field update. Resume position can move backwards intentionally when revisiting a lesson.
- Metadata availability does not guarantee regional playback. Video media buffering can prevent a full playback test in a cloud browser.
- The app cannot remove YouTube ads/branding/end-screen suggestions, control other tabs, or replace a browser blocker.
- There is no verified learning-outcome improvement or “best five on YouTube” guarantee. Build a separately judged held-out benchmark before claiming a better model.
- Account deletion/retention workflows, collaboration, automatic study plans, native app packaging, and JSON file restore remain future work.
- The SDK dependency tree contains optional UI packages we do not render. Versions are locked; the Zod override addresses the reported oversized-collection validation advisory. Re-run audit and integration checks on upgrades.

## Credits and contribution

The original app credits **Kushagra Pandey, Aryan Gupta, Harsh Mishra, and Ayush Nishad**, guided by **Chandan Verma**. Keep that team history when presenting the workshop work.

Kushagra supplied the original student problem/workshop context, the existing prototype/data-collection work, and the requirements and scope decisions for this modernization. The newer implementation, tests, design and documentation were developed with AI assistance. Do not assign invented individual authorship percentages. Explain what you actually understand, reviewed, changed and tested.

## Primary references

- [YouTube search API](https://developers.google.com/youtube/v3/docs/search/list)
- [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
- [Neon Auth](https://neon.com/docs/auth/overview)
- [Neon Auth JWT contract](https://neon.com/docs/auth/guides/plugins/jwt)
- [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver)
- [Vercel functions](https://vercel.com/docs/functions)
