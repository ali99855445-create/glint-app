"""Account ownership and evidence regression checks for the v18 release."""
import sys
from pathlib import Path
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
import hashlib
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from fastapi import HTTPException

class V18Tests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.db=SimpleNamespace(users=AsyncMock(),contact_verifications=AsyncMock(),files=AsyncMock(),verifications=AsyncMock(),profile_reviews=AsyncMock())
        self.db.users.find_one.return_value=None
        self.db.contact_verifications.find_one.return_value=None
        self.db.contact_verifications.count_documents.return_value=0
        self.db.verifications.find_one.return_value=None
        self.db.files.find_one.return_value={'owner_id':'a'}
        self.me={'id':'a','full_name':'Test User','email':'old@example.com','password':server.hash_pw('correct-password'),'blue_subscription_status':'active','blue_subscription_ends_at':'2099-01-01T00:00:00+00:00'}
        p=patch.object(server,'db',self.db);p.start();self.addCleanup(p.stop)
    async def test_phone_not_required_for_paid_application(self):
        with patch.object(server,'app_feature_enabled',return_value=True):
            result=await server.submit_verification(server.VerificationSubmit(document='/api/files/id.jpg',selfie='/api/files/selfie.mp4',full_legal_name=' test   USER '),self.me)
        self.assertTrue(result['ok'])
        self.assertEqual(self.db.verifications.insert_one.call_args.args[0]['selfie_media_type'],'video')
    async def test_profile_name_mismatch_is_rejected(self):
        with patch.object(server,'app_feature_enabled',return_value=True),self.assertRaises(HTTPException) as e:
            await server.submit_verification(server.VerificationSubmit(document='/api/files/id.jpg',selfie='/api/files/selfie.mp4',full_legal_name='Another Person'),self.me)
        self.assertEqual(e.exception.status_code,400)
        self.db.verifications.insert_one.assert_not_awaited()
    async def test_photo_or_foreign_selfie_cannot_replace_video(self):
        self.db.files.find_one.side_effect=[{'owner_id':'a'},None]
        with patch.object(server,'app_feature_enabled',return_value=True),self.assertRaises(HTTPException):
            await server.submit_verification(server.VerificationSubmit(document='/api/files/id.jpg',selfie='/api/files/photo.jpg',full_legal_name='Test User'),self.me)
        self.db.verifications.insert_one.assert_not_awaited()
    async def test_bad_password_does_not_send_code(self):
        with patch.object(server,'send_otp_email',new_callable=AsyncMock) as send,self.assertRaises(HTTPException):
            await server.request_contact_link(server.ContactLinkRequest(kind='email',contact='new@example.com',password='wrong'),self.me)
        send.assert_not_awaited()
    async def test_phone_code_is_sent_without_changing_account(self):
        with patch.object(server,'send_phone_otp',return_value=True),patch.object(server,'_infobip_sms_configured',return_value=True):
            result=await server.request_contact_link(server.ContactLinkRequest(kind='phone',contact='+966580000000',password='correct-password'),self.me)
        self.assertIn('request_id',result)
        record=self.db.contact_verifications.insert_one.call_args.args[0]
        self.assertEqual(record['kind'],'phone')
        self.assertNotIn('code',record)
        self.db.users.update_one.assert_not_awaited()
    async def test_expired_or_other_account_code_cannot_link(self):
        self.db.contact_verifications.find_one_and_update.return_value=None
        with self.assertRaises(HTTPException):
            await server.confirm_contact_link(server.ContactLinkConfirm(request_id='another-user',code='123456'),self.me)
        self.db.users.update_one.assert_not_awaited()
    def record(self):
        return {'kind':'email','contact':'new@example.com','old_contact':'old@example.com','provider':'local','code_hash':hashlib.sha256(b'request123456').hexdigest()}
    async def test_bad_code_cannot_change_contact(self):
        self.db.contact_verifications.find_one_and_update.return_value=self.record()
        with self.assertRaises(HTTPException):
            await server.confirm_contact_link(server.ContactLinkConfirm(request_id='request',code='999999'),self.me)
        self.db.users.update_one.assert_not_awaited()
    async def test_otp_success_verifies_contact_and_keeps_same_account(self):
        self.db.contact_verifications.find_one_and_update.return_value=self.record()
        self.db.users.update_one.return_value=SimpleNamespace(matched_count=1)
        with patch.object(server,'admin_notify',new_callable=AsyncMock):
            result=await server.confirm_contact_link(server.ContactLinkConfirm(request_id='request',code='123456'),self.me)
        self.assertTrue(result['ok'])
        self.assertEqual(self.db.users.update_one.call_args.args,({'id':'a','email':'old@example.com','deleted_at':None},{'$set':{'email':'new@example.com','email_verified':True}}))
    async def test_contact_already_claimed_cannot_be_taken(self):
        self.db.contact_verifications.find_one_and_update.return_value=self.record()
        self.db.users.find_one.return_value={'id':'b'}
        with self.assertRaises(HTTPException) as e:
            await server.confirm_contact_link(server.ContactLinkConfirm(request_id='request',code='123456'),self.me)
        self.assertEqual(e.exception.status_code,409)
        self.db.users.update_one.assert_not_awaited()
    async def test_dashboard_admin_token_can_load_profile_queue(self):
        with patch.object(server,'require_admin',return_value={'admin':True}),patch.object(server,'get_current_user',new_callable=AsyncMock) as user:
            self.assertEqual(await server.require_review_admin('Bearer admin-token'),{'admin':True})
        user.assert_not_awaited()
    async def test_regular_user_cannot_review_identity(self):
        with patch.object(server,'require_admin',side_effect=HTTPException(403,'Admin only')),patch.object(server,'get_current_user',return_value={'id':'a','email':'ordinary@example.com'}),self.assertRaises(HTTPException) as e:
            await server.require_review_admin('Bearer user-token')
        self.assertEqual(e.exception.status_code,403)
    async def test_approval_requires_explicit_document_face_confirmation(self):
        self.db.verifications.find_one.return_value={'user_id':'a','status':'pending','full_legal_name':'Test User'}
        self.db.users.find_one.return_value=self.me
        with self.assertRaises(HTTPException):
            await server.approve_verification('v',server.IdentityApprovalBody(reason='ok'),{})
        self.db.users.update_one.assert_not_awaited()
    async def test_profile_review_requires_identity_confirmation(self):
        with self.assertRaises(HTTPException):
            await server.review_profile_change(server.ProfileReviewBody(review_id='r',decision='approved'),{})
        self.db.profile_reviews.find_one_and_update.assert_not_awaited()
