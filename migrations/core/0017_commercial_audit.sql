-- Legacy events retain NULL context: historical facts must not be backfilled.
ALTER TABLE bw_audit ADD COLUMN context_json TEXT CHECK(context_json IS NULL OR json_valid(context_json));
