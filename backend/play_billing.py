"""Google Play subscription validation. No client-supplied payment flags."""
import hashlib
import json
import os
from datetime import datetime, timezone
from urllib.parse import quote

PRODUCT_ID = os.getenv('PLAY_BLUE_PRODUCT_ID', 'glint_blue_monthly')
INTRO_OFFER_ID = 'firstmonth90'

def intro_eligible(user):
    return not (user.get('blue_intro_used_at') or user.get('blue_purchase_token') or user.get('blue_subscription_ends_at'))


PACKAGE_NAME = 'com.glinttechnologies.glint'


def account_id(user_id):
    return hashlib.sha256(user_id.encode()).hexdigest()


def active_subscription(data, user_id, now=None):
    now = now or datetime.now(timezone.utc)
    if data.get('externalAccountIdentifiers', {}).get('obfuscatedExternalAccountId') != account_id(user_id):
        raise ValueError('Purchase belongs to another Glint account')
    if data.get('subscriptionState') not in {
        'SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'
    }:
        raise ValueError('Subscription is not active')
    items = [i for i in data.get('lineItems', []) if i.get('productId') == PRODUCT_ID]
    for item in items:
        expiry = datetime.fromisoformat(item.get('expiryTime', '').replace('Z', '+00:00'))
        if expiry > now:
            return {'ends_at': expiry.isoformat(), 'auto_renew': bool(item.get('autoRenewingPlan', {}).get('autoRenewEnabled')), 'offer_id': item.get('offerDetails', {}).get('offerId'), 'base_plan_id': item.get('offerDetails', {}).get('basePlanId')}
    raise ValueError('Subscription has expired or has the wrong product')


def verify_subscription(token, user_id):
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    raw = os.getenv('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', '')
    if not raw:
        raise RuntimeError('Google Play purchase verification is not configured')
    creds = service_account.Credentials.from_service_account_info(
        json.loads(raw), scopes=['https://www.googleapis.com/auth/androidpublisher'])
    with AuthorizedSession(creds) as session:
        url = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE_NAME}/purchases/subscriptionsv2/tokens/{quote(token, safe="")}'
        response = session.get(url, timeout=20)
        if response.status_code != 200:
            raise ValueError('Google Play could not verify this purchase')
        data = response.json()
        result = active_subscription(data, user_id)
        if data.get('acknowledgementState') == 'ACKNOWLEDGEMENT_STATE_PENDING':
            ack = session.post(f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE_NAME}/purchases/subscriptions/{PRODUCT_ID}/tokens/{quote(token, safe="")}:acknowledge', json={}, timeout=20)
            if not ack.ok:
                raise RuntimeError('Purchase acknowledgement failed; restore the purchase to retry')
        return result


def payment_active(user, now=None):
    try:
        expiry = datetime.fromisoformat(user.get('blue_subscription_ends_at', '').replace('Z', '+00:00'))
        return user.get('blue_subscription_status') == 'active' and expiry > (now or datetime.now(timezone.utc))
    except (ValueError, TypeError):
        return False


def blue_active(user):
    from blue_tick import blue_tick_active
    return blue_tick_active(user)
