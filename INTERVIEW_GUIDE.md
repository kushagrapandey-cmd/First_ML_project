# Explaining YTGuide in an interview

## A straightforward introduction

“YTGuide started as a college workshop project to help students choose a YouTube lesson without falling into an endless feed. The original implementation used title bag-of-words similarity on a collected dataset. The newer version ranks the user's query directly, explains the matches, handles provider failures, and provides a focused workspace with notes and progress.”

If asked about AI assistance, acknowledge it. Your interview advantage comes from demonstrating understanding and debugging ability, not claiming every line was independently typed.

## Five-minute demonstration

1. Search Python, then add `functions` or `classes`. Explain what text relevance can and cannot mean.
2. Expand **Why this lesson?** Show that it displays matching terms, not a fake confidence score.
3. Save a lesson, open it, write a short note, and mark it complete.
4. Close the lesson, open **My workspace**, and reload. Show persisted saves, notes, and progress.
5. Export notes. Start/pause/reset the timer.
6. Select a topic/language pair with no candidates, such as Linux + Hindi in catalogue mode. Explain why an honest empty result is useful.
7. Show the source notice. If a fresh live key has not been configured, explicitly say catalogue mode. Do not present cached candidates as a live API search.

## Questions you should be able to answer

**Was making your own dataset a bad decision?**
No. Collecting data is normal engineering. The problems were duplicates, noisy labels, stale candidates, and treating similarity as quality without evaluation. Kaggle publication does not validate a dataset.

**What exactly is the model?**
A TF-IDF representation with cosine similarity and a channel diversity heuristic. IDF is fitted from the request's candidate corpus. No supervised teaching-quality training or deep-learning inference happens in production.

**Why not use a large language model?**
The immediate job is retrieving existing video IDs. A small deterministic model is cheap, explainable, and does not invent videos. A semantic model could improve synonym matching, but must demonstrate gains on a judged benchmark first.

**What was wrong with selecting the first topic row?**
That row's title is not the user's intent. Its nearest neighbors may repeat the same content and ignore the rest of the topic. Ranking the explicit query removes the arbitrary seed-video dependency.

**What are TF, IDF, and cosine similarity?**
TF measures a term's presence/frequency. IDF gives more weight to terms that distinguish documents. Cosine measures vector alignment after normalization. High similarity is text overlap, not a probability that a lesson is good.

**Why can a result set contain fewer than five videos?**
Strict filters or provider metadata can leave fewer valid candidates. Duplicating results or relaxing filters silently would mislead the user.

**How does the live API stay secure?**
The key stays in a server-side environment variable. The browser talks only to the app API. Input enums and length limits bound requests; fixed topic/language cache keys avoid a provider search for every arbitrary goal string. The cache is per instance, so shared rate limiting is still needed for scale.

**Does it block distractions?**
It removes the application's feed/comments and reduces decision overload. It cannot block other tabs, remove YouTube ads, or remove every player recommendation. A browser extension has different capabilities.

**What would you measure?**
Use independently judged relevance labels and held-out queries for nDCG@5/MRR/coverage; then a consented student study for time-to-start and learning outcomes. Automated correctness tests do not prove pedagogical value.

**Why no database?**
A device-local workspace is enough for a no-login demo and avoids unnecessary personal data collection. The cost is no cloud sync and loss on clearing browser storage. A database becomes appropriate with authenticated cross-device persistence.

**Why this stack?**
Python retains the original project's recommendation focus; the standard library is sufficient for a small sparse TF-IDF ranker and API adapter. Static HTML/CSS/JS keeps the UI lightweight. Vercel serves static files and runs a Python function. React would be reasonable as complexity grows, but was not required to solve this problem.

**What fails gracefully?**
Invalid filters return a 400, provider failure falls back with a notice, empty results explain how to broaden filters, failed browser storage produces a warning, and embed failure has a YouTube link. Reload resets the timer by design.

## Code reading order

1. `api/recommend.py`: `recommend`, `rank`, `live_candidates`, then the HTTP handler.
2. `public/app.js`: `findLessons`, `card`, `openLesson`, local storage helpers, timer functions.
3. `tests/test_recommend.py` and `tests/test_http.py`: inspect a test, change the behavior temporarily, and understand why it fails.
4. `vercel.json`: static output, included catalogue, and security headers.
5. `legacy/main.py` and the sanitized training notebook: explain the before/after implementation.

Do not memorize this as a script. Run the project, change a ranking weight, inspect the output, and trace a request from browser to Python to returned results until you can explain each boundary.
