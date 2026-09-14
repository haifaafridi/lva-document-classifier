# Use Cases and Robust Logic Explored

The Week 8 request to explore different use cases is reflected in both code and the synthetic test set.

## Short, clear born-digital record

Example: supplier invoice packet. One chunk is usually enough; retrieval should quickly surface Accounts Payable.

## Long multi-page document

Example: recruitment packet. Token-aware overlap prevents the end of the document from being discarded by the 512-position embedding limit.

## Repetitive long document

Exact duplicate chunks are removed before embedding so repetitive headers/body blocks do not waste search calls or over-weight one series.

## Evidence spread across sections

Coverage selection retains beginning/end and distributed middle chunks if a document exceeds the maximum chunk count. Multi-chunk aggregation rewards candidates supported by more than one section.

## Born-digital PDF mixed with scanned page

Each PDF page is checked separately. Only low-text pages fall back to OCR, preserving speed on normal pages.

## Standalone image/scanned record

Image preprocessing + Tesseract.js OCR produces text before chunking/retrieval.

## Word / legacy Word / Excel

Each format has its own extraction adapter, then joins the same downstream pipeline. Excel includes sheet names in extracted text so context is not lost.

## Out-of-domain document

The final classifier can return `NO_MATCH` instead of forcing every upload into one of the Top 3.

## Prompt-like text inside a record

The structured prompt explicitly labels document text as untrusted record content and prevents it from overriding system classification instructions.

## Ambiguous retrieval

Milvus returns candidates, not a final truth. The classifier compares candidate descriptions against the document's function/purpose. If none fits, it returns NO_MATCH.
