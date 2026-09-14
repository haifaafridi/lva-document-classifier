# Final QA / Handoff Notes

## Completed before packaging

- All JavaScript files passed `node --check` syntax validation.
- Source/data scan found no `.env`, cloud connection strings, API keys, Zilliz endpoint, or user credentials in the package.
- The package intentionally excludes `node_modules`, `.hf-cache`, generated logs, and real credentials.
- `data/lva_schedules.json` is a small offline snapshot (GS-02 + GS-19, 105 rows) kept so the project/tests have local seed data without web access. For the full live locality dataset, run `npm run lva:sync`. The user's already-seeded cloud collection `GS_Schedules_All_Localities` previously contained 929 rows across 28 locality schedules and can be reused without reseeding.
- Test assets cover born-digital PDF, long PDF, DOCX, XLSX, image OCR, scanned-PDF OCR, negative/no-match behavior, and a prompt-injection robustness case.

## Cloud/runtime tests that must be run on the user's Windows machine

The build environment used to package this ZIP does not have the user's credentials or outbound npm/cloud access. After extracting:

```powershell
npm install
npm audit
npm test
npm run milvus:health
npm run milvus:status
npm run classifier:health
npm start
```

Then run:

```powershell
npm run evaluate:retrieval
npm run evaluate:end-to-end
```

These are the authoritative end-to-end checks because they exercise the user's Azure, Zilliz/Milvus, locally downloaded embedding/OCR assets, and Gemini API key.

## Important design guarantees

- LVA knowledge-base embeddings are stored in Milvus.
- Uploaded-document/chunk embeddings are temporary query vectors only and are never inserted into Milvus.
- The source schedule JSON has no manual primary-key ID. Milvus uses an `INT64` primary field with `AutoID=true`.
- Final classification is constrained to the retrieved Top-3 candidate pairs or `NO_MATCH`.
- Final displayed metadata is mapped back from canonical Milvus data rather than trusted from model-generated metadata.
- Public routes do not expose extracted text, vectors, chunk internals, storage internals, or Milvus status when `ENABLE_INTERNAL_ROUTES=false`.
