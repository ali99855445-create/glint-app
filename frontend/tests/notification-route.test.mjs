import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notificationRoute} from '../src/lib/notification-route.ts';
test('post activity opens the referenced post',()=>{for(const type of ['reaction','comment','spark'])assert.equal(notificationRoute({type,ref_id:'post-1'}),'/post/post-1');});
test('friend and follow activity opens the right person or requests',()=>{assert.equal(notificationRoute({type:'follow',actor:{username:'moon'}}),'/user/moon');assert.equal(notificationRoute({type:'friend_request'}),'/(tabs)/friends');});
test('group message follows server resolved group route',()=>assert.equal(notificationRoute({type:'message',ref_id:'group-1',route:'/chat/group/group-1'}),'/chat/group/group-1'));
test('system notices always have an actionable safe screen',()=>{assert.equal(notificationRoute({type:'admin',text:'Your verification badge changed'}),'/verification');assert.equal(notificationRoute({type:'admin',text:'Your post was removed',ref_id:'deleted'}),'/help');});
test('arbitrary external and invalid routes are ignored',()=>{for(const route of ['https://evil.test','/admin/users','//evil.test','/chat/../../admin'])assert.equal(notificationRoute({route}),'/help');});
