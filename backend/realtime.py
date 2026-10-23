"""Authenticated, payload-free invalidations; polling remains the recovery path."""
import asyncio
from collections import defaultdict
from fastapi import WebSocket, WebSocketDisconnect

class EventHub:
    def __init__(self):
        self.clients = defaultdict(set)

    async def publish(self, user_id, kind):
        for queue in tuple(self.clients.get(user_id, ())):
            if not queue.full(): queue.put_nowait({'kind': kind})

    def install(self, app, authenticate):
        @app.websocket('/api/live')
        async def live(socket: WebSocket):
            await socket.accept()
            user_id = None
            queue = asyncio.Queue(maxsize=32)
            reader = event_task = None
            try:
                credentials = await asyncio.wait_for(socket.receive_json(), timeout=10)
                token = credentials.get('token')
                if not isinstance(token, str) or len(token) > 4096:
                    await socket.close(code=4401); return
                user = await authenticate('Bearer ' + token)
                user_id = user['id']
                if len(self.clients.get(user_id, ())) >= 5:
                    await socket.close(code=4429); return
                self.clients[user_id].add(queue)
                await socket.send_json({'kind': 'ready'})
                reader = asyncio.create_task(socket.receive_text())
                while True:
                    event_task = asyncio.create_task(queue.get())
                    done, _ = await asyncio.wait({reader, event_task}, timeout=25, return_when=asyncio.FIRST_COMPLETED)
                    if reader in done:
                        reader.result()  # Raises WebSocketDisconnect when the client leaves.
                        reader = asyncio.create_task(socket.receive_text())
                    if event_task in done:
                        await socket.send_json(event_task.result())
                    else:
                        event_task.cancel()
                    if not done:
                        await authenticate('Bearer ' + token)
                        await socket.send_json({'kind': 'ping'})
            except (WebSocketDisconnect, asyncio.TimeoutError):
                pass
            except Exception:
                try: await socket.close(code=4401)
                except Exception: pass
            finally:
                for task in (reader, event_task):
                    if task and not task.done(): task.cancel()
                if user_id and queue in self.clients.get(user_id, ()):
                    self.clients[user_id].discard(queue)
                    if not self.clients[user_id]: self.clients.pop(user_id, None)

hub = EventHub()
