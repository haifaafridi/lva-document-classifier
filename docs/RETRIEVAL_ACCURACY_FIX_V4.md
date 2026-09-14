# Retrieval accuracy fix v4

The v3 evaluation showed 70% Top-1 and 80% Top-3. Both remaining misses targeted `GS-02 / 010143 Accounts Payable`.
The optional cross-encoder produced unrelated final candidates, so v4 changes the production default to a more conservative, testable hybrid retrieval strategy.

## Retrieval path

1. Clean and sanitize extracted text.
2. Create the normal tokenizer-aware long-document chunks.
3. Extract short, substantive evidence sentences from the same document.
4. Embed both chunk and evidence queries with the configured BGE query mode.
5. Search Milvus for each temporary query vector; none of these vectors are stored.
6. Aggregate dense evidence across the document.
7. Run local BM25-style lexical retrieval using whole-document and sentence-level evidence.
8. Fuse dense and lexical scores.
9. Return Top 3 to Gemini for final classification.

The optional MS-MARCO cross-encoder is disabled by default. It can be benchmarked later, but it should not be enabled merely because it is a reranker; it must demonstrate an accuracy improvement on the project's own labeled test set first.
