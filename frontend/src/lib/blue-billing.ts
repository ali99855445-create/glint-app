/** Store ownership must be reconciled before opening a second checkout. */
export async function reconcileBluePurchase<T extends {productId: string; purchaseToken?: string | null; purchaseState?: string}>(
  productId: string,
  list: () => Promise<T[]>,
  verify: (purchase: T) => Promise<void>,
): Promise<boolean> {
  const purchases = (await list()).filter(p => p.productId === productId);
  for (const purchase of purchases) {
    if (purchase.purchaseState === 'pending') {
      throw new Error('Your Google Play payment is pending. Complete it in Google Play before trying again.');
    }
    if (!purchase.purchaseToken) throw new Error('Google Play could not read your existing subscription. Please try again.');
    // Server validates ownership and expiry. Never transfer a purchase to another account.
    await verify(purchase);
  }
  return purchases.length > 0;
}

export function billingErrorMessage(error: {code?: string; message?: string}): string | null {
  const code = String(error?.code || '').toLowerCase();
  const message = error?.message || '';
  if (code.includes('user-cancel') || code === 'e_user_cancelled') return null;
  if (message.includes('Purchase belongs to another Glint account')) {
    return 'This Google Play subscription belongs to another Glint account. Sign in to that Glint account to use it. To subscribe separately, use a different Google Play account without an existing Glint subscription.';
  }
  if (code.includes('already-owned') || /already own/i.test(message)) {
    return 'This Google Play account already has a Glint subscription. Tap Restore purchase on the Glint account that originally bought it.';
  }
  if (code.includes('developer-error') || /invalid arguments|unable to change.*subscription plan/i.test(message)) {
    return 'Google Play could not start this subscription. Check existing Glint subscriptions under Play Store > Payments & subscriptions. If none exists, contact Glint support with this code: ' + (code || 'billing-request');
  }
  return message || 'Could not contact Google Play. Please try again.';
}

export function createBillingErrorReporter(show: (message: string) => void, now = Date.now) {
  let previous = ''; let at = -Infinity;
  return (error: {code?: string; message?: string}) => {
    const message = billingErrorMessage(error);
    if (!message) return;
    const time = now();
    // expo-iap reports a failed launch through both callback and rejected promise.
    if (message === previous && time - at < 3000) return;
    previous = message; at = time; show(message);
  };
}

/** Never silently replace a promised introductory offer with full-price checkout. */
export function selectBlueOffer<T extends {id?: string | null; offerTokenAndroid?: string | null; basePlanIdAndroid?: string | null}>(
  offers: T[], eligible: boolean, introId = 'firstmonth90', basePlanId = 'monthly',
): T | undefined {
  const monthly = offers.filter(o => o.offerTokenAndroid && o.basePlanIdAndroid === basePlanId);
  return eligible ? monthly.find(o => o.id === introId) : monthly.find(o => !o.id || o.id === basePlanId);
}

/** Plan against the actual Play inventory, not the current Glint login alone.
 * Each occupied product remains attached to its original account. Catalog
 * exhaustion fails closed; it never reassigns, consumes or replaces a subscription.
 */
export async function planBlueCheckout<T extends {productId: string; purchaseToken?: string | null; purchaseState?: string}>(
  productIds: string[], purchases: T[], verify: (purchase: T) => Promise<void>,
): Promise<{restored: boolean; productId?: string}> {
  const owned=purchases.filter(p=>productIds.includes(p.productId));
  for(const purchase of owned){
    if(purchase.purchaseState==='pending')throw new Error('A Glint payment is pending in Google Play. Complete it before another checkout.');
    if(!purchase.purchaseToken)throw new Error('Google Play could not read an existing subscription. Please retry.');
    try { await verify(purchase); return {restored:true,productId:purchase.productId}; }
    catch(error){
      if(!(error instanceof Error)||error.message!=='Purchase belongs to another Glint account')throw error;
    }
  }
  const occupied=new Set(owned.map(p=>p.productId));
  return {restored:false,productId:productIds.find(id=>!occupied.has(id))};
}

export function availableBlueProduct(productIds: string[], purchases: {productId: string}[]): string | undefined {
  const occupied=new Set(purchases.map(p=>p.productId));
  return productIds.find(id=>!occupied.has(id));
}
