# Seasonal line sheets and retail prices

Open **Line sheets** in the installed app. The supplier owner, admin or a currently scoped sales manager publishes a separate share for each trade account. Its signed-in purchasers and currently authorized supplier staff can read it; knowing a link never grants another account's prices. Revoking the share closes its page, PDF, order form, activity and new-order doors. Existing orders and their immutable confirmations remain commercial history.

Each account has one active USD or CAD price book. **Accounts → Edit account** edits wholesale prices, optional per-variant MSRP in integer minor units, the ISO currency, and separate confirmation PDF and order CSV price preferences. Leave an MSRP entry out to record it as absent. In **Line sheets → Import recipient price book**, paste this CSV (blank MSRP means absent):

```csv
sku,currency,unitCents,msrpCents,minQty
TEE-BLUE-S,USD,1201,2402,1
TEE-BLUE-M,USD,1201,,1
TEE-BLUE-3XL,USD,1601,3202,1
```

Every row in a recipient book has the same currency. Import replaces that account's agreed assortment and requires its current revision. Export uses the same columns. USD and CAD books use separate recipient accounts; no exchange conversion is inferred. A currency change never silently converts configured selling-unit prices or pricing rules. Reprice those explicitly in Edit account first. The older whole-account CSV format has no currency column and refuses updates to CAD accounts.

**Publish seasonal line sheet** chooses the name, season, exact eligible SKUs, inclusive ship window and price columns: wholesale, retail, or both. Both displays gross margin `(MSRP − wholesale) / MSRP`, rounded half up to a basis point (two decimal percent places). Missing or zero MSRP has no margin. MSRP never feeds wholesale order, quote, invoice, tax, payment or commission calculations.

Publication freezes the recipient book, price display and revision. Stock remains an observation from Pier. A changed account book requires a newly published sheet before preparing another order; the old sheet and issued confirmations keep their recorded prices. Confirmation preferences are frozen when the order is prepared. The complete administrative data export remains a complete commercial record.

A size run or fixed assortment is a named set of exact SKU quantities, for example:

```json
[{"id":"spring-run","name":"Spring size run","kind":"run","lines":[{"sku":"TEE-BLUE-S","quantity":1},{"sku":"TEE-BLUE-M","quantity":2},{"sku":"TEE-BLUE-3XL","quantity":1}]}]
```

Use `kind: "assortment"` for a fixed case assortment. Ordering one pack expands exactly those quantities into variant lines. Each size keeps its own wholesale/MSRP and stock rules. An unavailable size blocks the cart; Barrow never moves its quantity to another size. Choose a displayed minimum/case correction explicitly.

On a phone, enter variant quantities or pack counts, then **Preview sheet cart**. **Keep reviewed cart for merge** saves a cart within that screen; choose Merge or Replace for the next preview. **Matrix order form CSV** downloads a fillable style-by-size form. Upload it through the same preview, resolve duplicate/hidden SKU and quantity problems, and prepare only a ready cart. Preparation rechecks current prices and Pier stock. Submit the resulting draft in Orders; supplier approval hands exact SKU/base quantities to Pier.

**Account PDF** includes only the configured price columns, ISO currency, recipient and revision. Orders provides the recorded confirmation PDF and CSV with their independently configured columns. Order totals remain wholesale even when the document shows retail prices.

**Data → Quote conversion → Line-sheet engagement per buyer** shows authenticated buyer opens, visible-item view observations and SKU observations for the report period. Supplier previews do not count. Currency selection keeps quote/order money in one recorded currency, without conversion. Campaign sending, lookbooks, product-media storage and currency-converted reports belong to their own contract clauses.

CAD vertical cart forms label their `unitPrice` with an explicit `currency` column; USD forms retain the existing `unitPriceUsd` column. Both upload through the same exact-quantity preview. Existing USD delivery methods are refused for CAD quotes and orders; they are never relabeled or converted implicitly.
