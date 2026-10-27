-- A buyer's accepted plan creates one draft, including concurrent retries.
CREATE UNIQUE INDEX IF NOT EXISTS bw_orders_sellthrough_key
ON bw_orders(json_extract(value_json,'$.sellThrough.key'))
WHERE json_extract(value_json,'$.sellThrough.key') IS NOT NULL;
