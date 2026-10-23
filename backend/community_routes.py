"""Social communities with feeds, separate from Messenger conversations.
Unbounded members, posts, reactions and comments live in referenced collections.
"""
from typing import Literal
from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, Field

class CommunityCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default='', max_length=2000)
    photo: str | None = Field(default=None, max_length=2048)
    privacy: Literal['public', 'private'] = 'public'

class CommunityPost(BaseModel):
    text: str = Field(default='', max_length=5000)
    photo: str | None = Field(default=None, max_length=2048)

class CommunityComment(BaseModel):
    text: str = Field(min_length=1, max_length=2000)

class CommunityMember(BaseModel):
    user_id: str = Field(min_length=1, max_length=100)

class ReactionBody(BaseModel):
    liked: bool


def install_communities(api, get_db, auth, now, public_user, notify):
    async def group(gid):
        g = await get_db().communities.find_one({'id': gid, 'deleted_at': None}, {'_id': 0})
        if not g: raise HTTPException(404, 'Community not found')
        return g

    async def membership(gid, uid):
        return await get_db().community_members.find_one({'community_id': gid, 'user_id': uid})

    async def access(gid, me, write=False, admin=False):
        g = await group(gid)
        m = await membership(gid, me['id'])
        active = bool(m and m.get('status') == 'active')
        owner = g['owner_id'] == me['id']
        if admin and not owner: raise HTTPException(403, 'Community owner only')
        if (write or g['privacy'] == 'private') and not (active or owner):
            raise HTTPException(403, 'Join this community before accessing its posts')
        return g, m

    async def photo_owned(url, me):
        if not url: return
        # Use the app's existing upload ownership records, never arbitrary URLs.
        from urllib.parse import urlparse, unquote
        parsed = urlparse(url)
        if parsed.netloc and parsed.hostname != "glint-api-xf2i.onrender.com":
            raise HTTPException(400, "Use a photo uploaded to Glint")
        path = unquote(parsed.path)
        if '/api/files/' not in path: raise HTTPException(400, 'Upload a community photo in Glint')
        path = path.split('/api/files/', 1)[1]
        record = await get_db().files.find_one({'path': path, 'owner_id': me['id']})
        if not record:
            raise HTTPException(403, 'Photo does not belong to this account')
        if not (record.get('content_type') or '').startswith('image/'):
            raise HTTPException(400, 'Choose an image for the group photo')
        return '/api/files/' + path

    async def summary(g, me):
        m = await membership(g['id'], me['id'])
        return {**g, 'membership': (m or {}).get('status'), 'is_owner': g['owner_id'] == me['id'],
                'member_count': await get_db().community_members.count_documents({'community_id': g['id'], 'status': 'active'})}

    @api.get('/communities')
    async def list_communities(before: str | None = None, me=Depends(auth)):
        q = {'deleted_at': None}
        if before: q['id'] = {'$lt': before}
        rows = await get_db().communities.find(q, {'_id': 0}).sort('id', -1).limit(30).to_list(30)
        return {'items': [await summary(g, me) for g in rows], 'next': rows[-1]['id'] if len(rows) == 30 else None}

    @api.post('/communities')
    async def create_community(body: CommunityCreate, me=Depends(auth)):
        if not body.name.strip(): raise HTTPException(400, 'Community name required')
        photo = await photo_owned(body.photo, me)
        from bson import ObjectId
        gid = str(ObjectId())
        doc = {'id': gid, 'name': body.name.strip(), 'description': body.description.strip(), 'photo': photo,
               'privacy': body.privacy, 'owner_id': me['id'], 'created_at': now(), 'deleted_at': None}
        await get_db().communities.insert_one(doc)
        await get_db().community_members.update_one({'community_id': gid, 'user_id': me['id']}, {'$set': {'status': 'active', 'joined_at': now()}}, upsert=True)
        return {'id': gid}

    @api.get('/communities/{gid}')
    async def get_community(gid: str, me=Depends(auth)):
        return await summary(await group(gid), me)

    @api.post('/communities/{gid}/join')
    async def join_community(gid: str, me=Depends(auth)):
        g = await group(gid)
        m = await membership(gid, me['id'])
        if m and m.get('status') == 'removed': raise HTTPException(403, 'Ask the community owner to add you again')
        if m and m.get('status') == 'active': return {'status': 'active'}
        status = 'active' if g['privacy'] == 'public' else 'pending'
        await get_db().community_members.update_one({'community_id': gid, 'user_id': me['id']}, {'$set': {'status': status, 'joined_at': now()}}, upsert=True)
        if status == 'pending': await notify(g['owner_id'], me['id'], 'community_request', gid, f"{me.get('full_name', 'Someone')} asked to join {g['name']}")
        return {'status': status}

    @api.post('/communities/{gid}/leave')
    async def leave_community(gid: str, me=Depends(auth)):
        g = await group(gid)
        if g['owner_id'] == me['id']: raise HTTPException(400, 'The community owner cannot leave their community')
        await get_db().community_members.delete_one({'community_id': gid, 'user_id': me['id']})
        return {'ok': True}

    @api.get('/communities/{gid}/members')
    async def members(gid: str, status: Literal['active', 'pending'] = 'active', before: str | None = None, me=Depends(auth)):
        await access(gid, me, admin=status == 'pending')
        q = {'community_id': gid, 'status': status}
        if before: q['user_id'] = {'$gt': before}
        rows = await get_db().community_members.find(q, {'_id': 0}).sort('user_id', 1).limit(50).to_list(50)
        people = []
        for row in rows:
            u = await get_db().users.find_one({'id': row['user_id'], 'deleted_at': None})
            if u: people.append(public_user(u))
        return {'items': people, 'next': rows[-1]['user_id'] if len(rows) == 50 else None}

    @api.post('/communities/{gid}/members')
    async def add_member(gid: str, body: CommunityMember, me=Depends(auth)):
        g, _ = await access(gid, me, admin=True)
        target = await get_db().users.find_one({'id': body.user_id, 'deleted_at': None, 'suspended': {'$ne': True}, 'deactivated': {'$ne': True}})
        if not target: raise HTTPException(404, 'Account not found')
        if me['id'] in target.get('blocked', []) or body.user_id in me.get('blocked', []): raise HTTPException(403, 'Cannot add this account')
        previous = await membership(gid, body.user_id)
        friend = await get_db().friendships.find_one({'users': {'$all': [me['id'], body.user_id]}})
        if not friend and (previous or {}).get('status') != 'pending': raise HTTPException(403, 'Add a friend or approve a join request')
        await get_db().community_members.update_one({'community_id': gid, 'user_id': body.user_id}, {'$set': {'status': 'active', 'joined_at': now()}}, upsert=True)
        await notify(body.user_id, me['id'], 'community_member', gid, f"You were added to {g['name']}")
        return {'ok': True}

    @api.delete('/communities/{gid}/members/{uid}')
    async def remove_member(gid: str, uid: str, me=Depends(auth)):
        g, _ = await access(gid, me, admin=True)
        if uid == g['owner_id']: raise HTTPException(400, 'Cannot remove the community owner')
        await get_db().community_members.update_one({'community_id': gid, 'user_id': uid}, {'$set': {'status': 'removed'}}, upsert=True)
        return {'ok': True}

    async def post(gid, pid, me, write=False):
        g, m = await access(gid, me, write=write)
        p = await get_db().community_posts.find_one({'id': pid, 'community_id': gid, 'deleted_at': None}, {'_id': 0})
        if not p: raise HTTPException(404, 'Post no longer available')
        return g, p

    async def post_summary(p, me):
        db = get_db()
        author = await db.users.find_one({'id': p['author_id'], 'deleted_at': None})
        return {**p, 'author': public_user(author), 'likes': await db.community_reactions.count_documents({'post_id': p['id']}),
                'liked': bool(await db.community_reactions.find_one({'post_id': p['id'], 'user_id': me['id']})),
                'comment_count': await db.community_comments.count_documents({'post_id': p['id'], 'deleted_at': None})}

    @api.get('/communities/{gid}/posts')
    async def posts(gid: str, before: str | None = None, me=Depends(auth)):
        await access(gid, me)
        q = {'community_id': gid, 'deleted_at': None}
        if before: q['id'] = {'$lt': before}
        rows = await get_db().community_posts.find(q, {'_id': 0}).sort('id', -1).limit(20).to_list(20)
        return {'items': [await post_summary(p, me) for p in rows], 'next': rows[-1]['id'] if len(rows) == 20 else None}

    @api.post('/communities/{gid}/posts')
    async def create_post(gid: str, body: CommunityPost, me=Depends(auth)):
        await access(gid, me, write=True)
        if not body.text.strip() and not body.photo: raise HTTPException(400, 'Write something or add a photo')
        photo = await photo_owned(body.photo, me)
        from bson import ObjectId
        pid = str(ObjectId())  # sortable, stable pagination without unbounded arrays
        await get_db().community_posts.insert_one({'id': pid, 'community_id': gid, 'author_id': me['id'], 'text': body.text.strip(), 'photo': photo, 'created_at': now(), 'deleted_at': None})
        return {'id': pid}

    @api.delete('/communities/{gid}/posts/{pid}')
    async def delete_post(gid: str, pid: str, me=Depends(auth)):
        g, p = await post(gid, pid, me, write=True)
        if p['author_id'] != me['id'] and g['owner_id'] != me['id']: raise HTTPException(403, 'Only the author or owner can remove this post')
        await get_db().community_posts.update_one({'id': pid}, {'$set': {'deleted_at': now()}})
        return {'ok': True}

    @api.put('/communities/{gid}/posts/{pid}/like')
    async def like(gid: str, pid: str, body: ReactionBody, me=Depends(auth)):
        _, p = await post(gid, pid, me, write=True)
        key = {'post_id': pid, 'user_id': me['id']}
        if body.liked:
            await get_db().community_reactions.update_one(key, {'$setOnInsert': {'created_at': now()}}, upsert=True)
        else: await get_db().community_reactions.delete_one(key)
        return {'ok': True}

    @api.get('/communities/{gid}/posts/{pid}/comments')
    async def comments(gid: str, pid: str, before: str | None = None, me=Depends(auth)):
        await post(gid, pid, me)
        q = {'post_id': pid, 'deleted_at': None}
        if before: q['id'] = {'$lt': before}
        rows = await get_db().community_comments.find(q, {'_id': 0}).sort('id', -1).limit(30).to_list(30)
        for c in rows:
            c['author'] = public_user(await get_db().users.find_one({'id': c['author_id'], 'deleted_at': None}))
        return {'items': rows, 'next': rows[-1]['id'] if len(rows) == 30 else None}

    @api.post('/communities/{gid}/posts/{pid}/comments')
    async def comment(gid: str, pid: str, body: CommunityComment, me=Depends(auth)):
        _, p = await post(gid, pid, me, write=True)
        if not body.text.strip(): raise HTTPException(400, 'Comment cannot be empty')
        from bson import ObjectId
        cid = str(ObjectId())
        await get_db().community_comments.insert_one({'id': cid, 'post_id': pid, 'author_id': me['id'], 'text': body.text.strip(), 'created_at': now(), 'deleted_at': None})
        return {'id': cid}

    @api.delete('/communities/{gid}/posts/{pid}/comments/{cid}')
    async def delete_comment(gid: str, pid: str, cid: str, me=Depends(auth)):
        g, _ = await post(gid, pid, me, write=True)
        c = await get_db().community_comments.find_one({'id': cid, 'post_id': pid, 'deleted_at': None})
        if not c: raise HTTPException(404, 'Comment not found')
        if c['author_id'] != me['id'] and g['owner_id'] != me['id']: raise HTTPException(403, 'Only the author or owner can remove this comment')
        await get_db().community_comments.update_one({'id': cid}, {'$set': {'deleted_at': now()}})
        return {'ok': True}
