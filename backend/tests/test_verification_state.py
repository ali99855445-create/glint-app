import sys
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verification_state import verification_payload, purchase_allowed


class VerificationStateTests(unittest.TestCase):
    def paid(self):
        now = datetime.now(timezone.utc)
        return {'blue_pass_grants': [{'starts_at': now.isoformat(), 'ends_at': (now + timedelta(days=20)).isoformat(), 'revoked': False}]}

    def test_paid_old_approval_opens_identity_form(self):
        old = {'status': 'approved', 'id': 'historical'}
        result = verification_payload(self.paid(), old)
        self.assertTrue(result['blue_payment_confirmed'])
        self.assertFalse(result['blue_active'])
        self.assertEqual(result['status'], 'none')
        self.assertEqual(old['status'], 'approved')

    def test_real_identity_approval_keeps_verified_access(self):
        result = verification_payload({**self.paid(), 'blue_identity_approved': True}, {'status': 'approved'})
        self.assertTrue(result['blue_active'])
        self.assertEqual(result['status'], 'approved')

    def test_pending_and_rejection_preserved(self):
        for status in ('pending', 'rejected'):
            self.assertEqual(verification_payload(self.paid(), {'status': status})['status'], status)

    def test_expired_real_approval_keeps_identity_without_access(self):
        result = verification_payload({'blue_identity_approved': True}, {'status': 'approved'})
        self.assertFalse(result['blue_payment_confirmed'])
        self.assertEqual(result['status'], 'approved')

    def test_paid_pending_and_approved_accounts_cannot_checkout_again(self):
        for approved in (False, True):
            user = {**self.paid(), 'blue_identity_approved': approved}
            self.assertFalse(purchase_allowed(user))
            self.assertTrue(purchase_allowed({}))

    def test_cancelled_renewal_still_blocks_until_paid_expiry(self):
        now = datetime.now(timezone.utc)
        user = {'blue_subscription_status': 'active', 'blue_subscription_auto_renew': False,
                'blue_subscription_ends_at': (now + timedelta(days=1)).isoformat()}
        self.assertFalse(purchase_allowed(user))
        user['blue_subscription_ends_at'] = (now - timedelta(seconds=1)).isoformat()
        self.assertTrue(purchase_allowed(user))

    def test_separate_unpaid_account_remains_able_to_buy(self):
        self.assertFalse(purchase_allowed(self.paid()))
        self.assertTrue(purchase_allowed({'id': 'another-account'}))
