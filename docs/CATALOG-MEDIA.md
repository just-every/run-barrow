# Reviewed catalog media

The owner opens **Settings → Catalog media → Catalog membership settings** to name each catalog and explicitly select its imported variants and accepted JPEG references. Assortment labels in a workbook do not grant access. Membership must be reviewed again after an owner import or variant change changes its source revisions.

In **Team**, the owner grants an activated sales manager **Prepare and replace accepted catalog images** and selects the named catalogs. Account permissions do not imply this entitlement. A variant shared by several catalogs requires every containing catalog, and its chosen image must be approved for each of them.

An entitled manager opens **Settings → Catalog media**, chooses a catalog, imported variant, stored image reference and slot, then prepares the match. Review the affected catalogs, enter an attributed reason and approve the exact replacement. A changed grant, membership, source or image requires a new review. Only one concurrent application of a reviewed fingerprint succeeds.

This door accepts installed sanitized JPEG references only. It does not upload files, retrieve URLs, deliver image bytes or activate an importer. Existing order and confirmation images retain their original hashes. Retained import history is unchanged. Revoking or narrowing the grant closes the next request; Native activation changes require a fresh owner grant. Restored grants are revoked.

Owner audit search and its complete CSV retain attributed permission decisions. Managers see only their own decisions within their current catalog scope, plus their own permission refusals. Removing a catalog from the grant hides older decisions that affected it.

The public endpoints are `GET /api/barrow/catalog-media`, `POST /api/barrow/catalog-media/membership` (owner only), `POST /api/barrow/catalog-media/preview` and `POST /api/barrow/catalog-media/apply`. A preview accepts `catalogId`, `sku`, integer `slot` and `imageSha256`; apply adds the returned `fingerprint` and a `reason`. Membership saves bind its current `revision`, `catalogRevision` and `variantRevision` to the complete reviewed `catalogs` array. Every write uses this installation’s own origin and a current Native person session.

ACC-005 remains partial. Broader finance, reconciliation, returns and media obligations remain in its contract Gap. The current private JPEG policy, scanner hold and broader buyer delivery boundary remain unchanged.
