# YTGuide verification — 26 October 2026

## Release scope

Accounts, PostgreSQL cloud persistence, guest imports, collections, timestamp bookmarks and resume position were added to the existing recommendation/study workspace. No chatbot is included. Live YouTube search still needs a new owner-provided API key; catalogue mode remains clearly labelled.

## Automated evidence

- **23 Python tests passed:** ranking/query sensitivity, topic coverage, deduplication, malformed/invalid input, strict language/duration filtering, empty results, provider fallback/cache behavior, and actual local HTTP boundaries.
- **9 Node boundary tests passed:** video/UUID validation, body limits, hostile-origin rejection, direct unauthenticated workspace rejection, public config safety, auth admin-route rejection and method restrictions.
- JavaScript syntax checks and the browser auth bundle build passed.
- Actual preview database migration succeeded on the provisioned Neon database.
- Preview build `1bbdecb` completed with `CLOUD_QA_PASS`: real managed signup/session/JWT, workspace CRUD, two-user isolation, stale-note 409, persisted timestamp progress, idempotent import, logout and forged-token rejection.
- Follow-up preview checks exercise the same-origin auth proxy and cookie rewriting as well as the underlying provider. Inspect the latest deployment's `CLOUD_QA_PASS` build record for the final result.
- Fixture tests run only on preview deployments. Credentials/tokens/cookies are generated in memory and are never printed. Application fixture rows are removed afterwards; managed fixture accounts belong only to the preview branch.

## Browser evidence

| Flow | Evidence/status |
| --- | --- |
| Discover renders five lessons | Verified on deployed preview and previous production |
| Save, note, manual completion, reload persistence | Verified on the preceding release |
| Guest collection creation | Verified in the account-enabled preview |
| Timestamped bookmark | `12:35 · Functions recap` rendered after creation |
| Collection membership | Lesson showed `Interview revision` and remove control |
| Focus timer start/pause/reset | Verified on the preceding release |
| Timer beside notes and continuing after close | Verified on the preceding release |
| Markdown export | Browser download event verified on preceding production |
| Dark appearance | Verified, including computed dark body background |
| Linux + Hindi catalogue filter | Verified explicit empty result |
| YouTube iframe loading | Verified on preceding release |
| Actual video media advances with sound | Not confirmed: cloud browser buffered at the start |
| Resume integration | IFrame API integration implemented; real playback/device verification remains separate |
| Full account UI with a real owner mailbox | Requires the owner's own signup/verification; provider/API fixture checks passed |
| Mobile physical-device interaction | Not claimed as fully tested |

The provider's shared email-code service is suitable for this demonstration, but actual inbox delivery/recovery needs a mailbox controlled by the owner. Provider production guidance recommends custom SMTP before a wider launch.

## Security and release evidence

- Server-only Neon database configuration is provisioned by the integration.
- Account API validates signed JWTs and uses their subject for all ownership checks. User-controlled `user_id` is not used as authority.
- Real two-user fixture checks confirm a user cannot add to/rename another user's collection, read its note, or delete it through their own scope.
- Note writes carry an expected version; conflicts preserve the server note and return 409.
- Imported guest notes do not overwrite existing cloud notes; repeat batches return an existing import receipt.
- Auth proxy route allowlist excludes admin operations and arbitrary upstream URLs.
- CSP, referrer policy, nosniff and frame protection are configured.
- A patched Zod override was added after dependency audit reported an oversized-collection advisory. Inspect the latest audit output rather than treating an old result as current.
- No paid plan, chatbot service, external SMTP purchase or video download was enabled.
- Default Vercel protection remains enabled. The production domain was publicly reachable without disabling it.

## Limits

These tests establish specific correctness properties, not zero bugs, production-scale reliability, recommendation superiority or improved learning outcomes. Authentication fixture tests are stronger than mocks but do not replace an owner-mailbox/browser/device check. No real-key live YouTube success is claimed until the key is configured and tested.
