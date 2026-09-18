# LVA Document Classifier

> An end-to-end document classification system for mapping local-government records to the most relevant **Library of Virginia (LVA) locality record series**.

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Build LVA Docker Image](https://github.com/haifaafridi/lva-document-classifier/actions/workflows/build-image.yml/badge.svg)](https://github.com/haifaafridi/lva-document-classifier/actions/workflows/build-image.yml)
![Azure](https://img.shields.io/badge/Deployed-Azure%20Container%20Apps-0078D4?logo=microsoftazure&logoColor=white)
![Version](https://img.shields.io/badge/version-2.2.0-blue)

## Live Demo

**Production deployment:**  
https://lva-document-classifier.politemushroom-97d8e0b8.polandcentral.azurecontainerapps.io/

> The public demo is intended for synthetic/non-confidential documents.

## Project Highlights

- **929 LVA record-series entries** across **28 locality schedules**
- **384-dimensional BGE embeddings** using `Xenova/bge-small-en-v1.5`
- **Hybrid retrieval:** dense Milvus/Zilliz vector search + BM25-style lexical search + fusion
- **Gemini 3.5 Flash-Lite** for final grounded classification and reasoning
- Supports **PDF, scanned PDF, DOC/DOCX, XLS/XLSX, PNG, JPEG, BMP, WEBP and GIF**
- **Tesseract.js OCR** with Sharp preprocessing for scanned/image documents
- Token-aware long-document chunking with overlap instead of truncating the document
- Original uploads stored in **Azure Blob Storage**
- Permanent reference vectors stored in **Zilliz/Milvus**
- Uploaded-user embeddings are **temporary query vectors and are never inserted into Milvus**
- Deployed with **Docker + GitHub Actions + Azure Container Registry + Azure Container Apps**
- Stage-level latency instrumentation for storage, extraction/OCR, retrieval, Gemini and metadata lookup
- Retry protection for transient Milvus/Zilliz gRPC read failures

## What the System Does

A user uploads a document. The system extracts its text, handles OCR when required, creates temporary document embeddings, retrieves the most relevant LVA record-series candidates, and asks Gemini to make a final grounded `MATCH` / `NO_MATCH` decision.

The UI returns supervisor-friendly metadata such as:

- Record Series
- Series Number
- Schedule Number and Title
- Retention Period
- Disposition Method
- Official Series Description
- Classification Reasoning
- Extraction / OCR information
- Processing-time breakdown

## Architecture

```text
User Upload
    |
    v
Azure Blob Storage
    |
    v
Text Extraction / OCR
    |
    v
Token-aware Chunking
    |
    v
Temporary BGE Query Embeddings
    |
    +-----------------------+
    |                       |
    v                       v
Milvus Dense Search    BM25-style Lexical Search
    |                       |
    +-----------+-----------+
                |
                v
          Hybrid Fusion
                |
                v
        Top 3 LVA Candidates
                |
                v
       Gemini 3.5 Flash-Lite
                |
                v
 Candidate Validation + Canonical
      Metadata Lookup in Milvus
                |
                v
             UI Result
```

## Knowledge Base

The current reference knowledge base contains:

- **28** locality General Schedules
- **929** LVA record-series rows
- **384-dimensional** normalized vectors
- Milvus `Int64` **AutoID** primary key

For each reference series, useful official fields such as the series title and description are combined into `text_to_embed` and embedded with:

```text
Xenova/bge-small-en-v1.5
dtype: q8
pooling: mean
dimension: 384
normalized: true
```

Only the official LVA reference embeddings are permanently stored.

## Long-Document Handling

Large documents are not reduced to only their first page or first few paragraphs.

The system uses token-aware overlapping chunks:

```text
Chunk size: 380 tokens
Overlap:    64 tokens
```

Each selected chunk receives a temporary embedding, relevant candidates are retrieved, and evidence is aggregated across chunks. This helps preserve useful information that may appear later in a document.

## Hybrid Retrieval

The production retriever combines two complementary signals:

### Dense semantic retrieval
BGE embeddings + Milvus/Zilliz identify semantically similar record-series descriptions even when wording differs.

### Lexical retrieval
A local BM25-style search preserves strong exact terminology such as record-specific names and administrative terms.

The two result sets are fused before returning the final **Top 3 candidates** to Gemini.

## Final Classification

Gemini is the final decision layer, but it is deliberately constrained.

It receives:

- selected document evidence;
- the Top 3 retrieved LVA candidates;
- official metadata for those candidates;
- strict structured-output instructions.

Gemini returns:

```json
{
  "decision": "MATCH | NO_MATCH",
  "schedule_number": "...",
  "series_number": "...",
  "reasoning": "..."
}
```

For a `MATCH`, the backend validates that the selected schedule/series pair exists in the retrieved candidate set. Canonical metadata is then queried from Milvus before the result is displayed.

## Supported Formats

| Format | Extraction strategy |
|---|---|
| Born-digital PDF | PDF.js text extraction |
| Scanned PDF | Page rendering + Tesseract.js OCR |
| DOCX | Mammoth |
| DOC | `word-extractor` |
| XLS / XLSX | SheetJS |
| Images | Sharp preprocessing + Tesseract.js OCR |

Maximum upload size is currently **2 MB**.

## Technology Stack

| Area | Technology |
|---|---|
| Backend | Node.js / Express |
| Cloud file storage | Azure Blob Storage |
| Embeddings | `Xenova/bge-small-en-v1.5` |
| Vector database | Zilliz Cloud / Milvus |
| Lexical retrieval | Local BM25-style search |
| Final classifier | Gemini 3.5 Flash-Lite |
| OCR | Tesseract.js |
| Image preprocessing | Sharp |
| PDF extraction | PDF.js |
| DOCX extraction | Mammoth |
| Spreadsheet extraction | SheetJS |
| Containerization | Docker |
| Image registry | Azure Container Registry |
| Hosting | Azure Container Apps |
| CI / image build | GitHub Actions |

## Evaluation Results

Current controlled project baselines:

| Evaluation | Result |
|---|---:|
| Unit tests | **19 / 19 passed** |
| Retrieval Top-1 | **80%** |
| Retrieval Top-3 | **100%** |
| End-to-end classification | **11 / 11 correct** |
| Format / OCR suite | **100%** |

A separate fresh 10-document test pack was also tested manually through both the local backend and deployed frontend:

- Local backend: **10 / 10 passed**
- Deployed frontend: **10 / 10 passed**

These are controlled project results and should not be interpreted as universal accuracy guarantees.

## Reliability and Observability

The backend records stage-level processing time for:

```text
storage
extraction / OCR
retrieval
Gemini classification
metadata lookup
total
```

Retrieval timing is also broken down into chunking, embedding, dense search, lexical search and fusion.

Read-only Milvus operations include bounded retry handling for transient gRPC conditions such as `DEADLINE_EXCEEDED` and `UNAVAILABLE`.

## Local Setup

### Requirements

- Node.js 20+
- npm
- Azure Blob Storage credentials
- Zilliz/Milvus endpoint and token
- Gemini API key

### Install

```powershell
git clone https://github.com/haifaafridi/lva-document-classifier.git
cd lva-document-classifier
npm install
```

Create the local environment file:

```powershell
Copy-Item .env.example .env
```

Fill `.env` locally. **Never commit `.env` or credentials.**

Then run:

```powershell
npm test
npm start
```

Open:

```text
http://localhost:3000
```

## Important Environment Variables

The repository provides `.env.example`. Important runtime settings include:

```text
AZURE_STORAGE_CONNECTION_STRING
AZURE_STORAGE_CONTAINER

MILVUS_ADDRESS
MILVUS_TOKEN
MILVUS_COLLECTION
MILVUS_VECTOR_DIM

GEMINI_API_KEY
CLASSIFIER_MODEL

EMBEDDING_MODEL
EMBEDDING_DTYPE
```

Actual credentials are intentionally excluded from the repository.

## Useful Commands

```powershell
npm test
npm run milvus:status
npm run evaluate:retrieval
npm run evaluate:end-to-end
npm run evaluate:formats
npm run chunk:inspect -- ".\test-documents\06_long_recruitment_hiring_packet.pdf"
```

Do not reseed an existing working production collection unless a deliberate data refresh has been reviewed.

## Deployment

```text
Push to main
    |
    v
GitHub Actions
    |
    v
Docker image build
    |
    v
Azure Container Registry
    |
    v
Azure Container Apps
```

Production images are tagged with both `latest` and the Git commit SHA so a deployed revision can be tied to an exact source version.

## Security and Privacy

- `.env` is not committed.
- API keys and cloud credentials are supplied through local environment variables / Azure secrets.
- User-document embeddings are not persisted in Milvus.
- Public demo usage should use synthetic or non-confidential documents.
- Classification output should be reviewed before being used for real records-retention or destruction decisions.

## Repository Structure

```text
.
├── public/                # Frontend
├── src/                   # Backend services and application logic
├── scripts/               # Evaluation, data and deployment utilities
├── tests/                 # Automated tests
├── test-documents/        # Synthetic evaluation documents
├── data/                  # Local LVA reference data
├── docs/                  # Technical documentation
├── benchmarks/            # Evaluation outputs (when generated)
├── .github/workflows/     # GitHub Actions
├── Dockerfile
├── package.json
└── README.md
```

## Project Scope

This project was developed as an **SPS Summer Internship 2026** prototype for automated records classification.

It demonstrates a complete production-style pipeline covering data preparation, embeddings, vector retrieval, OCR, long-document handling, grounded LLM classification, testing, observability and cloud deployment.

## Reference Sources

- Library of Virginia Records Management: https://www.lva.virginia.gov/services/rm/
- LVA Retention Schedules: https://www.lva.virginia.gov/services/rm/schedules
- BGE Small English v1.5: https://huggingface.co/Xenova/bge-small-en-v1.5
- Milvus: https://milvus.io/
- Zilliz Cloud: https://zilliz.com/
- Gemini API: https://ai.google.dev/gemini-api
- Tesseract.js: https://github.com/naptha/tesseract.js

---

**Note:** LVA schedules change over time. Always verify real retention/disposition decisions against the current official Library of Virginia schedule and organizational policy.
