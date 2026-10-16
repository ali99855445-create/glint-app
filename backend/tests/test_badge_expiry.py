from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, patch
from pydantic import ValidationError
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verification_badges import BADGES, manual_badge, manual_badge_update, display_badge
from blue_tick import blue_tick_active, resolve_blue_entitlements
import server

PAID = {'blue_identity_approved': True, 'blue_subscription_status': 'active', 'blue_subscription_ends_at': '2099-01-01T00:00:00+00:00'}
PAST = '2000-01-01T00:00:00+00:00'
FUTURE = '2099-01-01T00:00:00+00:00'

class BadgeExpiryTests(TestCase):
    def test_all_badges_expire_with_benefits_even_with_stale_legacy_flags(self):
        for badge in BADGES:
            user = {'manual_verification_badge': badge, 'manual_badge_expires_at': PAST, 'blue_tick_manual': True, 'blue_manual_grant': True}
            self.assertIsNone(display_badge(user, blue_tick_active))
            ent = resolve_blue_entitlements(user)
            for key in ('active','badge_everywhere','priority_support','video_stories','external_links','impersonation_protection'):
                self.assertFalse(ent[key], (badge,key))
            self.assertEqual(ent['external_links_max'], 0)
            self.assertEqual(ent['story_video_max_seconds'], 0)
    def test_future_badge_keeps_color_and_benefits(self):
        for badge in BADGES:
            user = {'manual_verification_badge': badge, 'manual_badge_expires_at': FUTURE}
            self.assertEqual(display_badge(user, blue_tick_active), badge)
            self.assertTrue(blue_tick_active(user))
    def test_expiry_boundary_is_exclusive(self):
        now = datetime(2026,10,16,tzinfo=timezone.utc)
        user = {'manual_verification_badge':'green','manual_badge_expires_at':now.isoformat()}
        self.assertIsNone(manual_badge(user, now))
        self.assertEqual(manual_badge(user, now-timedelta(microseconds=1)), 'green')
    def test_invalid_expiry_fails_closed(self):
        for expiry in ('garbage','',{},42):
            self.assertIsNone(manual_badge({'manual_verification_badge':'golden','manual_badge_expires_at':expiry}))
    def test_existing_permanent_grants_remain_compatible(self):
        self.assertEqual(manual_badge({'blue_tick_manual':True}), 'blue')
        self.assertEqual(manual_badge({'manual_verification_badge':'silver'}), 'silver')
    def test_expired_manual_falls_back_to_paid_blue(self):
        user = {**PAID,'manual_verification_badge':'golden','manual_badge_expires_at':PAST,'blue_tick_manual':True}
        self.assertEqual(display_badge(user,blue_tick_active),'blue')
        self.assertEqual(resolve_blue_entitlements(user)['source'],'subscription')
    def test_renew_remove_and_permanent_do_not_touch_paid_subscription(self):
        user = {**PAID, **manual_badge_update('golden',7)}
        first_expiry = user['manual_badge_expires_at']
        user.update(manual_badge_update('golden',30))
        self.assertGreater(user['manual_badge_expires_at'],first_expiry)
        user.update(manual_badge_update('green',None))
        self.assertIsNone(user['manual_badge_expires_at'])
        user.update(manual_badge_update(None))
        self.assertIsNone(user['manual_verification_badge'])
        self.assertFalse(user['blue_tick_manual'])
        self.assertFalse(user['blue_manual_grant'])
        self.assertEqual(display_badge(user,blue_tick_active),'blue')
        for key,value in PAID.items():self.assertEqual(user[key],value)
    def test_duration_input_validation_all_admin_entrypoints(self):
        for model,args in [(server.AdminBadgeBody,{'badge':'blue'}),(server.AdminBlueTickBody,{'verified':True}),(server.ManualBlueBody,{'user_id':'u','enabled':True})]:
            for invalid in (0,-1,36501,1.5,True,'7'):
                with self.assertRaises(ValidationError):model(**args,duration_days=invalid)
    def test_public_expired_badge_hides_saved_links(self):
        user={'id':'u','manual_verification_badge':'green','manual_badge_expires_at':PAST,'external_links':[{'url':'https://example.com'}]}
        result=server.public_user(user)
        self.assertFalse(result['verified']);self.assertIsNone(result['verification_badge']);self.assertEqual(result['external_links'],[])

class BadgeRouteTests(IsolatedAsyncioTestCase):
    async def test_admin_assignment_persists_duration_and_audit(self):
        user={'id':'u'}
        db=SimpleNamespace(users=AsyncMock())
        db.users.find_one.side_effect=[user,{**user,**manual_badge_update('business',7)}]
        with patch.object(server,'db',db),patch.object(server,'admin_audit',AsyncMock()) as audit,patch.object(server,'admin_notify',AsyncMock()):
            result=await server.admin_badge('u',server.AdminBadgeBody(badge='business',duration_days=7),{})
        update=db.users.update_one.call_args.args[1]['$set']
        self.assertEqual(update['manual_verification_badge'],'business')
        self.assertAlmostEqual((datetime.fromisoformat(update['manual_badge_expires_at'])-datetime.fromisoformat(update['manual_badge_granted_at'])).total_seconds(),7*86400)
        self.assertTrue(result['benefits_active']);self.assertEqual(audit.call_args.args[-1]['duration_days'],7)
    async def test_expired_badge_is_rejected_by_benefit_guard(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):
            await server.require_blue({'id':'u','manual_verification_badge':'blue','manual_badge_expires_at':PAST,'blue_tick_manual':True})
    async def test_entitlement_endpoint_reports_paid_fallback(self):
        result=await server.blue_entitlements({**PAID,'manual_verification_badge':'golden','manual_badge_expires_at':PAST,'blue_tick_manual':True})
        self.assertEqual(result['blue']['source'],'subscription');self.assertIsNone(result['manual_badge']['badge'])
    def test_badge_endpoint_requires_admin_dependency(self):
        route=next(r for r in server.api.routes if getattr(r,'path','').endswith('/admin/users/{user_id}/badge'))
        self.assertTrue(any(d.call is server.require_admin for d in route.dependant.dependencies))
