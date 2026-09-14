# Classification Flow and Prompt Design

## Flow

1. Extract and clean the document.
2. Chunk it for semantic retrieval.
3. Generate temporary BGE query embeddings.
4. Retrieve and aggregate the Top 3 LVA record-series candidates.
5. Select up to 8 useful document chunks for the classification context.
6. Send document chunks + candidate metadata to Gemini.
7. Require structured JSON (`MATCH`/`NO_MATCH`, schedule number, series number, reasoning).
8. Validate that a `MATCH` is exactly one of the retrieved candidate pairs.
9. Query Milvus using the chosen schedule/series pair.
10. Display canonical metadata + the model's concise justification.

## Prompt principles implemented

- The model is told it is the **final decision stage**, not the retrieval stage.
- Document text is labelled **untrusted record content** so text inside a document cannot become a higher-priority instruction.
- The model is forbidden from inventing schedule/series numbers.
- It must compare the **purpose/function of the record** with each official candidate description rather than choose from one keyword.
- `NO_MATCH` is allowed when the retrieved candidates do not reasonably fit.
- The model returns concise user-facing reasoning, not hidden chain-of-thought.

## Output schema

```json
{
  "decision": "MATCH",
  "schedule_number": "GS-02",
  "series_number": "010143",
  "reasoning": "The document is an invoice/payment packet documenting money owed to a supplier, matching Accounts Payable."
}
```

For `NO_MATCH`, schedule/series numbers are empty strings.

## Why structured output?

Structured output makes parsing deterministic and avoids depending on fragile free-form prose. Application-side validation still checks semantic/business constraints because syntactically valid JSON does not guarantee that the selected value is correct.
