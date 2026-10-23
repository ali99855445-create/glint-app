import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterConversations} from '../src/lib/messenger.ts';
const rows=[{id:'a',user:{full_name:'Moon',username:'moon'},unread:2},{id:'b',is_group:true,name:'Glint Team',unread:0},{id:'c',is_group:true,name:'Family',unread:1}];
test('Unread shows only conversations with unread messages without marking them read',()=>{assert.deepEqual(filterConversations(rows,'','unread').map(r=>r.id),['a','c']);assert.equal(rows[0].unread,2);});
test('Group chats stays separate from direct conversations',()=>assert.deepEqual(filterConversations(rows,'','groups').map(r=>r.id),['b','c']));
test('Messenger search matches person, username and group with current filter',()=>{assert.deepEqual(filterConversations(rows,' MOON ','all').map(r=>r.id),['a']);assert.deepEqual(filterConversations(rows,'glint','groups').map(r=>r.id),['b']);assert.deepEqual(filterConversations(rows,'glint','unread'),[]);});
test('missing profile names do not crash Messenger search',()=>assert.deepEqual(filterConversations([{id:'x',user:{}}],'x','all'),[]));
