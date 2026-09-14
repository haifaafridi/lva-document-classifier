# Model Research and Selection

Research checked against current public documentation in September 2026.

## Embedding models

### Production: Xenova/bge-small-en-v1.5

Why retained:

- free and runs locally through Transformers.js;
- no Python microservice or per-request embedding API cost;
- 384-dimensional output matches the existing Milvus collection;
- designed for semantic retrieval;
- model config exposes 512 maximum positions;
- supports mean pooling + normalization;
- BGE retrieval convention uses an instruction prefix on query text while stored passages remain unprefixed.

### Comparison: Xenova/e5-small-v2

Good free local retrieval baseline. Uses `query: ` for queries and `passage: ` for stored passages. Also 384D, which makes comparison convenient, but its vector space is different from BGE and cannot query a Milvus collection seeded with BGE vectors.

### Comparison: Xenova/gte-small

Another free Transformers.js-compatible 384D retrieval baseline. Included in the offline benchmark.

### How comparison is fair

`npm run benchmark:embeddings` re-embeds the local LVA dataset independently for each model and runs the same synthetic query documents against each model's own vector space. It reports Top-1 accuracy, Top-3 recall, MRR, and latency.

## Classification models

### Default: Gemini 3.5 Flash-Lite

Why selected for the internship prototype:

- current stable model;
- optimized for high-throughput / low-cost workloads;
- supports structured outputs;
- free developer tier is available;
- easily used from Node.js with `@google/genai`;
- no extra local multi-GB classifier model or Python service.

### Alternatives included for comparison

- Gemini 3.1 Flash-Lite - efficient stable alternative.
- Gemini 3.5 Flash - stronger/heavier reasoning option; useful if accuracy matters more than the lowest latency/cost.

`npm run benchmark:classifiers` holds retrieval candidates constant and compares final accuracy and latency across the configured models.

## Privacy note

The Gemini free developer tier is appropriate only for synthetic internship testing. Google's current pricing documentation states that free-tier content may be used to improve products, while the paid tier says content is not used for that purpose. Do not send real confidential county documents until the organization approves the provider/tier and data-handling controls.

## OCR selection

Tesseract.js was selected because it is free, local, JavaScript-based, and keeps the runtime Node.js-only. Tesseract.js does not directly accept PDFs, so the PDF path uses PDF.js to render only scanned/low-text pages to images and then passes those images to Tesseract.js.

## Key references

- BGE Small: https://huggingface.co/Xenova/bge-small-en-v1.5
- Gemini models: https://ai.google.dev/gemini-api/docs/models
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Tesseract.js FAQ: https://github.com/naptha/tesseract.js/blob/master/docs/faq.md
