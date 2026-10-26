# YTGuide verification — 26 October 2026

## Scope

The user story is: choose a study topic → request recommendations → rank valid candidates → inspect five or fewer results → save/open a lesson → take notes and record progress.

## Evidence

- **23 automated tests passed**, covering ranking, query sensitivity, all seven topic shortlists, duplicate IDs, malformed IDs, invalid filters, language filtering, empty results, duration parsing/filtering, provider failure, missing keys, positive/negative caching, and real local HTTP request/response boundaries.
- `node --check public/app.js` passed.
- Vercel built the static frontend and Python 3.12 function successfully. The initial tested commit is `d655b5c`; follow-up commits contain the final thumbnail fallback and in-dialog timer changes.
- The deployed Python API returned HTTP 200 with five Python videos, real catalogue durations, algorithm metadata, and `liveConfigured: false`.
- A fresh unauthenticated request to the production domain returned HTTP 200 and the actual YTGuide page, not an authentication page. The proposed SSO configuration change was unnecessary and was not applied.
- Public YouTube oEmbed metadata checks succeeded for all 39 retained catalogue candidates. One unavailable candidate was removed. Public watch metadata supplied durations for the retained candidates. Metadata success is not proof of regional playback.

## Browser checks

| Boundary/feature | Result |
| --- | --- |
| Discover page and five Python results | Verified in deployed Chrome |
| Save lesson → workspace count | Verified |
| Notes and manual completion | Verified |
| Reload → saved lesson, notes, completion remain | Verified |
| Light/dark appearance | Verified; dark body background computed as `rgb(21, 24, 33)` |
| Focus timer start/pause/reset | Verified |
| Linux + Hindi → explicit empty result | Verified |
| Player → user-initiated YouTube iframe | Verified |
| Video starts and advances with audio | Not confirmed: this cloud browser buffered at the beginning |
| External thumbnail rendering | This environment returned HTML instead of JPEG from the image host; fallback artwork added |
| Live YouTube with a fresh real API key | Not configured; adapter success/failure paths covered with mocks |
| Small mobile viewport interaction | Pending a device/browser viewport test; responsive breakpoints implemented |

The cloud browser's console also contains extension-generated metadata errors unrelated to application code. They are not counted as application failures or evidence of a clean console.

## Release checks

- No API key is included in the browser bundle or current notebooks. The historical keys are still compromised and must be revoked by the Google Cloud owner.
- The production path does not read legacy pickle files, import Streamlit, or need Kaggle.
- Static output is restricted to `public/`. Security headers include CSP, nosniff, frame protection, and a referrer policy compatible with YouTube embeds.
- API inputs are bounded and validated; remote video strings are escaped before HTML rendering.
- No paid service, plan upgrade, paid model call, or database was enabled.

## Limits

This is correctness and deployment evidence, not a guarantee of zero bugs or superior teaching recommendations. A held-out judged retrieval benchmark and a student learning study remain future research work. Real-key live retrieval, regional YouTube playback, and mobile device interaction must be validated independently before claiming them as fully tested.
