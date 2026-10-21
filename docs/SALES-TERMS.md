# Sales terms and acceptance (ORD-015)

Owner and admins publish sales terms on the Accounts page as numbered, immutable versions of a named series, as text, a PDF (up to 1 MB) or both. A series is assigned to a trade account, with acceptance required or optional. Assignment follows the series: the version an account accepts is the newest one when the order is submitted, so publishing version 2 applies to every assigned account's next order and never changes an accepted order.

When acceptance is required, a buyer ticks acceptance of the current version in Orders before submitting. For a rep order, the owner or admin acting for the rep captures the buyer's printed name and an on-device signature drawn on the canvas. The signature image and printed name are recorded as entered; Barrow does not verify identity or certify a legally binding electronic signature.

Each order keeps the accepted series, version, digests, how, who and when. Its submitted and accepted confirmations copy the accepted terms text and acceptance record. `GET /api/barrow/orders/<id>/terms-signature` returns the signature image with the order's own visibility. Commercial exports add `salesterms` and `termsacceptances`; owner archives retain them.

Brand and season assignment, re-acceptance on material order revisions and offline signature capture belong to CAT-006, CAT-008, ORD-011, ORD-016, REP-002 and REP-003, which inherit this record before they ship.
