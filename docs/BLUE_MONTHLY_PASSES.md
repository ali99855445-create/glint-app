# Glint account-specific monthly passes (v23)

Each purchase adds one calendar month to the logged-in Glint account, from the later of now or its existing paid period. No automatic billing. Government ID and live selfie approval remain mandatory. Existing recurring Google Play subscriptions stay supported and are never transferred or cancelled automatically. Active auto-renew subscribers must turn off renewal before buying a pass for the SAME Glint account; a subscription for ANOTHER account does not block a pass.

## Required Play Console configuration before enablement

Create and activate two **one-time products** (buy option, consumable fulfillment; NOT subscription base plans):

* `glint_blue_month_pass`: Glint Blue — One Month. Match the existing regular monthly price and supported regions/currencies.
* `glint_blue_month_pass_intro`: Glint Blue — First Month. Match the existing first-month discounted price (90% off), same regions/currencies. Glint enforces eligibility once per Glint account.

Display description: “One calendar month of Glint Blue access for the signed-in Glint account. Does not renew automatically. Identity approval is required for verification and benefits. Payment does not guarantee verification.”

Do not enable multi-quantity. Keep old `glint_blue_monthly` subscription active for existing subscribers. Do not change existing production release or countries as part of this setup.

Deploy backend code, then enable `PLAY_BLUE_PASSES_ENABLED=true` only after both one-time products are active. Until that flag is enabled, old clients and v23 retain the existing subscription flow. v23 uses `/blue/passes/verify`; old clients continue `/blue/purchases/verify`.

Google server-side validation checks package, product, completed payment and hashed Glint owner. Token grant is durable and idempotent before server consumption makes the product repurchasable. Expiry is enforced without a cron. Authenticated requests recheck current pass receipts every five minutes for refunds; network errors do not revoke a paid pass.

## Release validation

Use Internal testing and license testers first. Purchase for account A, then account B on the same Play account. Confirm separate receipts, separate identity review, correct expiry, recovery after interrupted purchase, duplicate callbacks, repeat renewal, expiry, refund, and existing recurring subscription compatibility. Never test by transferring/reusing a receipt between accounts.

Do not claim real billing is verified until the Play Console products have been configured and device testing passes.
