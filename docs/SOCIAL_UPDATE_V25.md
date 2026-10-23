# Combined v25 social update

Local implementation accompanies the recurring Blue subscription changes. The new UI retains the existing v24 fixes.

- Notification rows navigate to the referenced post, user, friend requests or direct/group conversation. Admin notices use a Glint shield instead of missing-person initials; removed-content notices open Help, and identity/badge notices open verification. Opening a row marks only that recipient's item read. Mark-all is explicit. Unread notification and message counts appear in red badges.
- Main header order is Glint, three-dot menu, search, Messenger. The old Chats tab is replaced by Groups; the old chat-list route redirects to Messenger. Existing direct/group chat routes remain compatible.
- Messenger preserves direct messages, photos, voice notes, group chats, existing message actions and membership tools. Foreground authenticated WebSocket invalidations refresh conversations/messages/read receipts; polling provides recovery and multi-process fallback. This is not an OS-background push notification integration. Native two-device testing is still required, including offline/reconnect, muted notifications and read receipts.
- Glint community groups are distinct from chat conversations: public/private creation with an owned uploaded image, public discovery, public join/private approval, owner add-friend/remove-member controls, paginated member lists, member posts/photos, idempotent likes, paginated comments, and author/owner removal. Private feeds and private member lists require membership. Posts/comments/members/reactions use separate collections rather than unbounded embedded arrays. Photos store normalized paths with viewer authentication, not the uploader's token.
- New community collections receive query indexes at backend startup. No startup or database mutation has been run against production. Existing app uploads, collections and conversations are not migrated.

Verified local result: 70 backend/signing tests and 27 frontend tests passed; TypeScript passed; Expo Android production export bundled 2,357 modules.

Release checks: Python route/security tests against an in-memory MongoDB mock (no live database), frontend billing/navigation/media tests, TypeScript and Expo Android production export. These checks do not replace signed APK installation, UI/device testing, Google Play purchases or renewal tests.

GitHub remote writes remain pending explicit approval following automatic review's earlier rejection. No branch publication, signed APK/AAB build, backend deployment or Play upload has occurred for this combined update. The proposed build branch remains `fix/blue-auto-renew-v25`; draft PR targets `glint-final-upgrade`, never main. Render main has divergent history and must not receive a wholesale merge. Complete a separate backend reconciliation and obtain deploy approval before changing production.

## Messenger settings follow-up

Messenger has the signed-in Glint profile photo/name, conversation search, Chats/Unread/Group chats filters, new-group action, and a dedicated settings screen. Its scoped preferences expose active status, direct-message read receipts, message-activity notifications and who can send messages (everyone, friends, inner circle or nobody). The Messenger-only block list supports unblocking without modifying independent Glint profile blocks. The direct-chat menu offers both Messenger-only blocking and Glint+Messenger blocking. Existing profile blocks prevent direct messages in both directions.

Chat polling/read marking is now enabled only while that chat screen is focused and the app is in the foreground. Mounted chats behind other screens must not clear unread counts. Opening the conversation list alone does not mark chats read. Two-device/native background testing remains outstanding; this implementation provides foreground live updates and does not add OS push delivery credentials.

Follow-up validation: 95 backend/security/signing checks and 31 frontend checks passed (126 total). Full TypeScript passed. Expo Android production export completed with 2,360 modules. Signed native APK/AAB, device installation, two-device messaging and OS background notification delivery are still unverified. All work remains local pending the previously requested GitHub branch/build approval.
