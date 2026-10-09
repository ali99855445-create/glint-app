"""Participant-scoped message actions and independent messaging blocks."""
from fastapi import HTTPException, Depends
from pydantic import BaseModel

class DeleteMessageBody(BaseModel):
    scope: str = 'me'
class ForwardMessageBody(BaseModel):
    to_user: str | None = None
    conversation_id: str | None = None
class ChatBlockBody(BaseModel):
    blocked: bool

def install_chat_actions(api, get_db, auth, now_iso, send_message, message_body):
    async def accessible(message_id, me):
        db=get_db()
        m=await db.messages.find_one({'id':message_id})
        if not m or m.get('deleted_at') or me['id'] in m.get('hidden_by',[]):
            raise HTTPException(404,'Message not found')
        c=await db.conversations.find_one({'id':m['conversation_id'],'deleted_at':None})
        if not c or me['id'] not in c.get('participants',[]) or c.get('disabled'):
            raise HTTPException(403,'Conversation unavailable')
        return m,c

    @api.post('/chat/messages/{message_id}/delete')
    async def delete_message(message_id:str, body:DeleteMessageBody, me=Depends(auth)):
        m,c=await accessible(message_id,me);db=get_db()
        if body.scope not in {'me','everyone'}:raise HTTPException(400,'Choose me or everyone')
        if body.scope=='everyone':
            if m['from_user']!=me['id']:raise HTTPException(403,'Only the sender can remove a message for everyone')
            await db.messages.update_one({'id':message_id},{'$set':{'removed_for_everyone':True,'removed_at':now_iso()}})
            if c.get('last_message_id')==message_id:
                await db.conversations.update_one({'id':c['id']},{'$set':{'last_message':'Message removed','last_type':'removed'}})
            await db.notifications.update_many({'message_id':message_id},{'$set':{'text':'Message removed'}})
        else:
            await db.messages.update_one({'id':message_id},{'$addToSet':{'hidden_by':me['id']}})
        return {'ok':True,'scope':body.scope}

    @api.post('/chat/messages/{message_id}/forward')
    async def forward_message(message_id:str, body:ForwardMessageBody, me=Depends(auth)):
        m,_=await accessible(message_id,me)
        if m.get('removed_for_everyone'):raise HTTPException(400,'Removed messages cannot be forwarded')
        result=await send_message(message_body(to_user=body.to_user,conversation_id=body.conversation_id,type=m.get('type','text'),text=m.get('text'),media=m.get('media'),duration=m.get('duration')),me)
        await get_db().messages.update_one({'id':result['id']},{'$set':{'forwarded':True}})
        return {**result,'forwarded':True}

    @api.post('/chat/with/{user_id}/block')
    async def block_chat(user_id:str, body:ChatBlockBody, me=Depends(auth)):
        other=await get_db().users.find_one({'id':user_id,'deleted_at':None})
        if user_id==me['id'] or not other:raise HTTPException(404,'Account not found')
        await get_db().users.update_one({'id':me['id']},{('$addToSet' if body.blocked else '$pull'):{'chat_blocked':user_id}})
        return {'blocked':body.blocked}

    @api.post('/chat/{conversation_id}/clear')
    async def clear_chat(conversation_id:str, me=Depends(auth)):
        c=await get_db().conversations.find_one({'id':conversation_id,'deleted_at':None})
        if not c or me['id'] not in c.get('participants',[]):raise HTTPException(403,'Conversation unavailable')
        await get_db().messages.update_many({'conversation_id':conversation_id},{'$addToSet':{'hidden_by':me['id']}})
        return {'ok':True}
    return {'accessible':accessible,'delete':delete_message,'forward':forward_message,'block':block_chat,'clear':clear_chat}

def message_for_viewer(m, me):
    """Never return removed content or private reply content to a client."""
    if me['id'] in m.get('hidden_by',[]):return None
    if m.get('removed_for_everyone'):
        return {**m,'text':'Message removed','type':'removed','media':None,'duration':None,'reply_to':None}
    return m
