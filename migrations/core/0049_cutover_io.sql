-- A destination run owns this session until completion or an explicit timeout.
-- Provider writes are preceded by retained immutable delivery bytes.
ALTER TABLE bw_delta_cutovers ADD COLUMN io_token TEXT;
ALTER TABLE bw_delta_cutovers ADD COLUMN io_until INTEGER NOT NULL DEFAULT 0;
-- All native mutation doors, including later ones, share the in-flight fence.
CREATE TRIGGER bw_delta_order_update BEFORE UPDATE ON bw_orders
WHEN EXISTS(SELECT 1 FROM bw_delta_cutovers d,json_each(d.scope_json) s
 WHERE s.value=OLD.account_id AND d.io_until>CAST(strftime('%s','now') AS INTEGER)*1000)
BEGIN SELECT RAISE(ABORT,'DELTA_IO_HELD'); END;
