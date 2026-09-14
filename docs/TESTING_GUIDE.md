# Testing Guide

## Included test set

The `test-documents/` directory contains synthetic records with expected answers in `ground_truth.json`. Positive test documents deliberately avoid printing the exact target LVA series number/title in their body so retrieval must work semantically.

Coverage:

- born-digital PDF;
- DOCX;
- XLSX;
- OCR image;
- image-only/scanned PDF OCR;
- long document requiring chunking;
- multiple domains (finance, administration, personnel, schools, law enforcement);
- negative `NO_MATCH` input;
- prompt-injection-like record content.

## Unit / structural tests

```powershell
npm test
```

## Chunking inspection

```powershell
npm run chunk:inspect -- ".\test-documents\06_long_recruitment_hiring_packet.pdf"
```

Check:

- input token count is above one chunk;
- chunk size stays below the model limit;
- overlap is visible in token start/end ranges;
- several chunks cover the document.

## Retrieval evaluation

Requires Milvus/Zilliz and the BGE all-locality knowledge base:

```powershell
npm run evaluate:retrieval
```

Metrics:

- **Top-1 accuracy:** expected series is first.
- **Top-3 recall:** expected series appears anywhere in the three retrieved candidates.

A retrieval score is a similarity score, not a calibrated classification probability.

## End-to-end classification evaluation

Requires Milvus and `GEMINI_API_KEY`:

```powershell
npm run evaluate:end-to-end
```

This checks the final series pair against the expected answer.

## Model comparison

```powershell
npm run benchmark:embeddings
npm run benchmark:classifiers
```

Embedding comparison may download multiple local models and take time. Run it before the meeting, not during the live demo.

## OCR warm-up

Before the meeting, upload or evaluate both:

- `04_traffic_crash_report_ocr.png`
- `05_citizen_complaint_scanned.pdf`

The first OCR call may need to download/cache Tesseract assets, so warming it up reduces demo latency.

## Failure cases to test

- unsupported extension;
- file >2 MB;
- corrupted PDF/Word file;
- blank image;
- document unrelated to county records (`09_no_match_personal_recipe.png`);
- document containing prompt-like text (`11_prompt_injection_invoice.pdf`).
