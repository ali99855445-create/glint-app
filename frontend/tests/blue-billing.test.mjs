import { test } from 'node:test';
import assert from 'node:assert/strict';
import {reconcileBluePurchase, billingErrorMessage, createBillingErrorReporter} from '../src/lib/blue-billing.ts';
const owned={productId:'blue',purchaseToken:'token',purchaseState:'purchased'};
test('empty store allows checkout',async()=>assert.equal(await reconcileBluePurchase('blue',async()=>[],async()=>assert.fail()),false));
test('existing paid period restores instead of checking out',async()=>{
 let calls=0;assert.equal(await reconcileBluePurchase('blue',async()=>[owned],async()=>{calls++;}),true);assert.equal(calls,1);
});
test('another account ownership failure prevents checkout',async()=>{
 await assert.rejects(reconcileBluePurchase('blue',async()=>[owned],async()=>{throw new Error('Purchase belongs to another Glint account');}),/another Glint account/);
 assert.match(billingErrorMessage({message:'Purchase belongs to another Glint account'}),/originally|Sign in/);
});
test('pending payment cannot grant or launch another purchase',async()=>await assert.rejects(reconcileBluePurchase('blue',async()=>[{...owned,purchaseState:'pending'}],async()=>assert.fail()),/pending/));
test('failed store query fails closed',async()=>await assert.rejects(reconcileBluePurchase('blue',async()=>{throw new Error('offline');},async()=>assert.fail()),/offline/));
test('unrelated product is ignored',async()=>assert.equal(await reconcileBluePurchase('blue',async()=>[{...owned,productId:'other'}],async()=>assert.fail()),false));
test('missing token fails closed',async()=>await assert.rejects(reconcileBluePurchase('blue',async()=>[{...owned,purchaseToken:null}],async()=>assert.fail()),/could not read/));
test('cancel is silent and duplicate errors are shown once',()=>{
 let time=0;let messages=[];const report=createBillingErrorReporter(m=>messages.push(m),()=>time);
 report({code:'user-cancelled'});assert.equal(messages.length,0);
 report({message:'Invalid arguments provided to the API'});report({message:'Invalid arguments provided to the API'});assert.equal(messages.length,1);
 time=4000;report({message:'Invalid arguments provided to the API'});assert.equal(messages.length,2);
});
