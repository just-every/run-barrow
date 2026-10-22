-- ORD-014: supplier product images, content-addressed and metadata-stripped, kept while any variant or order line names them.
CREATE TABLE bw_product_images (
 sha256 TEXT PRIMARY KEY,
 width INTEGER NOT NULL,
 height INTEGER NOT NULL,
 components INTEGER NOT NULL CHECK(components IN (1,3)),
 size INTEGER NOT NULL,
 content_base64 TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL
);
