"""Messenger preferences reuse existing messaging policy; profile blocks stay independent."""
from typing import Literal
from fastapi import Depends
from pydantic import BaseModel, ConfigDict, StrictBool

class MessengerPreferences(BaseModel):
    model_config = ConfigDict(extra='forbid')
    active_status: StrictBool | None = None
    read_receipts: StrictBool | None = None
    notifications: StrictBool | None = None
    messages: Literal['public','friends','inner','only_me'] | None = None


def install_messenger_settings(api, get_db, auth, public_user):
    @api.get('/chat/preferences')
    async def preferences(me=Depends(auth)):
        settings=me.get('settings',{})
        return {'active_status':settings.get('active_status',True),
                'read_receipts':settings.get('read_receipts',True),
                'notifications':settings.get('notifications',{}).get('message','everyone')!='off',
                'messages':settings.get('messages','public')}

    @api.put('/chat/preferences')
    async def save_preferences(body:MessengerPreferences,me=Depends(auth)):
        updates={}
        for key,value in body.model_dump(exclude_none=True).items():
            if key=='notifications':updates['settings.notifications.message']='everyone' if value else 'off'
            else:updates['settings.'+key]=value
        if updates:await get_db().users.update_one({'id':me['id']},{'$set':updates})
        return {'ok':True}

    @api.get('/chat/blocked')
    async def blocked(me=Depends(auth)):
        out=[]
        for uid in me.get('chat_blocked',[])[:500]:
            user=await get_db().users.find_one({'id':uid,'deleted_at':None})
            if user:out.append(public_user(user))
        return out

    return {'preferences':preferences,'save':save_preferences,'blocked':blocked}
