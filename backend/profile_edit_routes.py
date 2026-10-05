"""Profile edit API enforcing Glint identity rules.
Normal accounts may change their name once per 30 days. Verified accounts send
name/avatar changes to admin review. Cover photos are never part of that rule.
"""
from datetime import datetime, timezone
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from blue_tick import blue_tick_active
from profile_change_policy import NAME_CHANGE_COOLDOWN_DAYS

class ProfileEditBody(BaseModel):
    full_name: Optional[str] = None
    avatar: Optional[str] = None
    cover: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    date_of_birth: Optional[str] = None
    name_evidence_url: Optional[str] = None
    avatar_evidence_url: Optional[str] = None

def install_profile_edit_routes(api, db, get_current_user, now_iso):
    @api.post("/profile/edit-v2")
    async def edit_profile(body: ProfileEditBody, me=Depends(get_current_user)):
        user=await db.users.find_one({"id":me["id"]})
        if not user: raise HTTPException(404,"User not found")
        requested_name=body.full_name.strip() if body.full_name is not None else None
        name_changed=requested_name is not None and requested_name!=(user.get("full_name") or "")
        avatar_changed=body.avatar is not None and body.avatar!=user.get("avatar")
        verified=blue_tick_active(user) or bool(user.get("verified"))
        if verified and (name_changed or avatar_changed):
            if name_changed and not body.name_evidence_url: raise HTTPException(400,"Supporting document is required for a verified name change")
            if avatar_changed and not body.avatar_evidence_url: raise HTTPException(400,"Supporting document is required for a verified profile photo change")
            pending={"user_id":me["id"],"requested_name":requested_name if name_changed else None,"requested_avatar":body.avatar if avatar_changed else None,"name_evidence_url":body.name_evidence_url if name_changed else None,"avatar_evidence_url":body.avatar_evidence_url if avatar_changed else None,"status":"pending","created_at":now_iso()}
            existing=await db.profile_change_reviews.find_one({"user_id":me["id"],"status":"pending"})
            if existing: await db.profile_change_reviews.update_one({"_id":existing["_id"]},{"$set":pending})
            else: await db.profile_change_reviews.insert_one(pending)
            safe={}
            for key in ("cover","bio","location","date_of_birth"):
                value=getattr(body,key)
                if value is not None: safe[key]=value
            if safe:
                safe["updated_at"]=now_iso(); await db.users.update_one({"id":me["id"]},{"$set":safe})
            return {"ok":True,"identity_review_required":True,"status":"pending"}
        if name_changed:
            last=user.get("name_changed_at")
            if last:
                try:
                    previous=datetime.fromisoformat(str(last).replace("Z","+00:00"))
                    if previous.tzinfo is None: previous=previous.replace(tzinfo=timezone.utc)
                    elapsed=(datetime.now(timezone.utc)-previous).days
                    if elapsed<NAME_CHANGE_COOLDOWN_DAYS: raise HTTPException(409,f"You can change your name again in {NAME_CHANGE_COOLDOWN_DAYS-elapsed} days")
                except HTTPException: raise
                except Exception: pass
        updates={}
        for key in ("full_name","avatar","cover","bio","location","date_of_birth"):
            value=getattr(body,key)
            if value is not None: updates[key]=value.strip() if isinstance(value,str) and key=="full_name" else value
        if name_changed: updates["name_changed_at"]=now_iso()
        if updates:
            updates["updated_at"]=now_iso(); await db.users.update_one({"id":me["id"]},{"$set":updates})
        return {"ok":True,"identity_review_required":False}
