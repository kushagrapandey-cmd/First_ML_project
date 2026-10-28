# YTGuide roadmap

The shipped workspace was stabilized on 28 October 2026 with desktop/phone browser and PostgreSQL regression suites. These remaining items are proposed future priorities, not released features or committed delivery dates. Current capability and evidence are documented in README.md and QA_REPORT.md.

| Priority | Work | Evidence required before release |
| --- | --- | --- |
| 1: Launch polish | Independent mailbox/password-recovery test, second-device persistence, phone/tablet/keyboard walkthrough, clearer sync/error messages | Recorded user journeys on supported devices; account recovery tested end to end |
| 1: Repository presentation | Add a demo image/video, useful repository description/topics, and choose a root application license with the original contributors | No private data in assets; owner confirms license choice; old exposed notebook keys confirmed revoked |
| 2: Dataset and evaluation | Broader current candidates, metadata freshness, language/duration coverage, human relevance grades and a separate held-out query set | Reproducible provenance, duplicate checks, lexical comparison, nDCG@5/MRR/coverage and error analysis; no reuse of test labels for tuning |
| 2: Speed and operations | Measure cold/warm p50/p95 latency and request failures; consider precomputed catalogue vectors; expired-cache row cleanup and abuse controls | Measured improvement under the same workload, bounded storage and quota use; assess CPU/inference time separately from API/network time |
| 3: Product reliability | Account deletion/retention, JSON restore, larger-workspace pagination and restore drills | Ownership/conflict/retry/deletion tests; user-facing recovery and retention behaviour |
| 4: Additional AI | First try explainable learning paths using prerequisites and learner-selected goals; later evaluate transcript-grounded summaries/quizzes if permitted source text is available | Separate labelled evaluation; cite supporting transcript segments; test factual accuracy and abstention; disclose provider/runtime costs |
| 5: Learned personalization | Optional feedback such as “relevant/not relevant” and level mismatch; later compare a learned reranker with the existing hybrid | Clear opt-in/data policy, enough representative consented labels, held-out improvement and an anonymous cold-start strategy |

Do not fine-tune the encoder on 54 catalogue rows or treat 139 unverified legacy candidates as training labels. Metadata is a candidate corpus; supervised learning needs meaningful labels and an evaluation split. Do not optimize only watch time or call completion a learning outcome.

## Current boundaries

No chatbot, transcript summaries, quizzes, custom neural training, collaborative filtering, automatic study-path generation or video-quality scoring is implemented. Future features should be driven by observed student problems and evaluation, not added solely to make the AI label larger.

## Repository readiness

The repository has local setup commands, server configuration names, architecture/schema reasoning, model provenance/license, dataset-cleaning/evaluation scripts, CI, verification evidence, credits and an interview guide. It is suitable for a portfolio demonstration with its stated limits.

A root application license has not been chosen. The model's Apache-2.0 notice does not automatically license the application code. Do not advertise unrestricted open-source reuse until the contributors choose a license. The repository name remains the historical `First_ML_project`; a clearer name/description is optional presentation work. No API token or real `.env` belongs in the repository. Historical key revocation must be confirmed by the owner.

