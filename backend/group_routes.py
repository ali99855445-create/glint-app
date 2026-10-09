"""Group-management API routes for Glint.

Install with install_group_management_routes(api, db, get_current_user, now_iso).
Kept separate so the existing large server can adopt the routes without
duplicating authorization logic.
"""
from typing import Optional
from fastapi import Depends, HTTPException
from pydantic import BaseModel

from group_management import (
    can_delete_group,
    can_manage_member,
    is_admin,
    is_member,
    management_capabilities,
    normalize_privacy,
)


class GroupPrivacyBody(BaseModel):
    privacy: str


class GroupMemberBody(BaseModel):
    user_id: str


class GroupAdminBody(BaseModel):
    user_id: str
    admin: bool = True


def install_group_management_routes(api, db, get_current_user, now_iso):
    async def _group(group_id: str):
        group = await db.conversations.find_one({"id": group_id, "is_group": True, "deleted_at": None})
        if not group:
            raise HTTPException(404, "Group not found")
        return group

    @api.get("/chat/group/{group_id}/management")
    async def group_management(group_id: str, me=Depends(get_current_user)):
        group = await _group(group_id)
        if not is_member(group, me["id"]):
            raise HTTPException(403, "Not a group member")
        return management_capabilities(group, me["id"])

    @api.post("/chat/group/{group_id}/privacy")
    async def set_group_privacy(group_id: str, body: GroupPrivacyBody, me=Depends(get_current_user)):
        group = await _group(group_id)
        if not is_admin(group, me["id"]):
            raise HTTPException(403, "Group admin only")
        try:
            privacy = normalize_privacy(body.privacy)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        await db.conversations.update_one(
            {"id": group_id}, {"$set": {"privacy": privacy, "updated_at": now_iso()}}
        )
        return {"ok": True, "privacy": privacy}

    @api.post("/chat/group/{group_id}/members/remove")
    async def remove_group_member(group_id: str, body: GroupMemberBody, me=Depends(get_current_user)):
        group = await _group(group_id)
        if not can_manage_member(group, me["id"], body.user_id):
            raise HTTPException(403, "You cannot remove this member")
        if body.user_id == me["id"] and group.get("created_by") == me["id"]:
            raise HTTPException(400, "Group owner must delete the group or transfer ownership before leaving")
        await db.conversations.update_one(
            {"id": group_id},
            {"$pull": {"participants": body.user_id, "admins": body.user_id}, "$set": {"updated_at": now_iso()}},
        )
        return {"ok": True}

    @api.post("/chat/group/{group_id}/admins")
    async def set_group_admin(group_id: str, body: GroupAdminBody, me=Depends(get_current_user)):
        group = await _group(group_id)
        if group.get("created_by") != me["id"]:
            raise HTTPException(403, "Only the group owner can manage admins")
        if body.user_id == me["id"]:
            raise HTTPException(400, "Group owner always remains an admin")
        if not is_member(group, body.user_id):
            raise HTTPException(400, "User is not a group member")
        update = {"$addToSet": {"admins": body.user_id}} if body.admin else {"$pull": {"admins": body.user_id}}
        update["$set"] = {"updated_at": now_iso()}
        await db.conversations.update_one({"id": group_id}, update)
        return {"ok": True, "admin": body.admin}

    @api.post("/chat/group/{group_id}/members/add")
    async def add_member(group_id: str, body: GroupMemberBody, me=Depends(get_current_user)):
        group = await _group(group_id)
        if not is_admin(group, me["id"]): raise HTTPException(403, "Group admin only")
        target = await db.users.find_one({"id": body.user_id, "deleted_at": None, "suspended": {"$ne": True}, "deactivated": {"$ne": True}})
        if not target: raise HTTPException(404, "Account not found")
        if me["id"] in target.get("blocked", []) or body.user_id in me.get("blocked", []) or me["id"] in target.get("chat_blocked", []): raise HTTPException(403, "Cannot add this account")
        if len(group.get("participants", [])) >= 200: raise HTTPException(400, "Group member limit reached")
        await db.conversations.update_one({"id": group_id}, {"$addToSet": {"participants": body.user_id}, "$set": {"updated_at": now_iso()}})
        return {"ok": True}

    @api.post("/chat/group/{group_id}/leave")
    async def leave_group(group_id: str, me=Depends(get_current_user)):
        group = await _group(group_id)
        if not is_member(group, me["id"]): raise HTTPException(403, "Not a group member")
        if group.get("created_by") == me["id"]: raise HTTPException(400, "Transfer ownership before leaving")
        await db.conversations.update_one({"id": group_id}, {"$pull": {"participants": me["id"], "admins": me["id"]}, "$set": {"updated_at": now_iso()}})
        return {"ok": True}

    @api.post("/chat/group/{group_id}/owner")
    async def transfer_owner(group_id: str, body: GroupMemberBody, me=Depends(get_current_user)):
        group = await _group(group_id)
        if group.get("created_by") != me["id"]: raise HTTPException(403, "Group owner only")
        if body.user_id == me["id"] or not is_member(group, body.user_id): raise HTTPException(400, "Choose another group member")
        await db.conversations.update_one({"id": group_id, "created_by": me["id"]}, {"$set": {"created_by": body.user_id, "updated_at": now_iso()}, "$addToSet": {"admins": body.user_id}})
        return {"ok": True}

    @api.delete("/chat/group/{group_id}")
    async def delete_group(group_id: str, me=Depends(get_current_user)):
        group = await _group(group_id)
        if not can_delete_group(group, me["id"]):
            raise HTTPException(403, "Only the group owner can delete this group")
        # Soft-delete messages for audit/moderation safety, then remove the group
        # from normal user access. Admin tooling can still retain an audit trail.
        deleted_at = now_iso()
        await db.messages.update_many(
            {"conversation_id": group_id, "deleted_at": None},
            {"$set": {"deleted_at": deleted_at, "deleted_by_group_owner": me["id"]}},
        )
        await db.conversations.update_one(
            {"id": group_id},
            {"$set": {"deleted_at": deleted_at, "deleted_by": me["id"], "disabled": True, "updated_at": deleted_at}},
        )
        return {"ok": True, "deleted": True}
