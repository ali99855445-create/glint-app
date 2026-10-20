"""Resolve the identity application independently from historical approvals."""
import play_billing


def verification_payload(user, application=None, eligibility=None):
    payload = dict(application or {'status': 'none'})
    identity_approved = bool(user.get('blue_identity_approved'))
    active = play_billing.blue_active(user)
    # An old approved application alone is not current Blue identity approval.
    # Keep its database history, but let paid users submit their current identity.
    if payload.get('status') == 'approved' and not identity_approved and not active:
        payload['status'] = 'none'
    payload['eligibility'] = eligibility or {}
    payload['blue_identity_approved'] = identity_approved
    payload['blue_payment_confirmed'] = play_billing.payment_active(user)
    payload['blue_active'] = active
    return payload
