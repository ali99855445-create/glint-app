import { test } from 'node:test';
import assert from 'node:assert/strict';
import {reconcileBluePurchase, billingErrorMessage, createBillingErrorReporter, selectBlueOffer} from '../src/lib/blue-billing.ts';
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

const introOffer={id:'firstmonth90',basePlanIdAndroid:'monthly',offerTokenAndroid:'intro'};
const regularOffer={id:'monthly',basePlanIdAndroid:'monthly',offerTokenAndroid:'regular'};
test('new Glint account gets intro and returning account gets regular',()=>{
 assert.equal(selectBlueOffer([regularOffer,introOffer],true),introOffer);
 assert.equal(selectBlueOffer([introOffer,regularOffer],false),regularOffer);
});
test('missing intro never silently charges full price',()=>assert.equal(selectBlueOffer([regularOffer],true),undefined));
test('missing base never reuses intro for returning subscriber',()=>assert.equal(selectBlueOffer([introOffer],false),undefined));
test('wrong base plan and missing tokens cannot launch checkout',()=>{
 assert.equal(selectBlueOffer([{...introOffer,basePlanIdAndroid:'annual'}],true),undefined);
 assert.equal(selectBlueOffer([{...regularOffer,offerTokenAndroid:null}],false),undefined);
});
test('additional Console base plans select intro and regular offers',()=>{
 for(const basePlanId of ['blue-monthly-2','blue-monthly-3']){
  const intro={...introOffer,basePlanIdAndroid:basePlanId};
  const regular={...regularOffer,id:basePlanId,basePlanIdAndroid:basePlanId};
  assert.equal(selectBlueOffer([introOffer,regularOffer,intro,regular],true,'firstmonth90',basePlanId),intro);
  assert.equal(selectBlueOffer([introOffer,regularOffer,intro,regular],false,'firstmonth90',basePlanId),regular);
  assert.equal(selectBlueOffer([introOffer,regularOffer],true,'firstmonth90',basePlanId),undefined);
 }
});

const {planBlueCheckout,availableBlueProduct}=await import('../src/lib/blue-billing.ts');
const catalog=['blue-a','blue-b','blue-c'];
const bought=(productId,token='token')=>({productId,purchaseToken:token,purchaseState:'purchased'});
const another=async()=>{throw new Error('Purchase belongs to another Glint account');};
test('second Glint account selects a free product on the same Play account',async()=>{
 assert.deepEqual(await planBlueCheckout(catalog,[bought('blue-a')],another),{restored:false,productId:'blue-b'});
});
test('third account does not transfer either existing subscription',async()=>{
 assert.equal((await planBlueCheckout(catalog,[bought('blue-a'),bought('blue-b')],another)).productId,'blue-c');
});
test('restore finds this account even when another account purchase is first',async()=>{
 const result=await planBlueCheckout(catalog,[bought('blue-a'),bought('blue-b')],async p=>{if(p.productId==='blue-a')await another();});
 assert.deepEqual(result,{restored:true,productId:'blue-b'});
});
test('catalog exhaustion never replaces an owned subscription',async()=>{
 assert.deepEqual(await planBlueCheckout(catalog,catalog.map(id=>bought(id)),another),{restored:false,productId:undefined});
});
test('network and validation errors cannot masquerade as another account',async()=>{
 await assert.rejects(planBlueCheckout(catalog,[bought('blue-a')],async()=>{throw new Error('Verification unavailable');}),/unavailable/);
});
test('pending purchase prevents another simultaneous checkout',async()=>{
 await assert.rejects(planBlueCheckout(catalog,[{...bought('blue-a'),purchaseState:'pending'}],another),/pending/);
});
test('inventory selection ignores device and card and excludes occupied products',()=>{
 assert.equal(availableBlueProduct(catalog,[bought('blue-a')]),'blue-b');
 assert.equal(availableBlueProduct(catalog,[]),'blue-a');
});
