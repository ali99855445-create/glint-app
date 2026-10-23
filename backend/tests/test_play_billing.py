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

    def test_intro_is_once_per_account(self):
        self.assertTrue(billing.intro_eligible({'id':'new'}))
        for field in ('blue_intro_used_at','blue_purchase_token','blue_subscription_ends_at', 'blue_pass_grants'):
            self.assertFalse(billing.intro_eligible({field:'already-used'}))
    def test_google_offer_details_are_used(self):
        self.data['lineItems'][0]['offerDetails']={'offerId':'firstmonth90','basePlanId':'monthly'}
        result=billing.active_subscription(self.data,'user-a',self.now)
        self.assertEqual(result['offer_id'],'firstmonth90')
        self.assertEqual(result['base_plan_id'],'monthly')

class CatalogTests(unittest.TestCase):
    def test_enabled_products_use_actual_console_base_plan_ids(self):
        from unittest.mock import patch
        with patch.dict('os.environ', {'PLAY_BLUE_PRODUCT_IDS':'glint_blue_account_2,glint_blue_account_3'}):
            self.assertEqual(billing.base_plan_ids(), {billing.PRODUCT_ID:'monthly','glint_blue_account_2':'blue-monthly-2','glint_blue_account_3':'blue-monthly-3'})
        with patch.dict('os.environ', {'PLAY_BLUE_PRODUCT_IDS':''}):
            self.assertEqual(billing.base_plan_ids(), {billing.PRODUCT_ID:'monthly'})
    def test_only_explicitly_configured_products_are_accepted(self):
        from unittest.mock import patch
        with patch.dict('os.environ', {'PLAY_BLUE_PRODUCT_IDS':'glint_blue_account_2, glint_blue_account_3,glint_blue_account_2'}):
            self.assertEqual(billing.product_ids(),[billing.PRODUCT_ID,'glint_blue_account_2','glint_blue_account_3'])

    def test_second_product_is_owned_by_its_glint_account_only(self):
        from unittest.mock import patch
        now=datetime.now(timezone.utc)
        data={'externalAccountIdentifiers':{'obfuscatedExternalAccountId':billing.account_id('second')},'subscriptionState':'SUBSCRIPTION_STATE_ACTIVE','lineItems':[{'productId':'glint_blue_account_2','expiryTime':(now+timedelta(days=30)).isoformat(),'autoRenewingPlan':{'autoRenewEnabled':True},'offerDetails':{'offerId':'firstmonth90','basePlanId':'monthly'}}]}
        with patch.dict('os.environ',{'PLAY_BLUE_PRODUCT_IDS':'glint_blue_account_2'}):
            result=billing.active_subscription(data,'second',now)
            self.assertEqual(result['product_id'],'glint_blue_account_2')
            self.assertTrue(result['auto_renew'])
            with self.assertRaisesRegex(ValueError,'another Glint account'):
                billing.active_subscription(data,'first',now)
        with patch.dict('os.environ',{'PLAY_BLUE_PRODUCT_IDS':''}):
            with self.assertRaises(ValueError):billing.active_subscription(data,'second',now)

    def test_acknowledgement_uses_the_actual_second_product(self):
        from unittest.mock import patch, MagicMock
        data={'externalAccountIdentifiers':{'obfuscatedExternalAccountId':billing.account_id('second')},'subscriptionState':'SUBSCRIPTION_STATE_ACTIVE','acknowledgementState':'ACKNOWLEDGEMENT_STATE_PENDING','lineItems':[{'productId':'glint_blue_account_2','expiryTime':(datetime.now(timezone.utc)+timedelta(days=30)).isoformat(),'autoRenewingPlan':{'autoRenewEnabled':True}}]}
        session=MagicMock()
        session.get.return_value.status_code=200
        session.get.return_value.json.return_value=data
        session.post.return_value.ok=True
        with patch.dict('os.environ',{'PLAY_BLUE_PRODUCT_IDS':'glint_blue_account_2','GOOGLE_PLAY_SERVICE_ACCOUNT_JSON':'{}'}), patch('google.oauth2.service_account.Credentials.from_service_account_info'), patch('google.auth.transport.requests.AuthorizedSession') as factory:
            factory.return_value.__enter__.return_value=session
            billing.verify_subscription('test-token','second')
        self.assertIn('/subscriptions/glint_blue_account_2/',session.post.call_args.args[0])

    def test_discount_is_per_glint_account_not_product(self):
        self.assertTrue(billing.intro_eligible({'id':'second'}))
        self.assertFalse(billing.intro_eligible({'id':'first','blue_purchase_token':'first-product-token'}))

if __name__ == '__main__': unittest.main()
