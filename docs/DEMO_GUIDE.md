# Thursday Demo Guide

## Before the meeting

Run once:

```powershell
npm install
npm audit
npm test
npm run milvus:health
npm run milvus:status
npm run classifier:health
```

Warm the embedding and OCR caches by testing one normal PDF and one OCR image before the call.

## 5-minute presentation flow

### 1. Explain what changed since Week 7

"Week 7 stored the LVA knowledge-base embeddings and searched them. I have now added token-aware chunking with overlap for long documents, multi-chunk retrieval aggregation, model-evaluation scripts, OCR and all required formats, and a final structured classification stage."

### 2. Show chunking

```powershell
npm run chunk:inspect -- ".\test-documents\06_long_recruitment_hiring_packet.pdf"
```

Explain: "BGE has a 512-position limit, so I use 380-token chunks with 64-token overlap. The document embedding is temporary and is never stored."

### 3. Start the public app

```powershell
npm start
```

The public UI intentionally hides extracted text, vectors, and Milvus internals.

### 4. Classify a straightforward document

Suggested: `01_supplier_invoice_payment_packet.pdf`.

Expected final series: GS-02 / 010143 Accounts Payable.

### 5. Show long-document logic

Suggested: `06_long_recruitment_hiring_packet.pdf`.

Expected: GS-03 / 010249 Recruitment, Hiring, Interview, and Selection Records.

### 6. Show OCR

Suggested: `04_traffic_crash_report_ocr.png` or `05_citizen_complaint_scanned.pdf`.

### 7. Explain retrieval vs classification

"Milvus first narrows the full LVA knowledge base to the Top 3 semantically relevant candidates. Gemini then chooses only from those candidates or returns NO_MATCH. The code validates its choice and retrieves the final canonical metadata from Milvus."

## If asked how accuracy is known

Use the synthetic ground-truth dataset. `evaluate:retrieval` measures Top-1/Top-3 retrieval and `evaluate:end-to-end` checks the final classifier result. This is much stronger than judging whether one score 'looks high'.

## If asked why BGE

- local/free;
- Node.js Transformers.js;
- 384D existing vector collection;
- designed for retrieval;
- benchmark script can compare BGE, E5, GTE objectively.

## If asked why Gemini 3.5 Flash-Lite

- stable current model;
- structured outputs;
- low-latency/high-throughput orientation;
- developer free tier for synthetic demo;
- Node SDK integration.

## If asked about the ID field

"The source JSON does not provide an ID. Milvus still requires a primary field, so the schema uses an INT64 AutoID primary key. Milvus generates the large numeric ID itself when knowledge-base rows are inserted."

## If asked whether user document vectors are stored

"No. The LVA knowledge-base vectors are permanent. Each user document/chunk vector exists only in request memory as a Milvus query vector and is discarded afterward."

## If asked about 28 schedules / 929 records

"The LVA sync is automated. It discovers the current locality General Schedules and parses the live locality schedule data. In our previous successful sync, that was 28 schedules and 929 record series. The exact number is allowed to change when LVA updates its live schedules."
