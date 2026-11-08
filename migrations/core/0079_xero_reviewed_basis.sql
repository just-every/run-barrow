-- Preserve the financial source basis reviewed when an existing invoice was linked.
ALTER TABLE bw_xero_links ADD COLUMN commercial_token TEXT NOT NULL DEFAULT '';
