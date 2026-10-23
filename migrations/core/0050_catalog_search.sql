-- Disposable, per-account discovery observations. Commercial writes still read live Pier.
CREATE TABLE bw_catalog_indexes (
 account_id TEXT PRIMARY KEY REFERENCES bw_accounts(id) ON DELETE CASCADE,
 revision TEXT NOT NULL,
 account_revision TEXT NOT NULL,
 attributes_revision TEXT NOT NULL,
 pier_origin TEXT NOT NULL,
 observed_at TEXT NOT NULL
);
CREATE TABLE bw_catalog_search (
 account_id TEXT NOT NULL REFERENCES bw_accounts(id) ON DELETE CASCADE,
 sku TEXT NOT NULL,
 sku_key TEXT NOT NULL,
 barcode_key TEXT NOT NULL,
 search_text TEXT NOT NULL,
 style TEXT NOT NULL,
 color TEXT NOT NULL,
 size TEXT NOT NULL,
 in_stock INTEGER NOT NULL,
 value_json TEXT NOT NULL,
 PRIMARY KEY (account_id,sku)
);
CREATE INDEX bw_catalog_search_sku ON bw_catalog_search(account_id,sku_key);
CREATE INDEX bw_catalog_search_barcode ON bw_catalog_search(account_id,barcode_key);
CREATE INDEX bw_catalog_search_facets ON bw_catalog_search(account_id,style,color,size,in_stock,sku);
