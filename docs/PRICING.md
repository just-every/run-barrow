# Dated books and currency

In Accounts, edit the trade account’s **Price book currency** and enter independent integer minor-unit prices in USD, CAD, EUR or GBP. One order uses one book and one ISO currency. A currency selection never converts old orders or documents. USD remains the default; restored records without a currency remain AUD.

**Scheduled book revisions** accepts an optional JSON array. Each revision has an `effectiveFrom` date and a complete `prices` array using the same fields as agreed prices. Dates are unique and ascending. The latest eligible revision activates at midnight Eastern time and remains effective until the next revision. For example:

```json
[
  {
    "effectiveFrom": "2030-01-02",
    "prices": [{"sku": "OAT-1", "unitCents": 1303, "minQty": 1}]
  }
]
```

Save these fields through the normal account editor or the `account.save` HTTP command. Account-owned brand books support the same `priceRevisions` field through `profile.save`. Existing supplier permissions, revision checks, audit attribution and archive custody apply. A revision is a complete assortment, including any configured selling units and pricing rules. Future rows do not affect today’s quotes or carts. New carts and quotes use the active prices; submission, supplier approval and quote acceptance recheck current prices. A newly activated revision requires republication before preparing from an older line sheet. Issued documents keep their original agreed currency and integer cents.

**Dated USD conversion basis** optionally records a supplier’s reporting reference:

```json
{
  "asOf": "2026-10-26",
  "numerator": 73,
  "denominator": 100,
  "source": "Supplier daily CAD reference"
}
```

The positive integer ratio means USD cents per original currency cent. An order freezes the date, ratio and source at preparation; a converted quote freezes them at acceptance. A basis dated after the transaction is refused. USD orders record their original 1:1 basis. Older orders and foreign orders without a basis show **not recorded**; no rate is inferred or fetched.

Sales and invoice-aging reports, including their CSV downloads, show the frozen basis and supplementary USD cents beside the unchanged transaction amount. Conversion rounds half up once per displayed amount using integer arithmetic. Whole-unit quantities multiplied by integer prices require no rounding in the original currency. Conversion amounts never feed checkout, invoices, tax, card authorization, capture or statements. Existing USD-only delivery methods and finite USD purchasing allowances continue to refuse other currencies instead of relabeling amounts.

The held-key card sandbox journey supports explicit CAD presentment with `BARROW_SANDBOX_CURRENCY=CAD`, the `credit` case and zero surcharge. It retains hosted entry, exact amount consent, merchant capture and signed event assertions, and requires a reachable public HTTPS callback ingress. A failed callback setup is not a payment receipt.
