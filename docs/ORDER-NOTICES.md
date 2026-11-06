# Native order notices

Orders shows recorded acceptance, material recorded stock changes, acknowledged Pier dispatches and text-only return decisions. Each fact retains its source identity and revision. Repeating a read or stock refresh creates no second notice for unchanged evidence. Separate split dispatches remain separate facts. A dispatch does not establish delivery.

The Orders panel opens the current source, rechecking the signed-in person's current order rights, delivery locations and functional staff scope. Return decisions retain their existing owner and admin review boundary; functional staff do not gain return access. Unknown or disconnected dispatch sources refuse a current-source read. Notice payloads contain controlled facts and quantities, with no finance values or copied personal narratives.

Settings contains each person's per-account category preferences. Marking a notice read affects only that person. Suppression hides that category from their in-app list while retaining its recorded facts. It does not authorize email. Current authorized JSON exports include `ordernotices` and `ordernoticepreferences`; the corresponding CSV doors preserve stable source identities, revisions and that person's read and preference state.

Owner-reviewed account erasure removes notice facts and personal state, then fences retained order sources against recreation. Company-person erasure removes that person's read state and preferences. Archives preserve inactive notice history; restore cannot show old notices as new, mark them read or activate their preferences. The independent later erasure journal removes erased state before restored data can be served.

Capture is native and transactional for acceptance, recorded stock changes and return decisions. Current authorized notice reads reconcile and capture acknowledged dispatches from the order's original connected Pier installation. There is no polling of a carrier provider or new outbound sender.

AUTO-004 remains partial. Accepted-order edits, canceled-style drops, holds, carrier delivery exceptions, email recipient and sender consent, sending, delivery tracking, suppression, owned bounce handling and the complete carrier-replay acceptance remain owed. ORD-011 and ORD-016 retain Pier's missing partial-edit prerequisite. Live carrier proof retains SHIP-003 and the unavailable owner-provisioned EasyPost account. Supported Base changes remain held.
