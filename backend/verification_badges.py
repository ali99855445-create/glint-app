"""Manual badge display is separate from the paid Blue subscription product."""
BADGES={'blue':'Blue','golden':'Golden','green':'Green','silver':'Silver','business':'Business'}

def manual_badge(user):
    b=(user or {}).get('manual_verification_badge')
    return b if b in BADGES else None

def display_badge(user, blue_active):
    return manual_badge(user) or ('blue' if blue_active(user) else None)
