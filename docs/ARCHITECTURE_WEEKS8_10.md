# Architecture - Weeks 8 through 10

## 1. Permanent LVA knowledge base

```text
Live LVA locality schedules
        |
        v
Node.js sync/parser
        |
        v
Normalized record series
(schedule / series / description / retention / disposition)
        |
        v
text_to_embed = series_title + series_description
        |
        v
BGE Small English v1.5
(mean pooling + normalization)
        |
        v
384D vector + scalar metadata
        |
        v
Milvus / Zilliz
GS_Schedules_All_Localities
```

The source JSON does not contain an ID. The Milvus schema has `id INT64 PRIMARY KEY AutoID=true`, so Milvus generates its own primary key.

## 2. Runtime document pipeline

```text
User upload (<=2 MB)
        |
        v
Azure Blob Storage
        |
        v
Read stored bytes
        |
        v
Format-specific text extraction
  PDF / DOC / DOCX / XLS(X) / Image
        |
        +--> scanned page/image -> OCR
        |
        v
Clean text
        |
        v
Token-aware chunks (380 tokens, 64 overlap)
        |
        v
BGE query embeddings (one per chunk)
        |
        |  IMPORTANT: temporary only, never inserted
        v
Milvus Top-5 per chunk
        |
        v
Cross-chunk aggregation
        |
        v
Top 3 distinct LVA record-series candidates
        |
        v
Gemini structured classifier
        |
        +--> MATCH: must be one of those candidate pairs
        +--> NO_MATCH: no candidate sufficiently supported
        |
        v
Scalar Milvus query by selected schedule + series number
        |
        v
Canonical full metadata
        |
        v
User-facing final result
```

## 3. Why chunk instead of one whole-document embedding?

BGE Small's underlying configuration has a 512-position maximum. Sending a long document as one input causes truncation and makes later content invisible to retrieval. The project therefore uses the model tokenizer, creates 380-token chunks with 64-token overlap, and searches each chunk separately.

Overlap helps preserve meaning that crosses a chunk boundary. For example, a series-defining sentence can start at the end of one chunk and finish in the next.

For exceptionally long documents, the project caps the number of query chunks to control latency. It preserves the beginning, end, and evenly spaced coverage from the middle instead of keeping only the first N chunks.

## 4. Cross-chunk retrieval aggregation

Each document chunk searches Milvus independently. The same LVA series can appear for multiple chunks. The application groups those duplicate candidate hits and combines:

- strongest similarity;
- mean of the strongest few similarities;
- how many chunks support the candidate;
- reciprocal rank evidence.

The result is a document-level Top 3 rather than an arbitrary Top 3 from only one chunk.

## 5. Why the uploaded document vector is not stored

The document embedding exists only long enough to query Milvus. Thousands of user uploads should not create thousands of permanent database entities. The database contains only the reusable LVA knowledge base.

## 6. Role separation

### BGE embedding model
Converts semantically similar text into nearby numeric vectors. It does not know or enforce the final retention decision.

### Milvus/Zilliz
Searches the stored vector space and returns candidate record series. It is a retrieval engine, not the final classifier.

### Gemini classification model
Reads selected document content plus the Top 3 official candidates, chooses one candidate or `NO_MATCH`, and provides concise reasoning.

## 7. Security/robustness controls

- Document content is explicitly treated as untrusted content in the classifier prompt.
- The LLM cannot return an arbitrary series; code validates the returned pair against the retrieved candidates.
- After selection, the final displayed metadata is looked up from Milvus instead of trusting model-generated retention/disposition text.
- Internal text/vector/Milvus diagnostic routes are disabled by default in the public UI.
