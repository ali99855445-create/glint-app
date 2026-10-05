"""Glint modular upgrade backend entrypoint."""
import server as _server
from server import app, db, get_current_user, now_iso
from fastapi import Depends
from blue_tick import blue_tick_active
from group_routes import install_group_management_routes
from profile_edit_routes import install_profile_edit_routes
from blue_entitlement_routes import install_blue_entitlement_routes
from blue_links_routes import install_blue_links_routes
from blue_story_routes import install_blue_story_routes
from blue_remaining_routes import install_blue_remaining_routes

# The legacy server serialized `verified` from the retired golden_tick field.
# Keep `verified` only as a compatibility alias for older clients, but derive it
# exclusively from the canonical Blue entitlement. New clients should consume
# `blue_tick_active` directly.
def _public_user_blue(u: dict) -> dict:
    if not u:
        return None
    blue = blue_tick_active(u)
    return {
        "id": u["id"],
        "full_name": u.get("full_name"),
        "username": u.get("username"),
        "avatar": u.get("avatar"),
        "cover": u.get("cover"),
        "bio": u.get("bio"),
        "location": u.get("location"),
        "blue_tick_active": blue,
        "verified": blue,
        "privacy": u.get("privacy", "public"),
        "created_at": u.get("created_at"),
    }

_server.public_user = _public_user_blue

# Spotlight migration layer. The old database key `golden` remains readable for
# already-created posts, but upgraded API responses expose the product as
# `spotlight`. This lets existing data survive while clients move away from the
# retired Golden Hour terminology.
_legacy_serialize_post = _server.serialize_post
async def _serialize_post_spotlight(post: dict, me_id: str) -> dict:
    data = await _legacy_serialize_post(post, me_id)
    data["spotlight"] = bool(post.get("spotlight", post.get("golden", False)))
    return data
_server.serialize_post = _serialize_post_spotlight

class _ApiPrefixAdapter:
    def __init__(self,target): self.target=target
    def get(self,path,*args,**kwargs): return self.target.get("/api"+path,*args,**kwargs)
    def post(self,path,*args,**kwargs): return self.target.post("/api"+path,*args,**kwargs)
    def delete(self,path,*args,**kwargs): return self.target.delete("/api"+path,*args,**kwargs)

_api=_ApiPrefixAdapter(app)
install_group_management_routes(_api,db,get_current_user,now_iso)
install_profile_edit_routes(_api,db,get_current_user,now_iso)
install_blue_entitlement_routes(_api,db,get_current_user)
install_blue_links_routes(_api,db,get_current_user,now_iso)
install_blue_story_routes(_api,db,get_current_user,now_iso)
install_blue_remaining_routes(_api,db,get_current_user,now_iso)

# New public names for the former Golden Hour endpoints. Old routes stay in
# place temporarily so an already-installed test build does not break.
@app.get("/api/posts/spotlight")
async def spotlight_feed(me=Depends(get_current_user)):
    rows = await _server.golden_feed(me)
    for row in rows:
        row["spotlight"] = bool(row.get("spotlight", row.get("golden", False)))
    return rows

@app.get("/api/spotlight/status")
async def spotlight_status(me=Depends(get_current_user)):
    state = await _server.golden_status(me)
    return {
        "active": state.get("active", False),
        "ends_at": state.get("ends_at"),
        "next_start": state.get("next_start"),
        "feature": "glint_spotlight",
    }
