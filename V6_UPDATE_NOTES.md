# Supervisor Feedback Update v6

## UI
- Added an explicit **Record series** panel and **Series number** field.
- Added the official LVA **record-series description** so the result can be visually checked against the document purpose.
- Reworked the status area so it is an inline status line instead of a large grey middle box.
- Added a small processing summary (time, extraction method, OCR yes/no, chunk count).

## Latency diagnosis and optimizations
- Added stage-by-stage timings: Azure storage, extraction/OCR, retrieval, Gemini classification, metadata lookup, and total.
- Retrieval now also reports chunking, embedding, Milvus dense search, lexical search, and fusion timings.
- Reuses the Azure BlobServiceClient/container instead of recreating them every request.
- Stops downloading a just-uploaded Azure blob back to the same server before extraction; extraction uses the already-uploaded request bytes.
- Reuses the Gemini client.
- Runs independent Milvus chunk/evidence searches with bounded concurrency (default 4) instead of serially.
- Added `npm run benchmark:latency -- <file> <repeats>`.
- Added `npm run evaluate:formats`.

## Important
External cloud latency can still vary. The new timings identify which stage caused a slow request instead of guessing from the browser's total network time.

## v6.3 / project 2.2.0 - startup warm-up and latency stability
- Preloads BGE tokenizer + feature-extraction pipeline and runs one tiny inference before the server accepts user requests.
- Establishes the Zilliz/Milvus connection and performs one 1-hit vector search during warm-up.
- Resolves Azure storage/container readiness before the first upload.
- Optionally prepares the reusable Tesseract OCR worker at startup (`STARTUP_WARMUP_OCR=true`).
- Does not call Gemini during warm-up, avoiding classifier quota/cost for a synthetic warm-up request.
- Adds `npm run warmup:check`.
- `benchmark:latency` now pre-warms by default; add `--cold` for a cold-process comparison.
