import sys, unittest, asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from notification_targets import notification_route
from realtime import EventHub
import server
from fastapi import HTTPException

class TargetTests(unittest.TestCase):
    def test_activity_targets(self):
        for kind in ['reaction','comment','spark']:self.assertEqual(notification_route({'type':kind,'ref_id':'p'}),'/post/p')
        self.assertEqual(notification_route({'type':'message','ref_id':'g'},group=True),'/chat/group/g')
        self.assertEqual(notification_route({'type':'follow'},{'username':'moon'}),'/user/moon')
    def test_admin_removed_content_is_actionable_not_broken_post(self):
        self.assertEqual(notification_route({'type':'admin','ref_id':'removed','text':'Post removed'}),'/help')
        self.assertEqual(notification_route({'type':'admin','text':'Your verification badge changed'}),'/verification')

class NotificationTests(unittest.IsolatedAsyncioTestCase):
    async def test_read_is_scoped_to_recipient(self):
        db=SimpleNamespace(notifications=AsyncMock())
        db.notifications.update_one.return_value=SimpleNamespace(matched_count=1)
        with patch.object(server,'db',db):await server.read_notification('n',{'id':'mine'})
        self.assertEqual(db.notifications.update_one.call_args.args[0],{'id':'n','to_user':'mine'})
        db.notifications.update_one.return_value=SimpleNamespace(matched_count=0)
        with patch.object(server,'db',db):
            with self.assertRaises(HTTPException):await server.read_notification('other',{'id':'mine'})
    async def test_hub_does_not_broadcast_to_other_accounts(self):
        hub=EventHub();mine=asyncio.Queue(maxsize=1);other=asyncio.Queue(maxsize=1)
        hub.clients['mine'].add(mine);hub.clients['other'].add(other)
        await hub.publish('mine','message');await hub.publish('mine','message')
        self.assertEqual(mine.qsize(),1);self.assertEqual(other.qsize(),0)
        self.assertEqual(await mine.get(),{'kind':'message'})

class SocketTests(unittest.TestCase):
    def test_unauthenticated_socket_is_rejected_and_not_registered(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from starlette.websockets import WebSocketDisconnect
        app=FastAPI();hub=EventHub()
        async def auth(token):raise HTTPException(401,'Invalid token')
        hub.install(app,auth)
        with TestClient(app) as client:
            with client.websocket_connect('/api/live') as ws:
                ws.send_json({'token':'invalid'})
                with self.assertRaises(WebSocketDisconnect):ws.receive_json()
        self.assertEqual(dict(hub.clients),{})
    def test_authenticated_socket_ready_and_disconnect_cleanup(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        app=FastAPI();hub=EventHub()
        async def auth(token):
            self.assertEqual(token,'Bearer valid')
            return {'id':'mine'}
        hub.install(app,auth)
        with TestClient(app) as client:
            with client.websocket_connect('/api/live') as ws:
                ws.send_json({'token':'valid'})
                self.assertEqual(ws.receive_json(),{'kind':'ready'})
                self.assertEqual(len(hub.clients['mine']),1)
        self.assertEqual(dict(hub.clients),{})
