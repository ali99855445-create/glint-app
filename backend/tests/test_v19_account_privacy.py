"""Access-boundary regressions for suspension, privacy and two-step login."""
import sys, time, base64, hmac, hashlib, struct
from pathlib import Path
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from fastapi import HTTPException
class AccountTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.db=SimpleNamespace(users=AsyncMock(),sessions=AsyncMock(),login_events=AsyncMock(),notifications=AsyncMock())
        self.me={'id':'a','username':'test','password':server.hash_pw('password-123'),'verified':True}
        p=patch.object(server,'db',self.db);p.start();self.addCleanup(p.stop)
    async def test_suspension_does_not_expire(self):
        user={**self.me,'suspended':True,'suspended_until':'2000-01-01T00:00:00+00:00','suspend_reason':'Review'}
        result=await server.active_suspension(user)
        self.assertTrue(result)
        self.db.users.update_one.assert_not_awaited()
    async def test_suspended_login_only_grants_appeal_token(self):
        self.db.users.find_one.return_value={**self.me,'suspended':True}
        result=await server.login(server.LoginBody(contact='test',password='password-123'))
        self.assertTrue(result['restricted'])
        self.assertTrue(server.decode_token(result['appeal_token'])['restricted'])
        self.assertNotIn('token',result)
        self.db.sessions.insert_one.assert_not_awaited()
    async def test_appeal_token_cannot_access_feed_even_after_restore(self):
        payload=server.decode_token(server.make_token('a'));payload['restricted']=True
        token=server.jwt.encode(payload,server.JWT_SECRET,algorithm='HS256')
        self.db.users.find_one.return_value=self.me
        with self.assertRaises(HTTPException):await server.get_current_user('Bearer '+token)
    async def test_hidden_profile_details_never_leak(self):
        user={**self.me,'profile_details':{'music':{'value':'Private','visibility':'only_me'},'hobbies':{'value':'Reading','visibility':'public'},'work':{'value':'Office','visibility':'friends'}}}
        self.assertEqual(set(server.visible_details(user,'b')),{'hobbies'})
        self.assertEqual(set(server.visible_details(user,'b',True)),{'hobbies','work'})
        self.assertEqual(len(server.visible_details(user,'a')),3)
    async def test_only_me_post_hidden_from_other_users(self):
        self.assertFalse(await server.can_view_post({'author_id':'a','audience':'only_me'},self.me,'b',{'a'}))
        self.assertTrue(await server.can_view_post({'author_id':'a','audience':'only_me'},self.me,'a',set()))
    async def test_suspended_authors_posts_hidden(self):
        self.assertFalse(await server.can_view_post({'author_id':'a'},{**self.me,'suspended':True},'b',set()))
    async def test_messaging_does_not_require_friendship(self):
        await server.require_message_access(self.me,{'id':'b'})
    async def test_message_privacy_and_blocks_enforced(self):
        for other in [{'id':'b','settings':{'messages':'only_me'}},{'id':'b','blocked':['a']},{'id':'b','suspended':True}]:
            with self.assertRaises(HTTPException):await server.require_message_access(self.me,other)
    async def test_notification_off_drops_notification(self):
        self.db.users.find_one.return_value={'id':'b','settings':{'notifications':{'comment':'off'}}}
        await server.notify('b','a','comment','p','Comment')
        self.db.notifications.insert_one.assert_not_awaited()
    async def test_bad_setting_rejected_before_write(self):
        for values in [{'comments':'invalid'},{'read_receipts':'false'},{'notifications':{'comment':'bad'}}]:
            with self.assertRaises(HTTPException):await server.save_settings(server.SettingsBody(values=values),self.me)
        self.db.users.update_one.assert_not_awaited()
    async def test_two_step_login_cannot_skip_code(self):
        self.db.users.find_one.return_value={**self.me,'two_factor_secret':base64.b32encode(b'01234567890123456789').decode()}
        self.db.users.update_one.return_value=SimpleNamespace(matched_count=0)
        with self.assertRaises(HTTPException):await server.login(server.LoginBody(contact='test',password='password-123'))
        self.db.sessions.insert_one.assert_not_awaited()
    def test_authenticator_code_is_time_bound(self):
        key=b'01234567890123456789';secret=base64.b32encode(key).decode();counter=int(time.time()//30);digest=hmac.new(key,struct.pack('>Q',counter),hashlib.sha1).digest();offset=digest[-1]&15;code=f'{(struct.unpack(">I",digest[offset:offset+4])[0]&0x7fffffff)%1000000:06d}'
        self.assertEqual(server.totp_counter(secret,code),counter)
        self.assertIsNone(server.totp_counter(secret,'not-a-code'))
    async def test_recovery_code_consumed_atomically(self):
        self.db.users.update_one.return_value=SimpleNamespace(matched_count=1)
        user={**self.me,'two_factor_secret':base64.b32encode(b'01234567890123456789').decode()}
        self.assertTrue(await server.check_second_factor(user,'abc-recovery'))
        self.assertEqual(self.db.users.update_one.call_args.args[1],{'$pull':{'recovery_codes':hashlib.sha256(b'abc-recovery').hexdigest()}})
    async def test_signup_verification_cannot_bypass_two_step_login(self):
        self.db.users.find_one.return_value={**self.me,'otp':'123456','otp_purpose':'reset','two_factor_secret':'ABC'}
        with self.assertRaises(HTTPException):await server.verify_otp(server.VerifyOtp(user_id='a',code='123456'))
        self.db.sessions.insert_one.assert_not_awaited()
    async def test_suspended_profile_is_not_found(self):
        self.db.users.find_one.return_value={**self.me,'suspended':True}
        with self.assertRaises(HTTPException) as e:await server.get_user('test',{'id':'b'})
        self.assertEqual(e.exception.status_code,404)
    async def test_private_follower_list_rejected(self):
        self.db.users.find_one.return_value={**self.me,'settings':{'followers_visibility':'only_me'}}
        with self.assertRaises(HTTPException) as e:await server.user_followers('a',{'id':'b'})
        self.assertEqual(e.exception.status_code,403)
    async def test_private_post_cannot_be_saved_or_commented(self):
        self.db.posts=AsyncMock();self.db.posts.find_one.return_value={'id':'post','author_id':'a','audience':'only_me'}
        self.db.users.find_one.return_value=self.me
        with patch.object(server,'are_friends',return_value=False):
            with self.assertRaises(HTTPException):await server.save_post('post',{'id':'b'})
            with self.assertRaises(HTTPException):await server.get_comments('post',{'id':'b'})
    async def test_appeal_reaches_shared_admin_queue(self):
        self.db.appeals=AsyncMock();self.db.appeals.find_one.return_value=None
        result=await server.submit_appeal(server.AppealCreateBody(reason='Please review my account suspension.'),self.me)
        self.assertTrue(result['ok'])
        record=self.db.appeals.insert_one.call_args.args[0]
        self.assertEqual(record['user_id'],'a');self.assertEqual(record['status'],'open')
    async def test_invalid_profile_birthday_rejected(self):
        with self.assertRaises(HTTPException):await server.save_details(server.DetailsBody(details={'birthday':{'value':'2026-99-99','visibility':'only_me'}}),self.me)
        self.db.users.update_one.assert_not_awaited()
    async def test_archived_post_hidden_even_from_normal_profile_feed(self):
        self.assertFalse(await server.can_view_post({'author_id':'a','archived':True},self.me,'a',set()))
    async def test_people_preferences_accept_only_own_supported_list(self):
        with self.assertRaises(HTTPException):await server.privacy_people('another_users_contacts',self.me)
    async def test_people_preferences_show_names_without_reviving_hidden_accounts(self):
        from unittest.mock import Mock
        class Cursor:
            def __aiter__(self):
                async def iterate():
                    yield {'id':'b','full_name':'Friend','username':'friend'}
                return iterate()
        self.db.users.find=Mock(return_value=Cursor())
        result=await server.privacy_people('muted_users',{**self.me,'settings':{'muted_users':['b','removed']}})
        self.assertEqual(result,[{'id':'b','name':'Friend','username':'friend'},{'id':'removed','name':None,'username':None}])
        query=self.db.users.find.call_args.args[0]
        self.assertEqual(query['id'],{'$in':['b','removed']});self.assertEqual(query['suspended'],{'$ne':True})
