# Admin module upgrade

The Expo admin dashboard supplies the Android admin screen and the Render-hosted `/admin` website from the same source.

- Every dashboard counter opens the related module and filter, including active/suspended/Blue Tick accounts, posts/comments/stories, verification queue, open tickets/appeals, warnings, and message activity.
- Modules expose filters and a three-dot settings menu; individual review cards expose three-dot actions.
- Verification approval/rejection, report dismissal/removal, content removal/restoration, appeal decisions and ticket resolution collect a custom reason. Verification approval explicitly confirms the identity checks required by the existing API.
- Each feature switch saves separately. Maintenance, broadcasts and force-update remain separate controls.
- Server decision notices and audit logging continue to apply. Messenger report wrappers now forward admin authorization and decision reasons correctly.
- Query failures and moderation mutation failures display errors instead of silently failing.
- The checked-in web export was rebuilt from this source. Android users need a newly built and distributed app version to receive the dashboard UI changes.

## Validation

- 25 isolated tests passed for admin controls, decisions and web serving, including a regression test for Messenger report wrappers.
- TypeScript `tsc --noEmit` passed. Three existing type incompatibilities (icon colors, the sparks field, and the story fill style) were corrected to complete this check.
- Expo production web export completed successfully.
- Broader backend tests were blocked by automatic approval review after they attempted to call an external preview service. Those integration tests are not reported as passed.
- Browser visual/end-to-end testing was unavailable: the Chromium download failed in this environment. Production admin login, real data flows and the Android release still require live validation.

No authentication, OTP credentials, subscriptions, database schema, or hosting plan settings were changed by this upgrade.
