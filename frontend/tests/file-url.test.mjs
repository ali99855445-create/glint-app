import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveFileUrl} from '../src/lib/file-url.ts';
test('uploaded paths do not double the api prefix and use viewer credentials',()=>assert.equal(resolveFileUrl('https://api.glint.test/api','/api/files/photo','viewer'),'https://api.glint.test/api/files/photo?token=viewer'));
test('legacy absolute media URLs and empty avatars stay compatible',()=>{assert.equal(resolveFileUrl('https://api.test/api','https://api.test/api/files/p?token=old','new'),'https://api.test/api/files/p?token=old');assert.equal(resolveFileUrl('https://api.test/api',null),undefined);});
