# Supervisor Q&A Cheat Sheet

**What is a vector?**  A fixed-length numeric representation of text. BGE Small outputs 384 floating-point values per input.

**Did you choose 384?**  No. It is the model's hidden/output dimension, so the Milvus vector field must match it.

**Why chunking?**  The embedding model has a finite input limit. Chunking keeps all parts of a long document searchable instead of silently losing text after truncation.

**Why overlap?**  It preserves context around boundaries. A sentence or record-purpose clue can straddle two chunks.

**Why 380 + 64?**  380 is safely below the 512 model limit after accounting for the BGE query instruction/special tokens; 64 gives meaningful boundary overlap without excessive duplicate work. Both are configurable.

**Do you store document embeddings?**  No. Only LVA knowledge-base embeddings are stored. Document/chunk embeddings are temporary query vectors.

**What does Milvus do?**  Vector similarity retrieval. It returns the most semantically similar LVA record-series candidates.

**Is Milvus the classifier?**  No. Retrieval and classification are separate stages.

**What is the classifier?**  Gemini 3.5 Flash-Lite by default. It sees the document context plus the Top 3 candidates and must choose one or NO_MATCH.

**Can the LLM hallucinate an LVA number?**  The prompt forbids it, structured output constrains the shape, and application code validates the returned schedule/series pair against the actual Top 3. Invalid pairs are rejected.

**Where does the final retention/disposition come from?**  After the series is selected, the app queries Milvus for the canonical stored record-series metadata and displays that. It does not let the LLM invent retention values.

**How are long documents searched?**  Each chunk is embedded and searched independently. Duplicate candidate evidence across chunks is aggregated to produce one document-level Top 3.

**How do you compare embedding models?**  Re-embed the same local LVA rows separately for BGE/E5/GTE, search the same ground-truth documents, then compare Top-1, Top-3, MRR, and latency. You cannot compare an E5 query directly against BGE vectors because they are different vector spaces.

**How do you compare classifiers?**  Keep retrieval candidates fixed, send the same cases to each classifier model, and compare expected final pair + latency.

**How does OCR work?**  Tesseract.js handles images. For PDFs, PDF.js first attempts digital text; scanned/low-text pages are rendered to images and sent to Tesseract.js.

**Why not OCR every PDF page?**  Born-digital text extraction is faster and usually cleaner. OCR is a fallback only when needed.

**What about prompt injection inside a document?**  Document content is treated as untrusted data. The classifier prompt says to ignore instructions found inside it, and test case 11 deliberately checks this behavior.

**Are the similarity scores percentages?**  No. They are similarity values used for ranking, not calibrated confidence probabilities.

**What if the correct series is not in Top 3?**  The classifier is intentionally prevented from inventing another series. It should return NO_MATCH. Improving retrieval then becomes the priority.
