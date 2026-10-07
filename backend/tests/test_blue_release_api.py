"""Release regressions for verified identity review and existing name rules."""
import sys
from pathlib import Path
from datetime import datetime, timezone
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from fastapi import HTTPException

class ReleaseApiTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = SimpleNamespace(users=AsyncMock(), files=AsyncMock(), profile_reviews=AsyncMock(), verifications=AsyncMock())
        self.patch = patch.object(server, 'db', self.db)
        self.patch.start()
        self.addCleanup(self.patch.stop)
    async def test_absolute_upload_url_enters_identity_review(self):
        self.db.files.find_one.return_value = {'path': 'glint/uploads/a/document.jpg'}
        result = await server.profile_edit_v2(server.ProfileEditV2(full_name='New', name_evidence_url='https://glint-api-xf2i.onrender.com/api/files/glint/uploads/a/document.jpg?token=test', live_selfie_url='/api/files/glint/uploads/a/selfie.jpg'), {'id': 'a', 'full_name': 'Old', 'blue_tick_manual': True})
        self.assertTrue(result['identity_review_required'])
        self.db.files.find_one.assert_awaited_with({'path': 'glint/uploads/a/document.jpg', 'owner_id': 'a'})
        self.db.users.update_one.assert_not_awaited()
    async def test_legacy_edit_cannot_bypass_verified_review(self):
        with self.assertRaises(HTTPException) as exc:
            await server.update_me(server.ProfileUpdate(full_name='Bypass'), {'id': 'a', 'full_name': 'Old', 'blue_tick_manual': True})
        self.assertEqual(exc.exception.status_code, 400)
        self.db.users.update_one.assert_not_awaited()
    async def test_normal_account_keeps_thirty_day_name_cooldown(self):
        with self.assertRaises(HTTPException) as exc:
            await server.update_me(server.ProfileUpdate(full_name='New'), {'id': 'b', 'full_name': 'Old', 'name_changed_at': datetime.now(timezone.utc).isoformat()})
        self.assertEqual(exc.exception.status_code, 409)
        self.db.users.update_one.assert_not_awaited()
    async def test_other_users_identity_document_is_rejected(self):
        self.db.files.find_one.return_value = None
        with self.assertRaises(HTTPException) as exc:
            await server.profile_edit_v2(server.ProfileEditV2(full_name='New', name_evidence_url='/api/files/glint/uploads/b/document.jpg'), {'id': 'a', 'full_name': 'Old', 'blue_tick_manual': True})
        self.assertEqual(exc.exception.status_code, 400)
        self.db.profile_reviews.insert_one.assert_not_awaited()

    async def test_verified_change_requires_live_selfie(self):
        with self.assertRaises(HTTPException) as exc:
            await server.profile_edit_v2(server.ProfileEditV2(full_name='New', name_evidence_url='/api/files/document.jpg'), {'id':'a','full_name':'Old','blue_tick_manual':True})
        self.assertEqual(exc.exception.status_code, 400)
        self.db.profile_reviews.insert_one.assert_not_awaited()

    async def test_public_links_hidden_when_blue_expires_or_revoked(self):
        user={'id':'a','external_links':[{'label':'Social','url':'https://example.com'}],'blue_tick_manual':True}
        self.assertEqual(len(server.public_user(user)['external_links']),1)
        user['blue_tick_manual']=False
        self.assertEqual(server.public_user(user)['external_links'],[])

    async def test_intro_token_restore_is_idempotent(self):
        self.db.users.find_one_and_update.return_value={'id':'a'}
        with patch.object(server.play_billing,'verify_subscription',return_value={'ends_at':'2099-01-01T00:00:00+00:00','auto_renew':True,'offer_id':'firstmonth90'}):
            result=await server.blue_verify_purchase(server.PlayPurchaseBody(purchase_token='same-token'),{'id':'a','blue_intro_used_at':'used'})
        self.assertTrue(result['payment_confirmed'])
        claim=self.db.users.find_one_and_update.call_args.args[0]
        self.assertIn({'blue_intro_purchase_token':'same-token'},claim['$or'])

    async def test_second_intro_purchase_is_rejected(self):
        self.db.users.find_one_and_update.return_value=None
        with patch.object(server.play_billing,'verify_subscription',return_value={'ends_at':'2099-01-01T00:00:00+00:00','auto_renew':True,'offer_id':'firstmonth90'}):
            with self.assertRaises(HTTPException) as exc:
                await server.blue_verify_purchase(server.PlayPurchaseBody(purchase_token='different-token'),{'id':'a'})
        self.assertEqual(exc.exception.status_code,409)
        self.db.users.update_one.assert_not_awaited()

    async def test_new_account_can_submit_paid_identity_review(self):
        self.db.verifications.find_one.return_value=None
        with patch.object(server,'app_feature_enabled',return_value=True):
            result=await server.submit_verification(server.VerificationSubmit(document='/api/files/id.jpg',selfie='/api/files/selfie.jpg',full_legal_name='New User'),{'id':'a','phone_verified':True,'created_at':datetime.now(timezone.utc).isoformat(),'blue_subscription_status':'active','blue_subscription_ends_at':'2099-01-01T00:00:00+00:00'})
        self.assertTrue(result['ok'])
        self.db.verifications.insert_one.assert_awaited_once()
