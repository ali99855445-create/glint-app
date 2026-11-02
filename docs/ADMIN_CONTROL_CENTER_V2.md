# Admin control center upgrade

## Result

Counters open the matching section: users, recently active users, suspended accounts, paid/manual Blue holders, posts, comments, reports, appeals, tickets, warnings, and message operations. Users and content have three-dot action menus; the dashboard menu opens settings, feature controls, audit history, and system health.

Content is separated into posts, stories, and comments. Each item's related-report action filters reports to that exact item. Reports can also be filtered by target type. Private message bodies are not exposed by the message summary.

Verification decisions require a 10–4000-character reason. Approval additionally requires an explicit identity-match confirmation. Decisions, appeal results, support-ticket resolutions, and verified-profile changes generate an in-app Glint Safety & Trust Team notice with the reason, reference, and next steps. No new external email delivery is enabled by this change.

Blue verification permits two rejected applications with another attempt. The third distinct rejection, or an administrator's permanent rejection, prevents further applications and new checkout. Duplicate review submissions return a conflict and do not add strikes. Historical rejected applications count toward the threshold and prevent a fourth application or new checkout. Deployment does not retroactively decide pending cases or bulk-modify users; cancellation is attempted when a permanent rejection is recorded through the upgraded review flow.

A permanent rejection attempts to stop future Google Play payments using the configured service account and the existing purchase token. Success, pending failure, and non-recurring/no-token cases have separate statuses. Pending cancellations have an admin retry action. This does not issue or promise a refund: notices link to Google Play subscription management and refund guidance. No real subscription was cancelled during development.

User control adds email, international-format phone, and category editing. Contact changes enforce uniqueness, clear the relevant verification flag, end existing user sessions, and record a reason. Categories are configurable in Dashboard Settings.

## Validation

- TypeScript: `cd frontend && npx tsc --noEmit`.
- Web export: `cd frontend && npx expo export --platform web --output-dir dist-admin`.
- Frontend regression checks: `cd frontend && node --test tests/*.test.mjs` (31 checks).
- Backend: `PYTHONPATH=backend python -m pytest backend/tests/test_admin_control_center.py backend/tests/test_admin_review_policy.py backend/tests/test_verification_state.py backend/tests/test_play_billing.py backend/tests/test_badge_expiry.py backend/tests/test_blue_pass.py -q` (68 checks).
- The tests use isolated mocks; production users, documents, decisions, and billing were not changed.

## Release

This branch is based on `fix/blue-auto-renew-v25`, the existing website/app source. Deploy the backend changes to Render and the corresponding web export to the existing Hostinger website together. Render currently follows `main`; merging into this source branch alone does not deploy that service. The Google Play app requires its own new build/release to show new client screens. Existing native clients still receive server enforcement.

The web export uses the existing production API URL. The explicit Expo Asset 57 pin prevents Expo Audio's open peer dependency from installing incompatible Expo Asset 58. A reproducible npm lockfile is included.

Hostinger tools were not exposed in this session despite all nine servers being registered. Live publication and browser acceptance checks remain pending hosting access. Do not claim the upgrade is live until counters, menus, review forms and category settings have been verified on the deployed site. Use test accounts/applications for acceptance checks; do not reject a real user to test the limit.

## References

- Google Play cancellation API: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/cancel
- Purchase and refund management: https://developer.android.com/google/play/billing/manage-purchases
