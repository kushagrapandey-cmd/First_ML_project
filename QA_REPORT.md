# YTGuide repair verification — 27 October 2026

## Release state

**Direct Vercel production deployment is READY:** `dpl_AoZi1GT1SExCaqBYrLUghBBvNFuA`, serving `https://ytguide-five.vercel.app/`, source through local commit `814a8d6`. GitHub main now includes repair commit `b6770f2f3171261ed78645760c793765069a2664`, and Vercel deployment `dpl_EwD5jV97EanwXDVtR5s4qt8xDEwj` is READY from that commit.

**Live search passes; the trusted-origin blocker is corrected.** Neon production branch `br-patient-smoke-b3nu96v6` initially had an empty domain allowlist. Added the exact production origin and verified it by reading the allowlist back. A subsequent secure owner-provided sign-in attempt returned **Invalid email or password**. No successful authenticated cloud-persistence flow is claimed.

## Live checks performed after deployment

- `/api/recommend?action=meta`: HTTP 200, `liveConfigured: true`.
- `/api/workspace?action=config`: HTTP 200, accounts configured, `guestMode: false`.
- Anonymous `/api/workspace`: HTTP 401.
- Python decorators: five topic-specific live results from 22 matching candidates, confirmed in the browser.
- SQL joins: five distinct live results from 19 matching candidates, confirmed through the form and API.
- Other topic / Kubernetes networking: five live results from 25 matching candidates via the real key.
- Signed-out Save opens sign-in; workspace stays at zero saved lessons.
- Reload preserves SQL / joins / Live YouTube and the current workspace page. It does not reset to Python.
- Lesson dialog opens, guest notes remain disabled, a YouTube iframe loads, About navigation and the focus timer work. Iframe creation does not prove uninterrupted media playback in every region.
- Actual secure sign-in after the domain fix: **Invalid email or password**. The provider now accepts the site origin. The submitted credentials did not establish a session.
- Runtime error/warning scan returned Node `url.parse()` deprecation warnings from the platform runtime. No application exception appeared in the returned records. This is a limited log-window observation, not a proof of zero future failures.
- Re-ran all 44 automated checks and syntax checks after deployment; passed.

## Reproduced / established baseline

- Opened `https://ytguide-five.vercel.app/` in the cloud browser. Observed the Python default, five catalogue courses, guest workspace labels and active save controls.
- The live sign-in dialog renders. Successful account login was not tested with a real owner's account.
- Source inspection confirmed guest activity writes and loading from local storage; all refreshes called an unconditional default Python search.
- Source inspection confirmed the live YouTube request/cache ignored the entered goal. The goal only affected reranking a fixed subject pool.
- Vercel environment metadata contains database/auth variables and no `YOUTUBE_API_KEY`. No secret values were retrieved.

## Implemented repair

| Problem | Change |
| --- | --- |
| Login rejects existing short passwords before request | Sign-in accepts existing nonempty passwords; new password forms require at least eight characters, with provider validation still authoritative |
| Stale/unclear sign-in session result | Small same-origin HTTP adapter; uncached server session lookup; actionable provider/network errors; a missing session no longer falsely claims account creation |
| Initial connection failure leaves Sign in unusable | Sign-in retries account initialization |
| Anonymous saves/notes/bookmarks/completion/progress | Activity gates; no new guest activity storage; account controls unlock only after cloud workspace loads |
| Same generic courses for specific goals | Goal included in YouTube query/cache and candidate filtering; catalogue requires all meaningful goal terms |
| Unsupported arbitrary topics | Other topic option; honest empty/error response and direct YouTube search |
| Refresh resets Python/page | Search state/current view restored from URL; filter changes start fresh requests |
| Sign-out leaves visible account state | Cache cleanup and controls relock; session checked on focus for an existing account |

Legacy guest originals are retained for explicit import; personal activity is not silently uploaded. Signed-in data uses the existing PostgreSQL API, with account-scoped device drafts/outbox for retry. Keeping such a cache does not replace database persistence.

## Current automated evidence

