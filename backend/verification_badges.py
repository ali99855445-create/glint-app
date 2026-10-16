"""Manual badges and paid Blue subscriptions have independent lifetimes."""
from datetime import datetime, timedelta, timezone

BADGES = {'blue': 'Blue', 'golden': 'Golden', 'green': 'Green', 'silver': 'Silver', 'business': 'Business'}


def configured_manual_badge(user):
    user = user or {}
    badge = user.get('manual_verification_badge')
    if badge in BADGES:
        return badge
    return 'blue' if user.get('blue_tick_manual') or user.get('blue_manual_grant') else None


def manual_badge(user, now=None):
    badge = configured_manual_badge(user)
    if not badge:
        return None
    expiry = (user or {}).get('manual_badge_expires_at')
    if expiry is not None:
        try:
            ends = datetime.fromisoformat(str(expiry).replace('Z', '+00:00'))
            if ends.tzinfo is None:
                ends = ends.replace(tzinfo=timezone.utc)
            if ends <= (now or datetime.now(timezone.utc)):
                return None
        except (ValueError, TypeError):
            return None  # A corrupt expiry must never become a permanent grant.
    return badge


def manual_badge_update(badge, duration_days=None, reason='', now=None):
    if badge is not None and badge not in BADGES:
        raise ValueError('Unknown badge')
    if duration_days is not None and (type(duration_days) is not int or not 1 <= duration_days <= 36500):
        raise ValueError('Duration must be between 1 and 36500 days')
    now = now or datetime.now(timezone.utc)
    return {
        'manual_verification_badge': badge,
        'blue_tick_manual': badge == 'blue',
        'blue_manual_grant': badge == 'blue',
        'manual_badge_reason': reason.strip(),
        'manual_badge_granted_at': now.isoformat() if badge else None,
        'manual_badge_expires_at': (now + timedelta(days=duration_days)).isoformat() if badge and duration_days is not None else None,
    }


def display_badge(user, blue_active):
    return manual_badge(user) or ('blue' if blue_active(user) else None)
