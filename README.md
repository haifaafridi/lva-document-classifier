# LVA Document Classifier - Weeks 1-10 Complete Prototype

SPS Summer Internship 2026 prototype for matching county documents to Library of Virginia (LVA) locality record series.

This package carries the working Node.js project through the Week 10 targets: long-document chunking, semantic retrieval, embedding-model evaluation, OCR/multi-format extraction, a final classification flow, structured LLM output, canonical metadata mapping, testing utilities, and synthetic demo documents.

## What is implemented

### Knowledge base (one-time / refresh only)

1. `npm run lva:sync` discovers the current **General Schedules for Localities** from the live LVA schedule page and normalizes their record series into `data/lva_schedules.json`.
2. `text_to_embed` is built from each record-series title + description.
3. `Xenova/bge-small-en-v1.5` converts each `text_to_embed` value to a normalized **384-dimensional** vector.
4. The vector and LVA metadata are stored in Milvus/Zilliz. The source JSON contains no manual `id`; Milvus supplies an `INT64` AutoID primary key.
5. The existing working cloud collection from the earlier phase is expected to be `GS_Schedules_All_Localities`.

### Runtime document flow

`Upload -> Azure Blob -> Extract/OCR -> Token-aware chunks + overlap -> Temporary query embeddings -> Milvus Top-K per chunk -> Aggregate Top 3 record-series candidates -> Gemini classifier -> Validate candidate choice -> Query Milvus for canonical metadata -> Display final result`

Important: **uploaded-document embeddings are never inserted into Milvus.** Only the LVA knowledge-base vectors are persisted.

## Week 8 implementation: chunking + robust retrieval

- Uses the **actual embedding-model tokenizer**, not word-count approximations.
- Default chunk size: **380 tokens**.
- Default overlap: **64 tokens**.
- BGE has a 512-position limit; 380 leaves room for the retrieval query instruction and special tokens.
- Removes duplicate chunks and preserves document coverage if a very long file produces more than the configured maximum.
- Creates a temporary embedding for each selected chunk.
- Searches Milvus for each chunk, then aggregates repeated record-series hits across chunks before choosing the final Top 3.
- This avoids the old behavior of truncating a long document to its beginning.

Inspect the strategy on a document:

```powershell
npm run chunk:inspect -- ".\test-documents\06_long_recruitment_hiring_packet.pdf"
```

## Week 9 implementation: model comparison

### Embedding models included in the benchmark

- `Xenova/bge-small-en-v1.5` - production model, 384D, 512 max positions.
- `Xenova/e5-small-v2` - 384D alternative with `query:` / `passage:` prefixes.
- `Xenova/gte-small` - 384D alternative.

The production Milvus collection remains BGE because the stored vector space must match the query model. The benchmark embeds the local LVA dataset independently for each model and compares **Top-1 accuracy, Top-3 recall, MRR, and latency**.

```powershell
npm run lva:sync
npm run benchmark:embeddings
```

> The embedding benchmark downloads additional local models and can use extra disk space. It is optional for the live demo.

### Classification models explored/benchmarked

The default is **Gemini 3.5 Flash-Lite** because it is a current stable high-throughput model with a free developer tier and structured outputs. The benchmark can compare:

- `gemini-3.5-flash-lite`
- `gemini-3.1-flash-lite`
- `gemini-3.5-flash`

```powershell
npm run benchmark:classifiers
```

## Week 9/10 classification flow

The classifier receives only:

- selected document chunks;
- the Top 3 Milvus candidates and their official metadata;
- explicit classification instructions.

It must return structured JSON containing:

- `decision`: `MATCH` or `NO_MATCH`;
- `schedule_number`;
- `series_number`;
- short reasoning.

The application then validates that a `MATCH` is **one of the retrieved candidate pairs**. It cannot invent an LVA number. After validation, the selected Schedule Number + Series Number is queried back from Milvus and mapped to canonical metadata for display:

- Schedule Title
- Schedule Number
- Series Title
- Series Number
- Retention Period
- Disposition Method
- Classification Reasoning

See `docs/CLASSIFICATION_FLOW_AND_PROMPT.md`.

## Week 10 format/OCR flow

Supported input formats (maximum 2 MB):

- born-digital and scanned PDF;
- `.docx` and legacy `.doc`;
- `.xlsx` / `.xls`;
- PNG / JPEG / BMP / WEBP / GIF images.

Extraction strategy:

