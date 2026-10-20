"""Repeatable, account-bound one-month purchases. Legacy subscriptions stay separate."""
import calendar
import hashlib
import json
import os
from datetime import datetime, timezone
from urllib.parse import quote

PASS_ID = 'glint_blue_month_pass'
INTRO_PASS_ID = 'glint_blue_month_pass_intro'
PASS_IDS = {PASS_ID, INTRO_PASS_ID}


def enabled():
    # Enable only after both products and prices are active in Play Console.
    return os.getenv('PLAY_BLUE_PASSES_ENABLED', '').lower() == 'true'


def parse(value):
    try:
        result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return result if result.tzinfo else result.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def next_month(start):
    year = start.year + (start.month == 12)
    month = start.month % 12 + 1
    return start.replace(year=year, month=month, day=min(start.day, calendar.monthrange(year, month)[1]))


def active_end(user, now=None):
    now = now or datetime.now(timezone.utc)
    ends = [parse(g.get('ends_at')) for g in user.get('blue_pass_grants', [])
            if not g.get('revoked') and parse(g.get('starts_at')) and parse(g['starts_at']) <= now]
    return max([end for end in ends if end and end > now], default=None)


def validate_purchase(data, product_id, user_id):
    from play_billing import account_id
    if product_id not in PASS_IDS or data.get('productId', product_id) != product_id:
        raise ValueError('Wrong Blue pass product')
    if data.get('obfuscatedExternalAccountId') != account_id(user_id):
        raise ValueError('Purchase belongs to another Glint account')
    if data.get('purchaseState') != 0:
        raise ValueError('Blue pass payment is pending, cancelled or refunded')
    if data.get('quantity', 1) != 1:
        raise ValueError('Buy one Blue pass at a time')
    return data


def google_purchase(token, product_id, user_id, consume=False):
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    from play_billing import PACKAGE_NAME
    if product_id not in PASS_IDS:
        raise ValueError('Unknown Blue pass product')
    raw = os.getenv('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', '')
    if not raw:
        raise RuntimeError('Google Play purchase verification is not configured')
    creds = service_account.Credentials.from_service_account_info(json.loads(raw), scopes=['https://www.googleapis.com/auth/androidpublisher'])
    url = f'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE_NAME}/purchases/products/{product_id}/tokens/{quote(token, safe="")}'
    with AuthorizedSession(creds) as session:
        response = session.get(url, timeout=20)
        if response.status_code != 200:
            # A transient or permission failure must not revoke a paid grant.
            raise RuntimeError('Google Play could not check this payment. Please retry.')
        data = validate_purchase(response.json(), product_id, user_id)
        if consume and data.get('consumptionState') != 1:
            response = session.post(url + ':consume', timeout=20)
            if not response.ok:
                raise RuntimeError('Payment saved. Reopen Blue Verification and restore to finish processing it.')
        return data


