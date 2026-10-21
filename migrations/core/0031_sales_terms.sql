-- ORD-015: published sales terms are append-only versions per series. An account is assigned a series and, where it
-- requires acceptance, must accept the series' newest version at submission. The acceptance itself lives on the order
-- (and its confirmation snapshot); a rep-captured signature image is kept beside it by order ID.
CREATE TABLE bw_sales_terms (series TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>=1), title TEXT NOT NULL, body TEXT NOT NULL, content_sha256 TEXT NOT NULL, pdf_name TEXT, pdf_size INTEGER, pdf_sha256 TEXT, pdf_base64 TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(series,version));
CREATE TABLE bw_terms_assignments (account_id TEXT PRIMARY KEY REFERENCES bw_accounts(id), series TEXT NOT NULL, require_acceptance INTEGER NOT NULL CHECK(require_acceptance IN (0,1)), assigned_by TEXT NOT NULL, assigned_at TEXT NOT NULL);
CREATE TABLE bw_terms_signatures (order_id TEXT PRIMARY KEY REFERENCES bw_orders(id), sha256 TEXT NOT NULL, png_base64 TEXT NOT NULL);
