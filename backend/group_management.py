"""Glint group management policy helpers.

These helpers keep ownership/admin/member/privacy/delete rules in one place so
API routes and the mobile UI can enforce the same behaviour.
"""
from typing import Iterable

GROUP_PRIVACY_VALUES = {"private", "public"}


def is_owner(group: dict, user_id: str) -> bool:
    return bool(group and group.get("created_by") == user_id)


def is_admin(group: dict, user_id: str) -> bool:
    return is_owner(group, user_id) or user_id in (group.get("admins") or [])


def is_member(group: dict, user_id: str) -> bool:
    return user_id in (group.get("participants") or [])


def normalize_privacy(value: str) -> str:
    privacy = (value or "private").strip().lower()
    if privacy not in GROUP_PRIVACY_VALUES:
        raise ValueError("Group privacy must be private or public")
    return privacy


def can_manage_member(group: dict, actor_id: str, target_id: str) -> bool:
    if not is_admin(group, actor_id):
        return False
    # Group owner cannot be removed/demoted by another admin.
    if target_id == group.get("created_by") and actor_id != target_id:
        return False
    return target_id in (group.get("participants") or [])


def can_delete_group(group: dict, actor_id: str) -> bool:
    # Destructive delete is deliberately owner-only.
    return is_owner(group, actor_id)


def member_ids(values: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(v for v in values if v))


def management_capabilities(group: dict, viewer_id: str) -> dict:
    return {
        "is_owner": is_owner(group, viewer_id),
        "is_admin": is_admin(group, viewer_id),
        "can_edit_group": is_admin(group, viewer_id),
        "can_manage_members": is_admin(group, viewer_id),
        "can_change_privacy": is_admin(group, viewer_id),
        "can_delete_group": can_delete_group(group, viewer_id),
        "privacy": normalize_privacy(group.get("privacy", "private")),
    }