async def apply_purchase(db, token, product_id, user_id, data, now=None):
    """CAS on the user makes retries/concurrent callbacks extend a receipt exactly once."""
    validate_purchase(data, product_id, user_id)
    now = now or datetime.now(timezone.utc)
    receipt = hashlib.sha256(token.encode()).hexdigest()
    for _ in range(12):
        user = await db.users.find_one({'id': user_id, 'deleted_at': None})
        if not user:
            raise ValueError('Glint account is unavailable')
        grants = user.get('blue_pass_grants', [])
        previous = next((g for g in grants if g['receipt'] == receipt), None)
        if previous:
            if previous.get('revoked'):
                raise ValueError('This purchase was revoked')
            return previous
        # A consumed receipt without our durable grant cannot be redeemed anew.
        if data.get('consumptionState') == 1:
            raise ValueError('This purchase was already used. Contact Glint support.')
        if product_id == INTRO_PASS_ID and (user.get('blue_intro_used_at') or user.get('blue_purchase_token') or user.get('blue_subscription_ends_at')):
            raise ValueError('The first-month discount has already been used on this Glint account. Contact support.')
        legacy_end = parse(user.get('blue_subscription_ends_at'))
        if legacy_end and legacy_end > now and user.get('blue_subscription_status') == 'active' and user.get('blue_subscription_auto_renew'):
            raise ValueError('This account already has an automatically renewing subscription. Turn off its renewal in Google Play before purchasing a manual monthly pass.')
        start = max([now] + ([legacy_end] if legacy_end and legacy_end > now and user.get('blue_subscription_status') == 'active' else []) + [parse(g['ends_at']) for g in grants if not g.get('revoked') and parse(g.get('ends_at'))])
        grant = {'receipt': receipt, 'starts_at': start.isoformat(), 'ends_at': next_month(start).isoformat(), 'revoked': False}
        fields = {'blue_pass_grants': grants + [grant], 'blue_intro_used_at': user.get('blue_intro_used_at') or now.isoformat()}
        # Exact previous value also serializes purchases made from two devices.
        result = await db.users.update_one({'id': user_id, 'blue_pass_grants': user.get('blue_pass_grants')}, {'$set': fields})
        if result.matched_count:
            return grant
    raise RuntimeError('Payment processing is busy. Restore purchase to retry.')


def install_routes(api, db, current_user):
    from fastapi import Depends, HTTPException
    from pydantic import BaseModel, Field
    from starlette.concurrency import run_in_threadpool

    class PassBody(BaseModel):
        purchase_token: str = Field(min_length=1, max_length=4096)
        product_id: str

    @api.post('/blue/passes/verify')
    async def verify_pass(body: PassBody, me=Depends(current_user)):
        if not enabled():
            raise HTTPException(503, 'Monthly passes are not available yet')
        try:
            data = await run_in_threadpool(google_purchase, body.purchase_token, body.product_id, me['id'])
            grant = await apply_purchase(db, body.purchase_token, body.product_id, me['id'], data)
            # Save receipt BEFORE consumption: crash/retry never loses or doubles a payment.
            await db.blue_pass_receipts.update_one({'_id': grant['receipt']}, {'$setOnInsert': {'user_id': me['id'], 'token': body.purchase_token, 'product_id': body.product_id}}, upsert=True)
            await run_in_threadpool(google_purchase, body.purchase_token, body.product_id, me['id'], True)
            return {'ok': True, 'payment_confirmed': True, 'ends_at': grant['ends_at'], 'consumed': True}
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        except Exception:
            raise HTTPException(503, 'Could not finish checking the payment. Restore purchase to retry; do not pay again.')


async def refresh_grants(db, user):
    """Recheck paid receipts for refunds; expiry itself is enforced on every request."""
    from starlette.concurrency import run_in_threadpool
    now = datetime.now(timezone.utc)
    checked = parse(user.get('blue_pass_checked_at'))
    if checked and (now - checked).total_seconds() < 300:
        return user
    grants = user.get('blue_pass_grants', [])
    for grant in grants:
        if grant.get('revoked') or not parse(grant.get('ends_at')) or parse(grant['ends_at']) <= now:
            continue
        receipt = await db.blue_pass_receipts.find_one({'_id': grant['receipt'], 'user_id': user['id']})
        if not receipt:
            continue  # Grant is durable; callback will retry receipt persistence/consumption.
        try:
            await run_in_threadpool(google_purchase, receipt['token'], receipt['product_id'], user['id'])
        except ValueError:
            await db.users.update_one({'id': user['id']}, {'$set': {'blue_pass_grants.$[g].revoked': True}}, array_filters=[{'g.receipt': grant['receipt']}])
            grant['revoked'] = True
        except Exception:
            return user  # Retry later; do not revoke for transport errors.
    await db.users.update_one({'id': user['id']}, {'$set': {'blue_pass_checked_at': now.isoformat()}})
    user['blue_pass_checked_at'] = now.isoformat()
    return user
