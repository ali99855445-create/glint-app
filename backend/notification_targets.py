"""Only internally constructed routes are returned; never follow arbitrary URLs."""
from urllib.parse import quote

def notification_route(n, actor=None, group=False):
    kind, ref = n.get('type'), n.get('ref_id')
    safe = quote(str(ref), safe='') if ref else None
    if kind in {'reaction', 'comment', 'spark'} and safe: return '/post/' + safe
    if kind == 'friend_request': return '/(tabs)/friends'
    if kind in {'follow', 'friend_accept'}:
        return '/user/' + quote(actor['username'], safe='') if actor and actor.get('username') else '/(tabs)/friends'
    if kind == 'message' and safe: return ('/chat/group/' if group else '/chat/') + safe
    if kind.startswith('community') and safe: return '/community/' + safe
    # Removed content no longer exists. Open the moderation/help surface instead.
    if kind == 'admin':
        text = (n.get('text') or '').lower()
        if 'verif' in text or 'badge' in text or 'blue tick' in text: return '/verification'
        if 'profile information' in text: return '/(tabs)/profile'
        return '/help'
    return '/help'
