"""Blue-only external profile links.

Normal users cannot add external-platform links. Active Blue users can store up
to the entitlement limit. Enforcement lives on the server so an old or modified
client cannot bypass it.
"""
from typing import List
from urllib.parse import urlparse
from fastapi import Depends, HTTPException
from pydantic import BaseModel

from blue_tick import resolve_blue_entitlements


class ExternalLink(BaseModel):
    label: str
    url: str


class ExternalLinksBody(BaseModel):
    links: List[ExternalLink]


def _valid_https_url(value: str) -> bool:
    try:
        parsed = urlparse(value.strip())
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
    except Exception:
        return False


def install_blue_links_routes(api, db, get_current_user, now_iso):
    @api.get("/profile/external-links")
    async def get_external_links(me=Depends(get_current_user)):
        user = await db.users.find_one({"id": me["id"]}, {"_id": 0})
        if not user:
            raise HTTPException(404, "User not found")
        return {"ok": True, "links": (user.get("external_links") or []) if resolve_blue_entitlements(user)["active"] else []}

    @api.post("/profile/external-links")
    async def save_external_links(body: ExternalLinksBody, me=Depends(get_current_user)):
        user = await db.users.find_one({"id": me["id"]})
        if not user:
            raise HTTPException(404, "User not found")

        entitlements = resolve_blue_entitlements(user)
        if not entitlements["external_links"]:
            raise HTTPException(403, "External profile links are available to Blue verified accounts only")

        limit = int(entitlements["external_links_max"])
        if len(body.links) > limit:
            raise HTTPException(400, f"Blue verified accounts can add up to {limit} external links")

        cleaned = []
        seen = set()
        for item in body.links:
            label = item.label.strip()[:40]
            url = item.url.strip()
            if not label or not _valid_https_url(url):
                raise HTTPException(400, "Each link needs a label and a valid web address")
            key = url.lower()
            if key in seen:
                raise HTTPException(400, "Duplicate external links are not allowed")
            seen.add(key)
            cleaned.append({"label": label, "url": url})

        await db.users.update_one(
            {"id": me["id"]},
            {"$set": {"external_links": cleaned, "external_links_updated_at": now_iso()}},
        )
        return {"ok": True, "links": cleaned, "limit": limit}
