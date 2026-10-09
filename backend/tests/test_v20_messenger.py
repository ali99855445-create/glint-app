import sys
from pathlib import Path
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi import APIRouter, HTTPException
from chat_actions import install_chat_actions, DeleteMessageBody, ForwardMessageBody, ChatBlockBody, message_for_viewer
from blue_tick import blue_tick_active
from verification_badges import display_badge
import server

class MessengerActionsTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.me={'id':'a'}
        self.message={'id':'m','conversation_id':'a_b','from_user':'a','to_user':'b','type':'text','text':'Private message','created_at':'2026-10-09T00:00:00+00:00'}
        self.db=SimpleNamespace(messages=AsyncMock(),conversations=AsyncMock(),users=AsyncMock(),notifications=AsyncMock())
        self.db.messages.find_one.return_value=self.message
        self.db.conversations.find_one.return_value={'id':'a_b','participants':['a','b'],'last_message_id':'m'}
        self.send=AsyncMock(return_value={'id':'new'})
        self.routes=install_chat_actions(APIRouter(),lambda:self.db,lambda:None,lambda:'now',self.send,server.MessageCreate)
    async def test_nonparticipant_cannot_delete_even_their_claimed_message(self):
        with self.assertRaises(HTTPException):await self.routes['delete']('m',DeleteMessageBody(scope='everyone'),{'id':'outsider'})
        self.db.messages.update_one.assert_not_awaited()
    async def test_recipient_cannot_remove_sender_message_for_everyone(self):
        with self.assertRaises(HTTPException):await self.routes['delete']('m',DeleteMessageBody(scope='everyone'),{'id':'b'})
        self.db.messages.update_one.assert_not_awaited()
    async def test_personal_delete_only_hides_own_copy(self):
        await self.routes['delete']('m',DeleteMessageBody(scope='me'),{'id':'b'})
        self.assertEqual(self.db.messages.update_one.call_args.args[1],{'$addToSet':{'hidden_by':'b'}})
    async def test_sender_removal_redacts_content_and_notification_preview(self):
        await self.routes['delete']('m',DeleteMessageBody(scope='everyone'),self.me)
        self.db.notifications.update_many.assert_awaited_once()
        visible=message_for_viewer({**self.message,'removed_for_everyone':True,'media':'secret-url'},self.me)
        self.assertEqual(visible['text'],'Message removed');self.assertIsNone(visible['media'])
    async def test_hidden_copy_cannot_be_forwarded(self):
        self.db.messages.find_one.return_value={**self.message,'hidden_by':['a']}
        with self.assertRaises(HTTPException):await self.routes['forward']('m',ForwardMessageBody(to_user='c'),self.me)
        self.send.assert_not_awaited()
    async def test_removed_message_cannot_be_forwarded(self):
        self.db.messages.find_one.return_value={**self.message,'removed_for_everyone':True}
        with self.assertRaises(HTTPException):await self.routes['forward']('m',ForwardMessageBody(to_user='c'),self.me)
        self.send.assert_not_awaited()
    async def test_forward_uses_normal_send_authorization(self):
        self.send.side_effect=HTTPException(403,'Messaging blocked')
        with self.assertRaises(HTTPException):await self.routes['forward']('m',ForwardMessageBody(to_user='c'),self.me)
        self.send.assert_awaited_once()
    async def test_chat_block_does_not_write_profile_block(self):
        self.db.users.find_one.return_value={'id':'b'}
        await self.routes['block']('b',ChatBlockBody(blocked=True),self.me)
        self.assertEqual(self.db.users.update_one.call_args.args[1],{'$addToSet':{'chat_blocked':'b'}})
    async def test_clear_is_participant_only(self):
        with self.assertRaises(HTTPException):await self.routes['clear']('a_b',{'id':'outsider'})
        self.db.messages.update_many.assert_not_awaited()
    async def test_chat_block_prevents_send_in_either_direction(self):
        for sender,recipient in [({'id':'a','chat_blocked':['b']},{'id':'b'}),({'id':'a'},{'id':'b','chat_blocked':['a']})]:
            with self.assertRaises(HTTPException):await server.require_message_access(sender,recipient)
    def test_manual_badge_color_and_benefits_are_consistent(self):
        for badge in ['blue','golden','green','silver','business']:
            u={'manual_verification_badge':badge};self.assertTrue(blue_tick_active(u));self.assertEqual(display_badge(u,blue_tick_active),badge)
    def test_unknown_badges_never_grant_benefits(self):
        self.assertFalse(blue_tick_active({'manual_verification_badge':'fake'}))
    def test_paid_subscription_remains_blue(self):
        u={'blue_identity_approved':True,'blue_subscription_status':'active','blue_subscription_ends_at':'2099-01-01T00:00:00+00:00'}
        self.assertEqual(display_badge(u,blue_tick_active),'blue')

class GroupPermissionTests(IsolatedAsyncioTestCase):
    def setUp(self):
        from group_routes import install_group_management_routes
        self.db=SimpleNamespace(users=AsyncMock(),conversations=AsyncMock(),messages=AsyncMock())
        self.group={'id':'g','is_group':True,'created_by':'owner','participants':['owner','member','admin'],'admins':['owner','admin']}
        self.db.conversations.find_one.return_value=self.group
        self.db.users.find_one.return_value={'id':'new'}
        api=APIRouter();install_group_management_routes(api,self.db,lambda:None,lambda:'now')
        self.routes={r.endpoint.__name__:r.endpoint for r in api.routes}
    async def test_ordinary_member_cannot_add_members(self):
        from group_routes import GroupMemberBody
        with self.assertRaises(HTTPException):await self.routes['add_member']('g',GroupMemberBody(user_id='new'),{'id':'member'})
        self.db.conversations.update_one.assert_not_awaited()
    async def test_admin_cannot_remove_group_owner(self):
        from group_routes import GroupMemberBody
        with self.assertRaises(HTTPException):await self.routes['remove_group_member']('g',GroupMemberBody(user_id='owner'),{'id':'admin'})
    async def test_only_owner_can_transfer_ownership(self):
        from group_routes import GroupMemberBody
        with self.assertRaises(HTTPException):await self.routes['transfer_owner']('g',GroupMemberBody(user_id='member'),{'id':'admin'})
    async def test_owner_must_transfer_before_leaving(self):
        with self.assertRaises(HTTPException):await self.routes['leave_group']('g',{'id':'owner'})
    async def test_member_can_leave_and_loses_roles(self):
        await self.routes['leave_group']('g',{'id':'member'})
        self.assertEqual(self.db.conversations.update_one.call_args.args[1]['$pull'],{'participants':'member','admins':'member'})
    async def test_owner_can_transfer_only_to_current_member(self):
        from group_routes import GroupMemberBody
        with self.assertRaises(HTTPException):await self.routes['transfer_owner']('g',GroupMemberBody(user_id='stranger'),{'id':'owner'})
        await self.routes['transfer_owner']('g',GroupMemberBody(user_id='member'),{'id':'owner'})
        self.assertEqual(self.db.conversations.update_one.call_args.args[1]['$set']['created_by'],'member')
