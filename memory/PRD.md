# Glint — Product Requirements (living doc)

## Original problem statement
Modern, highly interactive social media app "Glint" with custom UI, dark/light toggle:
onboarding/registration (terms checkbox, basic info, email/phone OTP, profile+cover photo w/ skip, bio/location, success, forgot password); home feed (text/photo/poll posts, story bar, 6 emoji reactions, comment/share/save/hide/report); Facebook/IG stories (24h, photo+text, full-screen viewer w/ progress + tap-advance); custom profile (cover+avatar, shareable link + QR, edit); settings/security (delete account, privacy public/friends, block/unblock); friend system (send/accept/reject/cancel, people you may know); chat (text/photo/voice notes, online dot/last seen, delivery ticks, mute); Golden Tick verification (ID upload → admin approval); Help Center tickets; Admin panel (analytics, resolve tickets, approve/reject verifications, delete reported content, suspend/delete users, broadcast banner, force update).

## Architecture
- Frontend: Expo Router (React Native), react-query, custom theme (light+dark) in src/theme.ts, Ionicons, expo-image, expo-image-picker, expo-audio (voice notes), react-native-qrcode-svg, react-native-keyboard-controller.
- Backend: FastAPI (single server.py) + MongoDB (motor), uuid string ids (no ObjectId), JWT auth (bcrypt), simulated OTP (dev_otp in response + toast).
- Storage: Emergent Managed Object Storage (storage_helper.py) via /api/upload + /api/files/{path}?token=.
- Admin: separate token via /api/admin/login (env ADMIN_EMAIL/ADMIN_PASSWORD).

## User personas
- Everyday social user (post, story, chat, friends).
- Creator seeking Golden Tick verification.
- Platform admin/moderator.

## Core requirements (static) — see problem statement above.

## Implemented (2026-06)
- Full onboarding (5 steps + terms gate + OTP), login, forgot/reset.
- Home feed with story bar, posts (text/photo/poll), 6 reactions, comments, share, save, hide, report, broadcast banner.
- Stories create (photo/text w/ bg colors) + full-screen viewer (progress, tap-advance, reply, delete, 24h expiry).
- Profile (self + others), edit profile, QR + shareable link, privacy public/friends, block/unblock, delete account.
- Friend system (request/accept/reject/cancel, suggestions), user search.
- Chat (text/photo/voice notes, online/last seen, delivery ticks sent/delivered/read, mute).
- Golden Tick verification (ID upload → admin approve), Help Center tickets.
- Admin dashboard (stats, tickets resolve, verifications approve/reject, reports delete/dismiss, users suspend/delete, broadcast, force update).
- Dark/light/system theme toggle. Video uploads/calls disabled in UI (schema future-ready).
- **Activity center** (2026-06): notifications for reactions (with emoji), comments, friend requests/accepts, and chat messages. Bell icon on home header w/ live unread badge (15s poll), full Activity screen with actor avatars + per-type icon badges, auto mark-all-read, tap-to-navigate to post/chat/friends. Friends tab badge shows pending request count.
- Verified: 33/33 backend tests pass; key UI flows verified.
- **Premium Gold & Charcoal theme** (2026-06): full re-theme to gold (#EAB308/#D97706) on charcoal (#0F172A/#1E293B) cards (#1F2937), white headings, muted grey secondary text. Dark is default; manual scheme override (web-safe) in theme.ts + ThemeModeContext, toggle still available (light keeps gold accents). Fixed golden-tick bug: `verified` (OTP) vs `golden_tick` are now separate fields — tick only after admin approval.
- **Strict Black & Golden lock** (2026-06): theme locked to one palette — pure black (#000000/#0F0F0F) backgrounds, gold (#EAB308/#D97706) accents, white headings. `themes.light === themes.dark`, toggle UI removed, Stack contentStyle black, +html.tsx body black (no white flash on transitions/hydration). Verified by testing agent (computed-style assertions across all screens).

## Backlog / remaining (P1/P2)
- P1: Realtime chat (websockets) instead of polling; force-update popup enforcement on client; in-app push delivery of notifications (native builds).
- P1: Story viewers list; group chats.
- P2: Saved posts bookmark folder screen; story viewers list; group chats.
- P2: Split server.py into per-domain routers.

## Next tasks
- Await user feedback / next feature request.
