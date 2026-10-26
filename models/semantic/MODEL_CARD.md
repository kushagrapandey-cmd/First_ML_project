# YTGuide semantic ranker

Base model: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2.
ONNX conversion: Xenova/paraphrase-multilingual-MiniLM-L12-v2.
Pinned conversion revision: 2c4055b12046f11709e9df2c122e59ffbdc2f900.
License: Apache-2.0. Upstream model card: https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 . Conversion card: https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2 .

We use pretrained weights for inference. We did not train this neural network on the workshop dataset or on private notes. Quantized weights and tokenizer download at build time from the pinned revision and are checked against SHA-256 hashes. They are packaged on the server, not downloaded by visitors. No remote inference account or paid AI API is used.

Runtime: ONNX Runtime CPU, one inference thread, maximum 128 tokens, attention-mask mean pooling, L2-normalized 384-dimensional embeddings. Metadata embeddings are cached in process with a 1,024-document bound. Candidate retrieval is separately cached in PostgreSQL.

Ranking: 80% semantic cosine similarity and 20% TF-IDF keyword relevance, followed by a channel-diversity adjustment. Explicit technology names constrain candidates to prevent an unrelated subject from winning on generic learning language. Hindi spellings of selected technology names are normalized; this is not a general translation engine. A minimum semantic score rejects weak matches. Keyword fallback is labelled if inference is unavailable.

The model sees titles, tags and descriptions. It does not watch the video, verify technical claims, assess pedagogy or establish learning outcomes. The checked-in evaluation is a small manually authored relevance smoke test, not an independent quality benchmark. Inference latency measurements from the build workspace are not a global website-performance guarantee.