- **28 Python tests:** ranking, deduplication, query sensitivity, all preset subjects, strict filters, goal-specific search/cache keys, unsupported-goal empty results, explicit-live errors and HTTP boundaries.
- **16 Node/DOM tests:** validation, API authorization, hostile origins, public-config redaction, provider route allowlist, guest activity blocking, no guest activity writes, URL restoration, automatic filter search, account-scoped state, bookmark timestamps, same-origin auth requests, provider errors/timeouts, successful sign-in/save/sign-out orchestration against mocked services, and initialization retry.
- Syntax checks, production browser-bundle build and `git diff --check` pass.
- The auth browser bundle no longer imports the large managed-auth SDK/UI dependency tree. Provider-managed identity remains unchanged.

DOM account tests use mocked services. They validate frontend behaviour, not real provider/database availability.

## Remaining work

1. Successful login with a valid registered account, followed by cloud-backed note/save/bookmark/collection tests, reload, separate-session persistence, logout and account isolation. The secure owner login returned Invalid email or password. Passwords/codes must never be pasted into chat. No additional attempt was made after that credential rejection.
2. GitHub/Vercel synchronization completed: main ref and production deployment both confirm repair commit b6770f2.
3. Preview-only cloud fixture tests were not run for this repair. No production fixture account was created as a workaround.

Neon production domain configuration is fixed. The attached `ytguide-db` resource reports Free (`free_v3`), no credit card required. Vercel’s API additionally confirms Hobby. No plan upgrade, AI subscription or wildcard-domain access was enabled.

Provider domain setup reference: https://neon.com/docs/auth/guides/configure-domains .

## Phase 1 verification — approved release

- 19 Node/DOM and 29 Python checks pass, including Unicode goals, empty custom-topic handling, no cold-visit provider call, the corrected fallback URL and preserving/completing a Save action after login.
- Real isolated Neon branch `br-round-bread-b33r9v1p`: signup, session cookies, JWT signature/issuer/audience/expiry, workspace CRUD, notes/version conflicts, collections, bookmarks, playback positions, idempotent imports, two-user isolation, logout and forged-token rejection passed.
- The environment's Node fetch took 9–12 seconds for public signing keys, exceeding the former 7-second timeout. QA used urllib over verified TLS for that exact public JWKS URL while retaining jose signature/claim checks. Production now permits a 15-second key lookup and distinguishes unavailable verification from an invalid session.
- Shared candidate caching passed against the isolated database across independent HTTP connections, invoking the candidate fetch only once.
- Temporary fixture users/records are cleaned by the test runner; the disposable branch expires automatically after one day. No production test accounts were created.
- A successful owner browser session remains a separate check; these real backend tests do not claim a successful owner password submission.

## Phase 2 semantic release checks

- Active catalogue: 54 verified entries. Original export: 176 rows, 140 unique IDs; cleaned output retains 139 valid IDs after 36 duplicate occurrences and one malformed unique ID are removed. Unverified legacy candidates stay separate.
- Quantized multilingual MiniLM actually ran on CPU with the pinned ONNX/tokenizer assets. Hindi semantic SQL matching, Hindi technology-name handling, explicit subject constraints, missing-model fallback, inference-error fallback and invalid ranking parameters are covered.
- 19 Node/DOM checks and 35 Python checks pass (including six semantic/fallback checks); model assets are required for the integration cases.
- A 24-query development smoke benchmark recorded top-one topic/intent matches of 22/24 hybrid vs 21/24 lexical, and MRR@5 of 0.958 vs 0.889. It is small, manually authored and not an independent quality study. Two top-one misses are retained in the checked-in report.
- Local model measurements record cold and warm inference separately. They are not webpage-load or global production-latency claims.
- Model files are checksum-pinned and fetched at build time; no visitor model download, paid inference API, new AI account or plan upgrade is required. Deployed bundle size and actual production hybrid mode remain post-build release checks.
- Account APIs and isolated cloud fixture results from Phase 1 remain applicable; Phase 2 does not migrate user data or change identity providers.
