-- RPT-006: deterministic chronological and ship-window page ordering.
CREATE INDEX bw_orders_prepared ON bw_orders(json_extract(value_json,'$.preparedAt'),id);
CREATE INDEX bw_orders_ship_window ON bw_orders((json_extract(value_json,'$.requestedDate') IS NULL OR json_extract(value_json,'$.requestedDate')=''),json_extract(value_json,'$.requestedDate'),id);
