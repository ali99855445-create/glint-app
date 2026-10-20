import sys
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from verification_state import verification_payload


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
