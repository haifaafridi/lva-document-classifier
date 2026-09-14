# LVA knowledge-base data

`lva_schedules.json` is the local normalized source used for validation, one-time seeding, and embedding-model benchmarks.

The ZIP intentionally ships with the smaller historical sample dataset rather than freezing a supposedly permanent copy of the live LVA schedules. Before any new seed or embedding benchmark, refresh it from the official site:

```powershell
npm run lva:sync
npm run data:validate
```

The sync script discovers the current **General Schedules for Localities**, excludes state General Schedules, normalizes all current record-series rows, and writes a provenance manifest to `data/lva_locality_schedule_manifest.json`.

In the user's previous successful live sync, 28 schedules produced 929 record-series rows. That count is not hard-coded because LVA can add/remove/update record series.

Each row contains:

```text
schedule_number
schedule_title
series_number
series_title
series_description
series_retention_period
series_disposition_method
text_to_embed
```

`text_to_embed` is formed as:

```text
<series_title>: <series_description>
```

There is intentionally **no `id` in this JSON**. The Milvus collection has an `INT64` primary field with `AutoID=true`, and Milvus generates the ID when knowledge-base rows are inserted.

Do not run `npm run milvus:seed` against the all-locality collection from this shipped sample file. The seed script includes a guard against creating an all-locality collection from an incomplete local dataset. For a brand-new database, use:

```powershell
npm run lva:sync-and-seed
```

For the already-populated `GS_Schedules_All_Localities` collection, do not seed again; just connect and query it.
