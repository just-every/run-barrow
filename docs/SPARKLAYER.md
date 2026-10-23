# SparkLayer move-in

SparkLayer documents [activity exports](https://docs.sparklayer.io/help/storefront/interfaces/my-account) as summary or detailed CSV with the selected filters, and [shopping-list exports](https://docs.sparklayer.io/help/ordering/shopping-lists) with SKU, name, price and quantity. They are not a tenant archive or a source of login authority. Use synthetic exports when rehearsing.

The signed-in owner uses the public HTTP doors `POST /api/barrow/imports/sparklayer/preview` and `POST /api/barrow/imports/sparklayer/apply`. `GET /api/barrow/imports/sparklayer` reads the retained source and labeled history. Supplier staff, buyers and agents cannot open these doors. This uses the existing owner-scoped cutover authority. It creates no native commercial order, reservation, payment, invoice, invitation or message.

Supply this JSON envelope. Every CSV is at most 256 KiB and 500 rows; a batch has at most twenty list files and the complete request is at most 2 MB. Save CSV as UTF-8. Monetary cells contain plain decimal amounts with at most two decimal places, without currency symbols. Quantities are positive whole selling units. Duplicate and conflicting source identities refuse rather than merge.

```json
{
  "tenant": "synthetic-barrow-41",
  "activity": {
    "name": "activity.csv",
    "mode": "detailed",
    "csv": "ID,Customer ID,Type,Currency,Total,Product ID,Quantity,Unit Price\norder-1,customer-1,Order,USD,130.00,product-1,2,65.00\n"
  },
  "lists": [{
    "id": "list-1",
    "name": "Store replenishment.csv",
    "customerId": "customer-1",
    "csv": "SKU,Name,Unit Price,Quantity\nsource-oat,Granola,65.00,4\n"
  }],
  "authority": {
    "system": "supplied",
    "customers": {"customer-1": "cedar"},
    "products": {"product-1": "OAT-1", "source-oat": "OAT-1"}
  },
  "scope": {"from": "2026-10-01", "to": "2026-10-22", "filters": ["customer customer-1"], "fullTenant": false}
}
```

Choose `shopify`, `woocommerce` or `supplied` for the authority and explicitly map source customer IDs onto existing Barrow account IDs and source product IDs onto their priced SKUs. The declaration does not contact that backing store or claim an API integration. Missing mappings refuse. Import accounts through the existing reviewed account importer first. Closed accounts refuse source reactivation.

Column names vary by export version. Add an explicit `columns` object to the activity file, mapping these logical fields onto the actual header names: `id`, `customerId`, `type`, `currency`, `total`, `shipping`, `status`, `tracking`, `date`, `productId`, `quantity`, `unitPrice`, `casePack`, `increment`. The example shows the defaults for required detailed fields; optional defaults are Shipping, Status, Tracking, Date, Case Pack and Increment. No universal SparkLayer column spelling is assumed. A list can map `sku` and `quantity` in its own `columns` object. Keep the source type as Order or Quote. Summary mode needs no product or quantity fields and explicitly reports absent detailed coverage.

Review the source against the planned document, line and list counts and per-currency totals, shipping and quantities. The report repeats the exact selected dates and filters and marks any limited scope incomplete. It names absent catalog, customer, balance and release exports. Unknown custom columns are preserved with their source rows, not dropped or executed. Source prices, shipping, tracking and statuses stay historical facts. Source Case Pack and Increment values map to the existing account SKU rules and are fenced with the native account revision; they never replace prices.

To apply, resend the unchanged envelope with the returned `fingerprint` and an explicit owner `reason`. Any source, mapping or native-state change requires another preview. The exact reviewed records and `import.approved` event commit atomically. Replay of that approval is inert; a new preview of the same source creates no second history document or list. A changed existing source ID is refused; supply a distinct reviewed source revision instead of overwriting retained history or later native list edits.

Imported lists belong to the importing person, initially private under ORD-002. They keep only mapped SKUs and desired quantities; source prices remain in the retained original. Open **Saved lists** on the order pad, explicitly share through its normal control if needed, then choose **Add to cart**. ORD-001 checks current account prices, live Pier stock and current pack rules before the person chooses merge or replace.

DATA-001 includes `sourcehistory`, `sourceimports` and visible `lists` in its JSON and per-kind CSV exports. Retained source originals and history are owner-only; buyers export only their visible lists. Archive restoration retains inert history and never replays an import effect. Existing owner-reviewed account erasure retires shared source originals and that account's imported history and source-list links in the same erasure transaction. Downloaded exports and the source system remain separate custody.
