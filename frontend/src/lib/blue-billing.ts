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
