# Explaining YTGuide in an interview

## One-minute introduction

“YTGuide is a focused YouTube learning workspace. The idea started as a college Python/ML workshop project. The problem was that finding a tutorial often becomes endless scrolling, and useful lessons get scattered across tabs.

The current app retrieves candidates from YouTube or a maintained catalogue and ranks them against the learner's actual goal. It combines a pretrained multilingual sentence model with keyword relevance and channel diversity. Learners can browse publicly; signing in unlocks saved lessons, notes, timestamp bookmarks, collections and progress stored in PostgreSQL.

I developed the modern version with AI assistance, directed the requirements and tested the product. The work taught me that a recommendation demo also needs authorization, reliable persistence, honest fallback states and evaluation.”

## Architecture walkthrough

The browser is static HTML/CSS/JavaScript on Vercel. One Python function handles candidate retrieval, filters and ranking. Node functions handle a same-origin auth proxy and the workspace API. Neon Auth manages identity; Neon PostgreSQL holds application data. These are modules in one deployment, not independently operated microservices.

Search flow: browser goal → Python API → PostgreSQL candidate cache/YouTube API or catalogue → filters → semantic and keyword scores → diversity → at most five lesson cards. Videos play through YouTube's iframe; we do not host video files.

Save flow: browser sign-in → same-origin proxy → Neon Auth session → short-lived JWT in memory → workspace API verifies signature and claims → SQL scoped to verified user ID → database confirmation → cloud-synced status. A scoped local outbox retries pending writes; local storage is not the source of truth.

Read [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) for schema, request boundaries and concurrency.

## Questions and accurate answers

**What AI actually runs?**
The pretrained `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` model, converted to quantized ONNX, runs on the server CPU. It converts a question and lesson metadata into 384-dimensional vectors. Cosine similarity compares their meaning. It is a neural recommendation component, not a generative chatbot.

**Did you train it? Where is your dataset?**
We use pretrained weights; we did not train this network. `api/catalog.json` contains 54 active metadata-checked lessons. `data/legacy_clean.json` contains 139 valid unique original candidates kept separately. `data/dataset_manifest.json` records provenance. The original export had 176 rows; cleaning removed 36 duplicate occurrences and one malformed unique ID. Live search brings current candidates beyond the fixed catalogue.

**How does the hybrid score work?**
The score is 80% semantic cosine plus 20% TF-IDF cosine. Matches below semantic similarity 0.30 are excluded. A greedy 0.15 repeated-channel penalty encourages educator variety. Explicit technology names constrain candidates. The numbers are heuristics; we have not established optimal weights. They are not confidence probabilities.

**Why both embeddings and TF-IDF?**
Embeddings can match paraphrases and supported cross-language meaning; TF-IDF preserves exact technical vocabulary. Neither guarantees factual correctness or teaching quality. Subject constraints help prevent a generic semantic match from replacing an explicit technology request.

**How did you evaluate it?**
A manually authored 24-query development smoke set compared the same 54 candidates and normalization. Hybrid put the intended topic first for 22/24 queries versus 21/24 for lexical ranking; MRR@5 was 0.958 versus 0.889. Two top-one misses are retained. This is small development evidence, not 92% general accuracy or an independent benchmark. Next is a separately judged held-out set with relevance grades, nDCG@5, MRR, coverage and latency.

**Why not use an LLM API?**
Semantic ranking is the immediate requirement. A compact pretrained encoder performs that task without a paid inference service. This adds model package size, CPU and cold-start costs. A chatbot would need a separate grounded use case, evaluation and cost plan.

**Is the system personalized?**
Current ranking depends on the submitted query and filters. It does not learn a user-interest model from history or private notes. Account persistence makes the workspace personal; that is different from personalized machine learning.

**Authentication versus authorization?**
Neon Auth establishes identity. The workspace API verifies the JWT and derives the user ID from it, then scopes each SQL operation and ownership check to that user. Hiding a button is only UX; direct unauthorized API requests must also fail.

**Why PostgreSQL?**
Users, lessons, collections and memberships have relational constraints. Composite keys, foreign keys and transactions support per-user uniqueness, ownership invariants and consistent imports. Parameterized SQL prevents user text from becoming SQL syntax; authorization is a separate concern. Do not claim database RLS already enforces isolation: current ownership checks are in the server API.

**What if two devices edit a note?**
Notes use optimistic versions. The update must match the last version the editor saw. A stale write returns 409 with the current note, and the client keeps its draft for a deliberate choice. This is not collaborative text merging.

**What if the network fails?**
The client retains an account-scoped pending operation and retries. It distinguishes pending from confirmed cloud saving. Imports have deterministic receipts to avoid duplicate retry batches. Other fields use per-field accepted writes; we do not overwrite the whole workspace JSON.

**How do you handle quota and inference failures?**
A shared PostgreSQL cache reuses YouTube candidates for 15 minutes. Leases reduce duplicate in-flight calls; failure caching and a shared daily retrieval budget protect quota. Automatic source may fall back to the labelled catalogue; explicit Live shows an error. Neural inference failure uses a labelled keyword fallback. Free-tier quotas still apply.

**What does local storage contain?**
Theme preferences and account-scoped drafts/cache/outbox. Search context is in the URL. No new guest study activity is saved. Auth tokens are held in memory and sessions use HTTP-only cookies. Browser drafts are not encrypted.

**What did you personally contribute?**
YTGuide is developed and maintained by Kushagra Pandey, with AI assistance for implementation and documentation. Explain your requirements, product decisions, debugging and validation accurately. Demonstrate understanding by tracing a request and explaining a real trade-off; do not claim that the pretrained neural model was trained from scratch.

## Five-minute product demonstration

1. Start signed out. Search a specific goal and explain the source notice and relevance explanation. Try two different topics.
2. Attempt Save: explain the sign-in gate. Sign in using your own prepared account.
3. Save a lesson, create a collection, add a note and timestamp bookmark, and mark completion. Wait for cloud confirmation.
4. Refresh and show the retained topic/filter state. Use a second signed-in browser/device to establish cross-device persistence.
5. Show the timer, then logout and verify activity controls relock.
6. Open the model card, evaluation JSON, system design and passing GitHub CI. Explain a remaining limitation.

The owner confirmed production signup/login/collections/saving on 27 October 2026. Isolated real backend fixtures separately passed ownership, CRUD, note conflicts, retries and logout. Do not claim that owner confirmation also tested password recovery, every device or every YouTube embed.

## Preparation exercises

- Trace one search through `api/recommend.py`, `lib/query.py`, `lib/semantic.py` and `lib/search_cache.py`.
- Change one ranking coefficient locally and compare the evaluation; explain why a small development improvement may not generalize.
- Trace one save through `public/account.js`, `api/workspace.js`, `lib/identity.js` and parameterized SQL.
- Reproduce a 409 note conflict in isolated sessions and explain why the draft survives.
- Read both SQL migrations and explain composite ownership constraints, shared cache and budget rows.
- Know the roadmap: relevance labels, wider catalogue, latency measurements, privacy/account lifecycle and student feedback before additional AI scope.
