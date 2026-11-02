"""Control-center routes tested against isolated mocks; no production state."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import pytest
from fastapi import HTTPException
import server
from admin_review_policy import require_decision_reason


def run(coro): return asyncio.run(coro)

@pytest.mark.parametrize('raises,expected',[(False,'completed'),(True,'pending')])
def test_cancellation_only_confirms_successful_google_response(raises,expected):
    users=SimpleNamespace(find_one=AsyncMock(return_value={'id':'u','blue_application_permanent_block':True,'blue_purchase_token':'test-token'}),update_one=AsyncMock())
    async def network(*args):
        if raises: raise RuntimeError('Google unavailable')
    with patch.object(server,'db',SimpleNamespace(users=users)),patch.object(server,'run_in_threadpool',network),patch.object(server,'admin_audit',AsyncMock()):
        assert run(server.process_blue_cancellation('u'))=={'status':expected}
    fields=users.update_one.call_args.args[1]['$set']
    assert ('blue_subscription_auto_renew' in fields) is (not raises)


def test_cancellation_not_available_for_unblocked_accounts():
    db=SimpleNamespace(users=SimpleNamespace(find_one=AsyncMock(return_value={'id':'u'})))
    with patch.object(server,'db',db),patch.object(server,'run_in_threadpool',AsyncMock()) as network:
        with pytest.raises(HTTPException):run(server.process_blue_cancellation('u'))
        network.assert_not_called()


def test_one_time_pass_does_not_claim_recurring_subscription_cancelled():
    users=SimpleNamespace(find_one=AsyncMock(return_value={'id':'u','blue_application_permanent_block':True}),update_one=AsyncMock())
    with patch.object(server,'db',SimpleNamespace(users=users)),patch.object(server,'admin_audit',AsyncMock()),patch.object(server,'run_in_threadpool',AsyncMock()) as network:
        assert run(server.process_blue_cancellation('u'))=={'status':'not_applicable'}
        network.assert_not_called()


def test_contact_edit_requires_valid_unique_contact_and_reason():
    users=SimpleNamespace(find_one=AsyncMock(return_value={'id':'u','email':'old@example.com'}),update_one=AsyncMock())
    with patch.object(server,'db',SimpleNamespace(users=users)):
        with pytest.raises(HTTPException): run(server.admin_edit_user('u',server.AdminUserEditBody(email='broken',reason='Requested contact correction')))
        with pytest.raises(HTTPException): run(server.admin_edit_user('u',server.AdminUserEditBody(reason=' '*10)))
        users.update_one.assert_not_called()


def test_contact_edit_resets_verification_and_sessions():
    users=SimpleNamespace(find_one=AsyncMock(side_effect=[{'id':'u','email':'old@example.com','phone':None},None,{'id':'u','email':'new@example.com'}]),update_one=AsyncMock())
    with patch.object(server,'db',SimpleNamespace(users=users)),patch.object(server,'admin_audit',AsyncMock()),patch.object(server,'admin_notify',AsyncMock()),patch.object(server,'admin_safe_user',lambda x:x):
        run(server.admin_edit_user('u',server.AdminUserEditBody(email='new@example.com',reason='User requested corrected contact information.')))
    update=users.update_one.call_args.args[1]['$set']
    assert update['verified'] is False
    assert update['force_logout_at']
    assert update['email']=='new@example.com'
    assert 'reason' not in update


def test_already_reviewed_appeal_cannot_restore_account():
    db=SimpleNamespace(appeals=SimpleNamespace(find_one=AsyncMock(return_value={'id':'a','user_id':'u','status':'rejected'}),find_one_and_update=AsyncMock(return_value=None)),users=SimpleNamespace(update_one=AsyncMock()))
    with patch.object(server,'db',db):
        with pytest.raises(HTTPException) as exc:run(server.admin_appeal_decision('a',server.AdminAppealDecisionBody(decision='approved',note='The evidence supports restoring this account.',restore_account=True)))
        assert exc.value.status_code==409
        db.users.update_one.assert_not_called()


def test_permanent_application_cannot_be_approved():
    db=SimpleNamespace(verifications=SimpleNamespace(find_one=AsyncMock(return_value={'id':'v','user_id':'u','status':'pending'})),users=SimpleNamespace(find_one=AsyncMock(return_value={'id':'u','blue_application_permanent_block':True})))
    with patch.object(server,'db',db):
        with pytest.raises(HTTPException) as exc:run(server.approve_verification('v',server.IdentityApprovalBody(reason='Identity evidence reviewed and confirmed.',identity_match_confirmed=True)))
        assert exc.value.status_code==403


def test_stats_can_count_async_cursor_and_live_blue_entitlements():
    class Cursor:
        def __aiter__(self):
            async def values():
                for x in [{'id':'one'},{'id':'two'}]: yield x
            return values()
    class Counter:
        count_documents=AsyncMock(return_value=2)
        def find(self,*args): return Cursor()
    db=SimpleNamespace(**{k:Counter() for k in ['users','posts','comments','stories','messages','verifications','tickets','reports','appeals','warnings']})
    with patch.object(server,'db',db),patch.object(server.play_billing,'blue_active',lambda u:u['id']=='two'):
        result=run(server.admin_stats())
        assert result['blue_tick_users']==1
        assert result['users']==2


def test_historical_rejections_also_block_a_fourth_application_without_read_side_effects():
    db=SimpleNamespace(verifications=SimpleNamespace(count_documents=AsyncMock(return_value=4)))
    original={'id':'u'}
    with patch.object(server,'db',db):
        state=run(server.verification_history_state(original))
    assert state['blue_application_permanent_block']
    assert state['blue_rejection_count']==4
    assert original=={'id':'u'}
