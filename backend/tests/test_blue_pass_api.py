import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(Path(__file__).resolve().parent))
import blue_pass
from test_blue_pass import Users
from fastapi import FastAPI, APIRouter
from fastapi.testclient import TestClient
import play_billing

class Receipts:
    def __init__(self): self.rows={}
    async def update_one(self,q,u,**kw): self.rows.setdefault(q['_id'],u['$setOnInsert'])

class PassApiTests(unittest.TestCase):
    def setUp(self):
        self.db=SimpleNamespace(users=Users([{'id':'a'}]),blue_pass_receipts=Receipts())
        async def me():return {'id':'a'}
        api=APIRouter(prefix='/api');blue_pass.install_routes(api,self.db,me)
        app=FastAPI();app.include_router(api);self.client=TestClient(app)
    def post(self):return self.client.post('/api/blue/passes/verify',json={'purchase_token':'abc','product_id':blue_pass.PASS_ID})
    def test_disabled_returns_service_unavailable(self):
        with patch.object(blue_pass,'enabled',return_value=False):self.assertEqual(self.post().status_code,503)
    def test_success_and_duplicate_only_credit_once(self):
        def purchase(token,product,uid,consume=False):
            if consume:
                self.assertEqual(len(self.db.users.rows['a']['blue_pass_grants']),1)
                self.assertEqual(len(self.db.blue_pass_receipts.rows),1)
            return {'purchaseState':0,'consumptionState':0,'obfuscatedExternalAccountId':play_billing.account_id(uid)}
        with patch.object(blue_pass,'enabled',return_value=True),patch.object(blue_pass,'google_purchase',side_effect=purchase):
            self.assertEqual(self.post().status_code,200);self.assertEqual(self.post().status_code,200)
        self.assertEqual(len(self.db.users.rows['a']['blue_pass_grants']),1)
    def test_failed_consumption_recoverable_without_double_grant(self):
        fails=[True]
        def purchase(token,product,uid,consume=False):
            if consume and fails and fails.pop():raise RuntimeError('network')
            return {'purchaseState':0,'consumptionState':0,'obfuscatedExternalAccountId':play_billing.account_id(uid)}
        with patch.object(blue_pass,'enabled',return_value=True),patch.object(blue_pass,'google_purchase',side_effect=purchase):
            self.assertEqual(self.post().status_code,503);self.assertEqual(self.post().status_code,200)
        self.assertEqual(len(self.db.users.rows['a']['blue_pass_grants']),1)
    def test_ownership_failure_never_grants(self):
        with patch.object(blue_pass,'enabled',return_value=True),patch.object(blue_pass,'google_purchase',side_effect=ValueError('Purchase belongs to another Glint account')):
            self.assertEqual(self.post().status_code,400)
        self.assertNotIn('blue_pass_grants',self.db.users.rows['a'])

if __name__=='__main__':unittest.main()
