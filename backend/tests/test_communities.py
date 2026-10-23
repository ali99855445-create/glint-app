import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import unittest
from unittest.mock import AsyncMock
from fastapi import FastAPI, APIRouter
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient
from community_routes import install_communities

class CommunityTests(unittest.TestCase):
    def setUp(self):
        self.db=AsyncMongoMockClient().db
        self.actor={'id':'owner','full_name':'Owner'}
        async def auth(): return self.actor
        app=FastAPI(); router=APIRouter()
        self.notify=AsyncMock()
        install_communities(router,lambda:self.db,auth,lambda:'2026-10-23T00:00:00+00:00',lambda u:({'id':u['id'],'full_name':u.get('full_name')} if u else None),self.notify)
        app.include_router(router);self.client=TestClient(app)
    def create(self,privacy='public'):
        r=self.client.post('/communities',json={'name':'Test community','privacy':privacy});self.assertEqual(r.status_code,200);return r.json()['id']
    def test_private_posts_and_members_require_membership(self):
        gid=self.create('private');self.actor={'id':'stranger'}
        self.assertEqual(self.client.get(f'/communities/{gid}/posts').status_code,403)
        self.assertEqual(self.client.get(f'/communities/{gid}/members').status_code,403)
        self.assertEqual(self.client.post(f'/communities/{gid}/join').json()['status'],'pending')
        self.assertEqual(self.client.post(f'/communities/{gid}/posts',json={'text':'intrusion'}).status_code,403)
    def test_public_read_but_only_members_can_post(self):
        gid=self.create();self.actor={'id':'reader'}
        self.assertEqual(self.client.get(f'/communities/{gid}/posts').status_code,200)
        self.assertEqual(self.client.post(f'/communities/{gid}/posts',json={'text':'no'}).status_code,403)
        self.client.post(f'/communities/{gid}/join')
        self.assertEqual(self.client.post(f'/communities/{gid}/posts',json={'text':'member post'}).status_code,200)
    def test_other_member_cannot_remove_author_post_or_manage_members(self):
        gid=self.create();pid=self.client.post(f'/communities/{gid}/posts',json={'text':'owner post'}).json()['id']
        self.actor={'id':'member'};self.client.post(f'/communities/{gid}/join')
        self.assertEqual(self.client.delete(f'/communities/{gid}/posts/{pid}').status_code,403)
        self.assertEqual(self.client.post(f'/communities/{gid}/members',json={'user_id':'someone'}).status_code,403)
        self.assertEqual(self.client.get(f'/communities/{gid}/members?status=pending').status_code,403)
    def test_repeated_like_is_idempotent_and_unlike_works(self):
        gid=self.create();pid=self.client.post(f'/communities/{gid}/posts',json={'text':'hello'}).json()['id']
        for _ in range(2):self.assertEqual(self.client.put(f'/communities/{gid}/posts/{pid}/like',json={'liked':True}).status_code,200)
        self.assertEqual(self.client.get(f'/communities/{gid}/posts').json()['items'][0]['likes'],1)
        self.client.put(f'/communities/{gid}/posts/{pid}/like',json={'liked':False})
        self.assertEqual(self.client.get(f'/communities/{gid}/posts').json()['items'][0]['likes'],0)
    def test_comments_and_deleted_posts_do_not_cross_communities(self):
        gid=self.create();other=self.create();pid=self.client.post(f'/communities/{gid}/posts',json={'text':'hello'}).json()['id']
        self.assertEqual(self.client.post(f'/communities/{other}/posts/{pid}/comments',json={'text':'cross'}).status_code,404)
        cid=self.client.post(f'/communities/{gid}/posts/{pid}/comments',json={'text':'comment'}).json()['id']
        self.assertEqual(len(self.client.get(f'/communities/{gid}/posts/{pid}/comments').json()['items']),1)
        self.client.delete(f'/communities/{gid}/posts/{pid}/comments/{cid}')
        self.assertEqual(self.client.get(f'/communities/{gid}/posts/{pid}/comments').json()['items'],[])
        self.client.delete(f'/communities/{gid}/posts/{pid}')
        self.assertEqual(self.client.put(f'/communities/{gid}/posts/{pid}/like',json={'liked':True}).status_code,404)
    def test_empty_content_external_photos_and_owner_leave_are_rejected(self):
        gid=self.create()
        self.assertEqual(self.client.post(f'/communities/{gid}/posts',json={'text':'  '}).status_code,400)
        self.assertEqual(self.client.post('/communities',json={'name':'x','photo':'https://elsewhere/photo.jpg'}).status_code,400)
        self.assertEqual(self.client.post(f'/communities/{gid}/leave').status_code,400)
    def test_private_request_owner_approval_and_removal(self):
        import asyncio
        gid=self.create('private')
        asyncio.run(self.db.users.insert_one({'id':'applicant','full_name':'Applicant'}))
        self.actor={'id':'applicant'}
        self.client.post(f'/communities/{gid}/join')
        self.actor={'id':'owner','full_name':'Owner'}
        self.assertEqual(self.client.post(f'/communities/{gid}/members',json={'user_id':'applicant'}).status_code,200)
        self.actor={'id':'applicant'}
        self.assertEqual(self.client.get(f'/communities/{gid}/posts').status_code,200)
        self.actor={'id':'owner'}
        self.client.delete(f'/communities/{gid}/members/applicant')
        self.actor={'id':'applicant'}
        self.assertEqual(self.client.get(f'/communities/{gid}/posts').status_code,403)
        self.assertEqual(self.client.post(f'/communities/{gid}/join').status_code,403)
    def test_owner_cannot_silently_add_stranger_or_blocked_friend(self):
        import asyncio
        gid=self.create()
        asyncio.run(self.db.users.insert_one({'id':'stranger','blocked':['owner']}))
        self.assertEqual(self.client.post(f'/communities/{gid}/members',json={'user_id':'stranger'}).status_code,403)
        asyncio.run(self.db.users.insert_one({'id':'unknown'}))
        self.assertEqual(self.client.post(f'/communities/{gid}/members',json={'user_id':'unknown'}).status_code,403)
    def test_group_photo_uses_owned_image_and_never_stores_uploader_token(self):
        import asyncio
        asyncio.run(self.db.files.insert_one({'path':'glint/uploads/owner/photo.jpg','owner_id':'owner','content_type':'image/jpeg'}))
        r=self.client.post('/communities',json={'name':'Photo group','photo':'https://glint-api-xf2i.onrender.com/api/files/glint/uploads/owner/photo.jpg?token=secret'})
        self.assertEqual(r.status_code,200)
        g=self.client.get('/communities/'+r.json()['id']).json()
        self.assertEqual(g['photo'],'/api/files/glint/uploads/owner/photo.jpg')
        self.assertNotIn('secret',str(g))
