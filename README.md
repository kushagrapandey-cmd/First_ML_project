# YTGuide

A focused YouTube learning workspace: find a lesson, study it, and pick up where you left off.

Live site: https://ytguide-five.vercel.app/

The original college Python/ML workshop explored how students could find educational videos without an endless feed. This version keeps the Python ranking engine and adds a personal account workspace. There is no chatbot.

## Current behaviour

- Anyone can browse recommendations, watch a lesson, change appearance and use the focus timer.
- **Sign-in is required** to save lessons, take notes, mark completion, bookmark timestamps, create collections or save playback progress. Guests do not create new learning-activity records in local storage.
- Signed-in activity syncs to Neon PostgreSQL. Local storage is an **account-scoped cache and pending-write queue**, not the authoritative database. “Pending” and “Cloud synced” are distinct states.
- Legacy guest data from earlier releases remains untouched and can be explicitly imported after sign-in. It is not loaded as the active anonymous workspace.
- Seven preset subjects plus **Other topic**. Add the actual question or goal, language and duration filters.
- Search filters, entered goal and current page are encoded in the URL, so refresh restores them. Changing a filter starts a new search.
- Specific goals filter candidate text before ranking; a generic Python course cannot qualify solely because the selected subject is Python.
- Notes, saved/completed lessons, collections, timestamp bookmarks and resume positions belong to the authenticated user. The API checks authentication and ownership independently of the UI.
- Notes use optimistic version checks; conflicts require an explicit choice. Imports use receipts to avoid duplicate retry batches.
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
| Ranking | Python TF-IDF cosine similarity + channel diversity | Explainable text relevance; it does not measure teaching quality or deep semantic understanding |
| Host | Vercel | Static assets plus Python and Node functions; account compute is configured near storage |

### Recommendation flow

`Subject + actual goal → YouTube query/cache or catalogue → goal/language/duration filters → deduplicate → TF-IDF cosine ranking → channel diversity → up to five lessons`

The normalized goal is part of the live retrieval query **and cache key**. The per-instance cache holds at most 128 entries, with a 15-minute TTL and negative caching. It is not a distributed rate limiter. Provider quotas still apply.

- Smoothed IDF: `log((1 + N) / (1 + document_frequency)) + 1`.
- Sublinear TF: `1 + log(term_count)`.
- Cosine similarity over normalized query/document vectors.
- Channel penalty: `similarity / (1 + 0.25 × previously_selected_from_channel)`.

A real generative AI model is not necessary to fix broken identity, persistence or video retrieval. Semantic ranking can be evaluated later against a separately judged dataset. Do not describe the current system as a neural teaching-quality model or promise “the best five videos.”

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

Cloud data is applied only after the account API responds successfully. Saving is locked while authentication is unresolved or expired. Normal sign-out clears synced account caches; pending writes can be retained with an explicit warning for recovery. Browser caches are not encrypted.

## Development and verification

Node.js 24 and Python 3.12:

```sh
npm ci --ignore-scripts
npm run check
npm run test:server
python -m unittest discover -s tests -v
npm run build
npm run dev
```

The Python local server serves static assets/recommendations, not Node account functions. Use a provisioned Vercel preview to test real managed authentication/database boundaries. Do not copy production credentials into source code.

The build applies additive database migrations when `DATABASE_URL` is available. Preview builds run `scripts/verify-cloud.mjs` with isolated synthetic fixture users, test ownership/conflicts/CRUD, and clean up fixture records. It skips production. Unit/DOM tests use mocked services and do not by themselves establish real cloud success.

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
- Keep the LinkedIn demo on hold until successful production account flows have been verified. Live-key search now passes. The missing trusted domain has been corrected. A subsequent owner login attempt returned Invalid email or password; successful login still requires a valid registered account.

## Credits

Original workshop team: **Kushagra Pandey, Aryan Gupta, Harsh Mishra and Ayush Nishad**, guided by **Chandan Verma**. Kushagra supplied the project context, original prototype/data work, requirements and scope decisions. Modern implementation, tests and documentation were developed with AI assistance. Explain the parts you understand, reviewed, changed and tested; do not invent authorship percentages.

## Primary references

- [YouTube search API](https://developers.google.com/youtube/v3/docs/search/list)
- [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
- [Neon Auth](https://neon.com/docs/auth/overview)
- [Neon JWT contract](https://neon.com/docs/auth/guides/plugins/jwt)
- [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver)

## Release status — 27 October 2026

The repair is deployed to the existing Vercel `ytguide` project. Production live search is verified with the owner-provided key. The production Neon branch had no trusted origins; `https://ytguide-five.vercel.app` was added and read back successfully. The next real secure-browser login attempt passed the origin gate but returned **Invalid email or password**. Successful owner login and authenticated cloud persistence remain unverified; do not present that credential rejection as successful login.

The owner explicitly authorized both GitHub and Vercel publication. The release source and documentation are being synchronized to GitHub `main`; deployment checks should use that exact revision. No paid plan or AI subscription was enabled. The attached Neon resource reports the Free plan.

MediConnect uses its own Express password/session implementation with Neon as its database. YTGuide uses Neon Managed Auth for identity plus a separate authenticated workspace API. Managed Auth is a design choice, not a requirement for using PostgreSQL. Both applications enforce record ownership in their server APIs.
