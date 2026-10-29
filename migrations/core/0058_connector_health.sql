-- A successful full reconciliation advances only after the final page acknowledgment.
ALTER TABLE bw_stock_sync ADD COLUMN completed_at TEXT;
ALTER TABLE bw_delta_cutovers ADD COLUMN last_read_at TEXT;
ALTER TABLE bw_delta_cutovers ADD COLUMN last_io_error TEXT;
