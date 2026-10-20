import asyncio
import copy
import sys
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import blue_pass
import play_billing

class Users:
    def __init__(self, users): self.rows={u['id']:copy.deepcopy(u) for u in users}
    async def find_one(self,q): return copy.deepcopy(self.rows.get(q['id']))
    async def update_one(self,q,update):
        row=self.rows[q['id']]
        if row.get('blue_pass_grants') != q.get('blue_pass_grants'):return SimpleNamespace(matched_count=0)
        row.update(copy.deepcopy(update['$set']));return SimpleNamespace(matched_count=1)

class PassTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.now=datetime(2026,1,31,12,tzinfo=timezone.utc)
        self.db=SimpleNamespace(users=Users([{'id':'a'}, {'id':'b'}]))
    def data(self,uid='a',**extra):
        return {'purchaseState':0,'consumptionState':0,'quantity':1,'obfuscatedExternalAccountId':play_billing.account_id(uid),**extra}
    async def buy(self,token='one',uid='a',product=blue_pass.PASS_ID,**extra):
        return await blue_pass.apply_purchase(self.db,token,product,uid,self.data(uid,**extra),self.now)
    async def test_calendar_month_and_expiry(self):
        g=await self.buy();self.assertEqual(g['ends_at'],'2026-02-28T12:00:00+00:00')
        user=self.db.users.rows['a'];self.assertTrue(play_billing.payment_active(user,self.now))
        self.assertFalse(play_billing.payment_active(user,blue_pass.parse(g['ends_at'])))
    async def test_same_payment_user_can_purchase_for_many_accounts(self):
        a=await self.buy('a','a');b=await self.buy('b','b')
        self.assertEqual(a['ends_at'],b['ends_at']);self.assertNotEqual(a['receipt'],b['receipt'])
    async def test_token_cannot_move_to_another_account(self):
        await self.buy()
        with self.assertRaisesRegex(ValueError,'another Glint account'):
            await blue_pass.apply_purchase(self.db,'one',blue_pass.PASS_ID,'b',self.data(),self.now)
    async def test_duplicate_callbacks_only_grant_once(self):
        await asyncio.gather(*[self.buy() for _ in range(8)])
        self.assertEqual(len(self.db.users.rows['a']['blue_pass_grants']),1)
    async def test_early_renewal_extends_without_losing_days(self):
        await self.buy('one');g=await self.buy('two')
        self.assertEqual(g['starts_at'],'2026-02-28T12:00:00+00:00')
        self.assertEqual(g['ends_at'],'2026-03-28T12:00:00+00:00')
        self.assertTrue(play_billing.payment_active(self.db.users.rows['a'],datetime(2026,3,1,tzinfo=timezone.utc)))
    async def test_new_period_after_expiry_starts_now(self):
        await self.buy();later=datetime(2026,5,10,tzinfo=timezone.utc)
        g=await blue_pass.apply_purchase(self.db,'two',blue_pass.PASS_ID,'a',self.data(),later)
        self.assertEqual(g['starts_at'],later.isoformat())
    async def test_intro_once_per_glint_account(self):
        await self.buy(product=blue_pass.INTRO_PASS_ID)
        with self.assertRaisesRegex(ValueError,'discount'):
            await self.buy('two',product=blue_pass.INTRO_PASS_ID)
        await self.buy('three','b',blue_pass.INTRO_PASS_ID)
    async def test_pending_cancelled_and_wrong_product_rejected(self):
        for state in (1,2):
            with self.assertRaises(ValueError):await self.buy(purchaseState=state)
        with self.assertRaises(ValueError):await self.buy(product='unrelated')
    async def test_consumed_without_record_cannot_grant(self):
        with self.assertRaises(ValueError):await self.buy(consumptionState=1)
        await self.buy();await self.buy(consumptionState=1)
        self.assertEqual(len(self.db.users.rows['a']['blue_pass_grants']),1)
    async def test_paid_pass_needs_identity_approval(self):
        await self.buy();u=self.db.users.rows['a']
        # Use a future fixture for wall-clock entitlement checks.
        u['blue_pass_grants'][0].update(starts_at=datetime.now(timezone.utc).isoformat(),ends_at=(datetime.now(timezone.utc)+timedelta(days=3)).isoformat())
        self.assertFalse(play_billing.blue_active(u));u['blue_identity_approved']=True
        self.assertTrue(play_billing.blue_active(u));u['blue_pass_grants'][0]['revoked']=True
        self.assertFalse(play_billing.blue_active(u))
    async def test_multi_quantity_rejected(self):
        with self.assertRaises(ValueError):await self.buy(quantity=2)

if __name__=='__main__':unittest.main()
