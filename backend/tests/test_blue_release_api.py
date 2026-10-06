"""Release regressions for verified identity review and existing name rules."""
import sys
from pathlib import Path
from datetime import datetime, timezone
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from fastapi import HTTPException

class ReleaseApiTests(IsolatedAsyncioTestCase):
    def setUp(self):
        self.db = SimpleNamespace(users=AsyncMock(), files=AsyncMock(), profile_reviews=AsyncMock(), verifications=AsyncMock())
        self.patch = patch.object(server, 'db', self.db)
        self.patch.start()
        self.addCleanup(self.patch.stop)
    async def test_absolute_upload_url_enters_identity_review(self):
        self.db.files.find_one.return_value = {'path': 'glint/uploads/a/document.jpg'}
        result = await server.profile_edit_v2(server.ProfileEditV2(full_name='New', name_evidence_url='https://glint-api-xf2i.onrender.com/api/files/glint/uploads/a/document.jpg?token=test'), {'id': 'a', 'full_name': 'Old', 'blue_tick_manual': True})
        self.assertTrue(result['identity_review_required'])
        self.db.files.find_one.assert_awaited_with({'path': 'glint/uploads/a/document.jpg', 'owner_id': 'a'})
        self.db.users.update_one.assert_not_awaited()
    async def test_legacy_edit_cannot_bypass_verified_review(self):
        with self.assertRaises(HTTPException) as exc:
            await server.update_me(server.ProfileUpdate(full_name='Bypass'), {'id': 'a', 'full_name': 'Old', 'blue_tick_manual': True})
        self.assertEqual(exc.exception.status_code, 400)
        self.db.users.update_one.assert_not_awaited()
    async def test_normal_account_keeps_thirty_day_name_cooldown(self):
        with self.assertRaises(HTTPException) as exc:
            await server.update_me(server.ProfileUpdate(full_name='New'), {'id': 'b', 'full_name': 'Old', 'name_changed_at': datetime.now(timezone.utc).isoformat()})
        self.assertEqual(exc.exception.status_code, 409)
        self.db.users.update_one.assert_not_awaited()
    async def test_other_users_identity_document_is_rejected(self):
        self.db.files.find_one.return_value = None
        with self.assertRaises(HTTPException) as exc:
            await server.profile_edit_v2(server.ProfileEditV2(full_name='New', name_evidence_url='/api/files/glint/uploads/b/document.jpg'), {'id': 'a', 'full_name': 'Old', 'blue_tick_manual': True})
        self.assertEqual(exc.exception.status_code, 400)
        self.db.profile_reviews.insert_one.assert_not_awaited()
