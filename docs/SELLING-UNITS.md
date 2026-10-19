# Selling units and exact quantities

An account's agreed SKU price is the price of one stock unit reported by Pier. In **Accounts → Edit account → Selling units**, add optional selling-unit definitions for that account. A definition gives a code, the exact conversion to Pier stock units, the price in USD cents and a description of its pack contents:

```json
[{"sku":"TEE-1","units":[{"code":"case","baseQuantity":"12","unitCents":11000,"packContents":"12 tees per case"},{"code":"yard","baseQuantity":"0.9144","unitCents":333,"packContents":"0.9144 meters per yard","quantityKind":"measured"}]}]
```

Configure each definition against the SKU's actual stock unit; the yard example applies to a SKU stocked in meters. Codes are case sensitive and unique per SKU. Use a distinct code rather than redefining the stock unit. A blank configuration uses only the stock unit's agreed price. Native account edits and the existing account/price CSV update preserve these definitions for retained SKUs.

In the order pad, **Order by selling unit** lets you choose a SKU and allowed unit for each line. Add separate case and each lines of the same SKU. Two cases of 12 plus six each become one 30-each Pier reservation, while the order and invoice retain the two selling bases and prices. Minimums and stock are checked on the combined base quantity, so two lines cannot each consume the same available units.

Counts, including case and pallet, require whole quantities. A configured `quantityKind: "measured"` allows positive decimal quantities up to six places; case and pallet remain whole. Conversions are exact decimal strings up to six places. A conversion that would need finer base precision is refused. Quantities and conversion factors are at most 1,000,000. A measured line price rounds once to the nearest cent, with exact half cents rounded up; order totals add those integer line cents. No exchange-rate conversion occurs.

Review the resulting draft in Orders before submission. Reopening a unit draft keeps every SKU/unit line. Reordering selects original SKU/unit pairs and compares current conversions, quantities and prices before acknowledgment. Editing configuration never rewrites an issued invoice or historical stock handoff.

## HTTP and invoice CSV

The authenticated `order.prepare` command accepts `lines: [{"sku":"TEE-1","unit":"case","quantity":2},{"sku":"TEE-1","unit":"each","quantity":6}]`. Omit `unit` for the existing stock-unit order door. Undefined units or conversions, duplicate SKU/unit pairs, fractional counts, unmet minimums and combined stock shortfalls are refused. Caller-supplied prices and base quantities have no authority.

Invoice CSV adds `ordered_unit`, `price_basis`, `conversion_to_base`, `base_quantity`, `base_unit` and `pack_contents`, alongside the original ordered `quantity`, `unit_cents` and integer `line_cents`. Historical records whose unit was never captured leave that label absent rather than guessing it.