- PDF: PDF.js text layer first; only pages with too little digital text fall back to OCR.
- Scanned PDF: PDF.js renders the page to an image, then Tesseract.js OCR reads it.
- Images: preprocessing with Sharp + Tesseract.js OCR.
- DOCX: Mammoth.
- DOC: `word-extractor`.
- Excel: SheetJS.

This remains a Node.js pipeline; no Python microservice or Docker service is required.

## Fresh setup on Windows / PowerShell

### 1. Extract the ZIP

For example:

```text
C:\Users\Haifa Afridi\Desktop\lva-document-classifier-week10
```

Open PowerShell in that folder.

### 2. Install dependencies

Use Node.js 20 or newer:

```powershell
npm install
npm audit
npm test
```

The first embedding/OCR run may download/cache local model or OCR assets.

### 3. Create `.env`

```powershell
Copy-Item .env.example .env
```

Copy your working values from the old project's `.env` for:

```env
AZURE_STORAGE_CONNECTION_STRING=...
AZURE_STORAGE_CONTAINER=lva-documents
MILVUS_ADDRESS=...
MILVUS_TOKEN=...
MILVUS_COLLECTION=GS_Schedules_All_Localities
```

Do **not** paste credentials into source code and do not commit `.env`.

### 4. Add a Gemini API key for Week 10 classification

Create/use a Google AI Studio Gemini Developer API key and set:

```env
GEMINI_API_KEY=...
CLASSIFIER_MODEL=gemini-3.5-flash-lite
```

Without a Gemini key, the application still runs retrieval and shows the Top 3 candidates, but it cannot produce the final Week 10 classification.

**Privacy note:** use only synthetic/non-confidential records with the free developer tier. Google's current pricing page states that free-tier content may be used to improve products. For real confidential county documents, use an organization-approved paid/enterprise deployment and data-handling policy.

### 5. Check existing services

If you are reusing the already-seeded cloud collection:

```powershell
npm run milvus:health
npm run milvus:status
npm run classifier:health
```

Do **not** reseed a working non-empty collection.

### 6. Refresh local LVA JSON for benchmarks/documentation

This does not write to Milvus:

```powershell
npm run lva:sync
npm run data:validate
```

The LVA site is live and schedules are updated over time, so the row count can change. In the user's previous successful sync, 28 locality schedules produced 929 record-series rows.

### 7. If you are starting with an empty/new Milvus collection only

Use the one-time combined command:

```powershell
npm run lva:sync-and-seed
```

Never use this for normal runtime requests.

### 8. Start

```powershell
npm start
```

Open:

```text
http://localhost:3000
```

The public frontend deliberately does **not** display extracted text, vectors, chunk internals, or Milvus status.

## Recommended demo sequence

1. `npm run milvus:status` - show that the all-locality collection is loaded (internal demo only).
2. `npm run chunk:inspect -- ".\test-documents\06_long_recruitment_hiring_packet.pdf"` - show chunking + overlap.
3. Start the UI with `npm start`.
4. Classify a born-digital PDF.
5. Classify the long PDF.
6. Classify an OCR image or scanned PDF.
7. Show final metadata + reasoning in the frontend.
8. If asked about accuracy, show `ground_truth.json` and run the evaluation scripts.

See `docs/DEMO_GUIDE.md` for the exact script and questions to expect.

## Testing commands

```powershell
npm test
npm run evaluate:retrieval
npm run evaluate:end-to-end
npm run benchmark:embeddings
npm run benchmark:classifiers
```

Evaluation reports are saved under `benchmarks/`.

## Important technical distinction

- **Embedding model:** BGE converts text to mathematical vectors for similarity search. It does not make the final records decision.
- **Milvus:** retrieves the most semantically relevant stored LVA candidates. It is not the final classifier.
- **Classification model:** Gemini evaluates the document against the retrieved candidate descriptions and selects one valid candidate or `NO_MATCH`.

## Research references

- Library of Virginia retention schedules: https://www.lva.virginia.gov/services/rm/schedules
- LVA records-management manual: https://www.lva.virginia.gov/services/rm/resources/vprmm
- BGE Small Transformers.js model: https://huggingface.co/Xenova/bge-small-en-v1.5
- Gemini models: https://ai.google.dev/gemini-api/docs/models
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini structured outputs: https://ai.google.dev/gemini-api/docs/structured-output
- Tesseract.js: https://github.com/naptha/tesseract.js
- Milvus vector search: https://milvus.io/docs/single-vector-search.md

## Scope / safety

This is an internship prototype. Automated output should be reviewed against current LVA policy before making real retention/destruction decisions. LVA itself recommends using the current live schedule versions because schedules are updated regularly.
