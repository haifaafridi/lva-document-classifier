# Security and Data-Handling Notes

- `.env` is ignored and the ZIP contains no Azure, Zilliz, or Gemini secrets.
- Knowledge-base source JSON has no manual primary key; Milvus AutoID owns the primary key.
- User-document/chunk embeddings are request-memory-only and are not inserted into Milvus.
- The public frontend does not expose extracted document text, vectors, chunk internals, or Milvus status.
- Internal diagnostic routes are disabled by default with `ENABLE_INTERNAL_ROUTES=false`.
- File size is limited to 2 MB and extensions/MIME types are checked.
- The classifier can only select from the retrieved candidates or return `NO_MATCH`; code rejects an invented pair.
- Final metadata is resolved from Milvus after classification instead of trusting generated retention/disposition text.
- Document content is explicitly treated as untrusted content in the classifier prompt.
- The free Gemini developer tier should only be used with synthetic/non-confidential records. Real county documents require an organization-approved data-processing/privacy configuration.
- `.env`, model caches, upload storage, and logs should not be committed.
