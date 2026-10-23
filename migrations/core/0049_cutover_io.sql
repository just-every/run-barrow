-- A destination run owns this session until completion or an explicit timeout.
-- Provider writes are preceded by retained immutable delivery bytes.
ALTER TABLE bw_delta_cutovers ADD COLUMN io_token TEXT;
ALTER TABLE bw_delta_cutovers ADD COLUMN io_until INTEGER NOT NULL DEFAULT 0;
