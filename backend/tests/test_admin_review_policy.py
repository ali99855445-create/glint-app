import asyncio
from copy import deepcopy
import pytest
from fastapi import HTTPException
from admin_review_policy import reject_blue_application, decision_message, require_decision_reason
from blue_verification_policy import assert_blue_application_allowed
from verification_state import verification_payload, purchase_allowed

class Collection:
    def __init__(self, rows): self.rows = deepcopy(rows)
    def matches(self, row, query): return all(row.get(k) == v for k,v in query.items())
    async def find_one(self, query): return next((deepcopy(r) for r in self.rows if self.matches(r,query)), None)
    async def find_one_and_update(self, query, update):
        for row in self.rows:
            if self.matches(row, query):
                old = deepcopy(row); self.apply(row,update); return old
        return None
    def apply(self,row,update):
        row.update(update.get('$set',{}))
        for k,v in update.get('$max',{}).items(): row[k] = max(row.get(k,0),v)
    async def update_one(self,query,update):
        for row in self.rows:
            if self.matches(row,query): self.apply(row,update);return
    async def count_documents(self,query): return sum(self.matches(r,query) for r in self.rows)
class DB:
    def __init__(self, rejected=0):
        self.users=Collection([{'id':'u'}])
        self.verifications=Collection([{'id':f'old{i}','user_id':'u','status':'rejected'} for i in range(rejected)]+[{'id':'v','user_id':'u','status':'pending'}])

def run(coro): return asyncio.run(coro)
def reject(db,permanent=False): return run(reject_blue_application(db,'v','The submitted identity does not match the profile.',permanent,lambda:'2026-10-25T12:00:00+00:00'))

@pytest.mark.parametrize('previous,permanent,remaining',[(0,False,2),(1,False,1),(2,True,0)])
def test_three_distinct_rejections_block_new_applications(previous,permanent,remaining):
    db=DB(previous);result=reject(db)
    assert result['permanent'] is permanent
    assert result['attempts_remaining']==remaining
    assert db.users.rows[0]['blue_rejection_count']==previous+1
    if permanent:
        with pytest.raises(HTTPException): assert_blue_application_allowed(db.users.rows[0])
        assert not purchase_allowed(db.users.rows[0])
        assert db.users.rows[0]['blue_cancellation_status']=='pending'
    else: assert_blue_application_allowed(db.users.rows[0])

def test_permanent_reject_blocks_on_first_attempt():
    db=DB();r=reject(db,True)
    assert r['permanent'] and db.users.rows[0]['blue_application_permanent_block']
    assert 'does not confirm a refund' in r['decision_message']
    assert 'Case reference: v' in r['decision_message']

def test_repeated_click_is_conflict_not_another_strike():
    db=DB();reject(db)
    with pytest.raises(HTTPException) as exc: reject(db)
    assert exc.value.status_code==409
    assert db.users.rows[0]['blue_rejection_count']==1

def test_invalid_reason_never_changes_application():
    db=DB()
    with pytest.raises(HTTPException): run(reject_blue_application(db,'v',' ',False,lambda:'now'))
    assert db.verifications.rows[-1]['status']=='pending'

@pytest.mark.parametrize('reason',['','short',' '*20,'x'*4001])
def test_reason_validation(reason):
    with pytest.raises(HTTPException): require_decision_reason(reason)

def test_notice_contains_reason_case_and_team():
    text=decision_message('Appeal','approved','New evidence confirms the account belongs to you.','case-123')
    assert all(x in text for x in ['Glint Safety & Trust Team','Case reference: case-123','New evidence confirms','Next steps'])

def test_user_sees_block_and_attempt_count():
    payload=verification_payload({'blue_application_permanent_block':True,'blue_rejection_count':3},{'status':'rejected'})
    assert payload['application_permanently_blocked']
    assert payload['attempts_remaining']==0
