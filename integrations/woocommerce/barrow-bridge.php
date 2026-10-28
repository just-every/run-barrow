<?php
/**
 * Plugin Name: Barrow durable wholesale bridge
 * Description: Owner-installed REST handoffs to native WooCommerce orders and stock.
 * Version: 1.0.0
 */
defined('ABSPATH') || exit;

register_activation_hook(__FILE__, function () {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    dbDelta("CREATE TABLE {$wpdb->prefix}barrow_handoffs (
        identity_key varchar(100) NOT NULL,
        fingerprint varchar(64) NOT NULL,
        order_id bigint unsigned NOT NULL DEFAULT 0,
        result_json longtext NOT NULL,
        PRIMARY KEY  (identity_key)
    ) {$wpdb->get_charset_collate()};");
    add_option('barrow_destination', wp_generate_uuid4(), '', false);
});

// Use a revocable WooCommerce REST key belonging to a current shop manager.
function barrow_authorize(WP_REST_Request $request) {
    global $wpdb;
    $header = $request->get_header('authorization');
    if (!preg_match('/^Basic (.+)$/', $header, $match)) return false;
    $parts = explode(':', base64_decode($match[1], true) ?: '', 2);
    if (count($parts) !== 2) return false;
    $key = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}woocommerce_api_keys WHERE consumer_key=%s", wc_api_hash($parts[0])));
    if (!$key || !hash_equals($key->consumer_secret, $parts[1]) || $key->permissions !== 'read_write') return false;
    $user = get_user_by('id', $key->user_id);
    if (!$user || !user_can($user, 'manage_woocommerce')) return false;
    wp_set_current_user($user->ID);
    return true;
}
function barrow_error($message, $status = 409) { return new WP_Error('barrow_refused', $message, array('status' => $status)); }
function barrow_product($product) {
    return array('id' => (string)$product->get_id(), 'parentId' => (string)$product->get_parent_id(),
        'sku' => $product->get_sku(), 'name' => $product->get_name(), 'unit' => 'each',
        'available' => $product->managing_stock() && !$product->backorders_allowed() && $product->is_in_stock() ? max(0, (int)$product->get_stock_quantity()) : null,
        'warehouse' => null, 'incoming' => null);
}
function barrow_catalog(WP_REST_Request $request) {
    $customer = get_user_by('id', (int)$request['customerId']);
    if (!$customer || !in_array('customer', $customer->roles, true)) return barrow_error('Map an existing WooCommerce customer.');
    $skus = explode(',', (string)$request['skus']);
    if (count($skus) > 100) return barrow_error('At most 100 agreed SKUs per request.', 400);
    $products = array();
    foreach ($skus as $sku) {
        $product = wc_get_product(wc_get_product_id_by_sku($sku));
        if ($product && $product->get_status() === 'publish' && $product->is_purchasable()) $products[] = barrow_product($product);
    }
    return array('destination' => get_option('barrow_destination'), 'currency' => get_woocommerce_currency(),
        'customerId' => (string)$customer->ID, 'observedAt' => gmdate('c'), 'products' => $products);
}
function barrow_order($order) {
    $lines = array();
    $fulfillments = $order->get_meta('_barrow_fulfillments') ?: array();
    foreach ($order->get_items() as $id => $item) {
        $shipped = 0;
        foreach ($fulfillments as $entry) foreach ($entry['lines'] as $sent) if ((int)$sent['lineId'] === $id) $shipped += $sent['quantity'];
        $allocated = (int)$item->get_meta('_barrow_allocated');
        $lines[] = array('id' => (string)$id, 'itemId' => (string)($item->get_variation_id() ?: $item->get_product_id()),
            'quantity' => (string)$item->get_quantity(), 'reserved' => (string)max(0, $allocated - $shipped),
            'dispatched' => (string)$shipped, 'cancelled' => '0', 'backorder' => (string)($item->get_quantity() - $allocated));
    }
    $refunds = array();
    foreach ($order->get_refunds() as $refund) {
        $items = array();
        foreach ($refund->get_items() as $item) $items[] = array('lineId' => (string)$item->get_meta('_refunded_item_id'), 'quantity' => abs((int)$item->get_quantity()));
        $refunds[] = array('id' => (string)$refund->get_id(), 'amount' => $refund->get_amount(), 'lines' => $items);
    }
    return array('destination' => get_option('barrow_destination'), 'id' => (string)$order->get_id(),
        'reference' => (string)$order->get_order_number(), 'identity' => $order->get_meta('_barrow_identity'),
        'customerId' => (string)$order->get_customer_id(), 'currency' => $order->get_currency(),
        'total' => $order->get_total(), 'state' => $order->get_status(), 'lines' => $lines,
        'fulfillments' => $fulfillments, 'refunds' => $refunds);
}
function barrow_handoff(WP_REST_Request $request) {
    global $wpdb;
    $body = $request->get_json_params();
    if (($body['destination'] ?? '') !== get_option('barrow_destination')) return barrow_error('Destination differs.');
    $identity = $body['identity'] ?? '';
    if (!is_string($identity) || !preg_match('/^[a-zA-Z0-9:_-]{1,100}$/', $identity)) return barrow_error('Invalid durable identity.', 400);
    $customer = get_user_by('id', (int)($body['customerId'] ?? 0));
    if (!$customer || !in_array('customer', $customer->roles, true)) return barrow_error('Unknown customer.');
    if (($body['currency'] ?? '') !== get_woocommerce_currency() || wc_get_price_decimals() !== 2) return barrow_error('Store currency or precision differs.');
    if (!is_array($body['lines'] ?? null) || !count($body['lines']) || count($body['lines']) > 100) return barrow_error('Invalid lines.', 400);
    $fingerprint = hash('sha256', wp_json_encode($body));
    $table = $wpdb->prefix . 'barrow_handoffs';
    $wpdb->query('START TRANSACTION');
    try {
        // Unique durable identity and row lock serialize retries, including lost responses.
        $insert = $wpdb->query($wpdb->prepare("INSERT IGNORE INTO $table(identity_key,fingerprint,order_id,result_json) VALUES(%s,%s,0,'')", $identity, $fingerprint));
        if ($insert === false) throw new Exception('Handoff storage unavailable.');
        $prior = $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE identity_key=%s FOR UPDATE", $identity));
        if (!$prior || !hash_equals($prior->fingerprint, $fingerprint)) throw new Exception('Identity already names another request.');
        if ($prior->order_id) {
            $wpdb->query('COMMIT');
            return json_decode($prior->result_json, true);
        }
        $products = array(); $seen = array();
        foreach ($body['lines'] as $line) {
            if (!is_int($line['quantity'] ?? null) || $line['quantity'] < 1 || !is_int($line['totalCents'] ?? null) || $line['totalCents'] < 0 || isset($seen[$line['itemId'] ?? ''])) throw new Exception('Invalid exact line.');
            $product = wc_get_product((int)$line['itemId']);
            if (!$product || (string)$product->get_id() !== $line['itemId'] || $product->get_sku() !== ($line['sku'] ?? '') || $product->get_status() !== 'publish' || !$product->is_purchasable() || !$product->managing_stock() || $product->backorders_allowed()) throw new Exception('Product or stock authority changed.');
            $seen[$line['itemId']] = true; $products[] = $product;
        }
        // Lock native Woo stock rows in deterministic order; never maintain another ledger.
        $ids = array_map(function ($p) { return (int)$p->get_stock_managed_by_id(); }, $products); sort($ids);
        $list = implode(',', array_unique($ids));
        $wpdb->get_results("SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key='_stock' AND post_id IN ($list) ORDER BY post_id FOR UPDATE");
        $order = new WC_Order(); $order->set_customer_id($customer->ID); $order->set_created_via('barrow');
        $order->set_currency($body['currency']); $order->set_status('pending');
        $order->update_meta_data('_barrow_identity', $identity);
        $order->update_meta_data('_barrow_approval', $body['approval'] ?? array());
        $order->update_meta_data('_barrow_terms_days', (int)($body['termsDays'] ?? 0));
        foreach ($body['lines'] as $index => $line) {
            $product = wc_get_product($products[$index]->get_id());
            $available = max(0, (int)$wpdb->get_var($wpdb->prepare("SELECT meta_value FROM {$wpdb->postmeta} WHERE post_id=%d AND meta_key='_stock' FOR UPDATE", $product->get_stock_managed_by_id())));
            $allocated = min($line['quantity'], $available);
            $item = new WC_Order_Item_Product(); $item->set_product($product); $item->set_quantity($line['quantity']);
            $amount = sprintf('%d.%02d', intdiv($line['totalCents'], 100), $line['totalCents'] % 100);
            $item->set_subtotal($amount); $item->set_total($amount); $item->add_meta_data('_barrow_allocated', $allocated); $item->add_meta_data('_reduced_stock', $allocated);
            $order->add_item($item);
            if ($allocated) wc_update_product_stock($product, $allocated, 'decrease');
        }
        $order->calculate_totals(false); $order->save();
        $order->get_data_store()->set_stock_reduced($order->get_id(), true);
        $result = barrow_order($order);
        if ($wpdb->update($table, array('order_id' => $order->get_id(), 'result_json' => wp_json_encode($result)), array('identity_key' => $identity)) !== 1) throw new Exception('Acknowledgment storage failed.');
        $wpdb->query('COMMIT'); return $result;
    } catch (Throwable $error) { $wpdb->query('ROLLBACK'); return barrow_error('Handoff refused; reconcile the same identity.'); }
}
function barrow_read_order(WP_REST_Request $request) {
    $order = wc_get_order((int)$request['id']);
    if (!$order || !$order->get_meta('_barrow_identity')) return barrow_error('Linked order not found.', 404);
    return barrow_order($order);
}
function barrow_fulfill(WP_REST_Request $request) {
    $order = wc_get_order((int)$request['id']);
    if (!$order || !$order->get_meta('_barrow_identity')) return barrow_error('Linked order not found.', 404);
    $entry = $request->get_json_params();
    if (!is_string($entry['reference'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{1,80}$/', $entry['reference']) || !is_array($entry['lines'] ?? null) || !count($entry['lines'])) return barrow_error('Name the source fulfillment reference and exact lines.', 400);
    $entry = array('reference' => $entry['reference'], 'lines' => $entry['lines'], 'warehouse' => null);
    $prior = $order->get_meta('_barrow_fulfillments') ?: array();
    foreach ($prior as $row) if ($row['reference'] === $entry['reference']) return $row === $entry ? barrow_order($order) : barrow_error('Fulfillment reference differs.');
    $seen = array();
    foreach ($entry['lines'] as $line) {
        $item = $order->get_item((int)($line['lineId'] ?? 0)); $used = 0;
        foreach ($prior as $row) foreach ($row['lines'] as $sent) if ($sent['lineId'] === ($line['lineId'] ?? null)) $used += $sent['quantity'];
        if (!$item || isset($seen[$line['lineId']]) || !is_int($line['quantity'] ?? null) || $line['quantity'] < 1 || $used + $line['quantity'] > (int)$item->get_meta('_barrow_allocated')) return barrow_error('Fulfillment exceeds source allocation.');
        $seen[$line['lineId']] = true;
    }
    // Woo core has no warehouse or carrier proof. This explicit source receipt says only shipped units.
    $entry = array('reference' => $entry['reference'], 'lines' => $entry['lines'], 'warehouse' => null);
    $prior[] = $entry; $order->update_meta_data('_barrow_fulfillments', $prior); $order->save();
    return barrow_order($order);
}
add_action('rest_api_init', function () {
    register_rest_route('barrow/v1', '/identity', array('methods' => 'GET', 'callback' => function () { return array('destination' => get_option('barrow_destination')); }, 'permission_callback' => 'barrow_authorize'));
    foreach (array('/catalog' => array('GET', 'barrow_catalog'), '/handoffs' => array('POST', 'barrow_handoff'),
        '/orders/(?P<id>\d+)' => array('GET', 'barrow_read_order'), '/orders/(?P<id>\d+)/fulfillments' => array('POST', 'barrow_fulfill')) as $path => $handler) {
        register_rest_route('barrow/v1', $path, array('methods' => $handler[0], 'callback' => $handler[1], 'permission_callback' => 'barrow_authorize'));
    }
});
