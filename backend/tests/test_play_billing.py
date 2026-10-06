import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import play_billing as billing

class BillingTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.data = {'externalAccountIdentifiers': {'obfuscatedExternalAccountId': billing.account_id('user-a')}, 'subscriptionState': 'SUBSCRIPTION_STATE_ACTIVE', 'lineItems': [{'productId': billing.PRODUCT_ID, 'expiryTime': (self.now + timedelta(days=1)).isoformat()}]}
    def test_paid_subscription(self):
        self.assertIsNotNone(billing.active_subscription(self.data, 'user-a', self.now))
    def test_account_replay_rejected(self):
        with self.assertRaises(ValueError): billing.active_subscription(self.data, 'user-b', self.now)
    def test_pending_and_refunded_rejected(self):
        for state in ('SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_ON_HOLD'):
            self.data['subscriptionState'] = state
            with self.assertRaises(ValueError): billing.active_subscription(self.data, 'user-a', self.now)
    def test_wrong_product_and_expiry_rejected(self):
        self.data['lineItems'][0]['productId'] = 'other'
        with self.assertRaises(ValueError): billing.active_subscription(self.data, 'user-a', self.now)
        self.data['lineItems'][0]['productId'] = billing.PRODUCT_ID
        self.data['lineItems'][0]['expiryTime'] = (self.now - timedelta(seconds=1)).isoformat()
        with self.assertRaises(ValueError): billing.active_subscription(self.data, 'user-a', self.now)
    def test_cancelled_paid_period_keeps_access(self):
        self.data['subscriptionState'] = 'SUBSCRIPTION_STATE_CANCELED'
        self.assertIsNotNone(billing.active_subscription(self.data, 'user-a', self.now))
    def test_payment_does_not_grant_badge(self):
        user = {'blue_source': 'subscription', 'blue_subscription_status': 'active', 'blue_subscription_ends_at': (self.now + timedelta(days=1)).isoformat()}
        self.assertFalse(billing.blue_active(user))
        user['blue_identity_approved'] = True
        self.assertTrue(billing.blue_active(user))
        user['blue_subscription_ends_at'] = (self.now - timedelta(seconds=1)).isoformat()
        self.assertFalse(billing.blue_active(user))
    def test_legacy_golden_is_not_blue(self):
        self.assertFalse(billing.blue_active({"golden_tick": True}))
    def test_manual_admin_grant_keeps_access(self):
        self.assertTrue(billing.blue_active({'blue_tick_manual': True}))

if __name__ == '__main__': unittest.main()
