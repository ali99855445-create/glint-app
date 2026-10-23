import sys,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock,patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi import APIRouter,HTTPException
from pydantic import ValidationError
from messenger_settings import install_messenger_settings,MessengerPreferences
import server

class MessengerSettingsTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.db=SimpleNamespace(users=AsyncMock())
        self.routes=install_messenger_settings(APIRouter(),lambda:self.db,lambda:None,lambda u:{'id':u['id']})
    async def test_preferences_defaults_and_existing_values(self):
        self.assertEqual(await self.routes['preferences']({'id':'a'}),{'active_status':True,'read_receipts':True,'notifications':True,'messages':'public'})
        values=await self.routes['preferences']({'id':'a','settings':{'active_status':False,'notifications':{'message':'off'},'messages':'friends'}})
        self.assertFalse(values['active_status']);self.assertFalse(values['notifications']);self.assertEqual(values['messages'],'friends')
    async def test_settings_patch_only_updates_messenger_keys_for_current_account(self):
        await self.routes['save'](MessengerPreferences(read_receipts=False,notifications=False,messages='friends'),{'id':'mine'})
        self.assertEqual(self.db.users.update_one.call_args.args,({'id':'mine'},{'$set':{'settings.read_receipts':False,'settings.notifications.message':'off','settings.messages':'friends'}}))
    def test_invalid_preferences_and_other_profile_fields_rejected(self):
        for values in [{'messages':'invalid'},{'active_status':'false'},{'blocked':['a']},{'read_receipts':1}]:
            with self.assertRaises(ValidationError):MessengerPreferences(**values)
    async def test_blocked_list_only_returns_messenger_blocks(self):
        self.db.users.find_one.return_value={'id':'chat-only'}
        rows=await self.routes['blocked']({'id':'mine','chat_blocked':['chat-only'],'blocked':['profile-only']})
        self.assertEqual(rows,[{'id':'chat-only'}])
        self.db.users.find_one.assert_awaited_once_with({'id':'chat-only','deleted_at':None})
    async def test_glint_profile_block_stops_messages_both_directions(self):
        for sender,recipient in [({'id':'a','blocked':['b']},{'id':'b'}),({'id':'a'},{'id':'b','blocked':['a']})]:
            with self.assertRaises(HTTPException):await server.require_message_access(sender,recipient)
    async def test_unblocking_messenger_does_not_bypass_remaining_profile_block(self):
        with self.assertRaises(HTTPException):await server.require_message_access({'id':'a','chat_blocked':[]},{'id':'b','blocked':['a']})
