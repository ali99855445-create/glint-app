export const BLUE_TICK_BENEFITS = {
  badgeEverywhere: true,
  impersonationProtection: true,
  prioritySupport: true,
  videoStories: true,
  externalLinks: true,
} as const;

export const BLUE_TICK_LIMITS = {
  storyVideoMaxSeconds: 60,
  externalLinksMax: 2,
} as const;

export type BlueTickSource = "subscription" | "admin_manual";

export type BlueTickEntitlements = {
  active: boolean;
  source: BlueTickSource | null;
  badgeEverywhere: boolean;
  impersonationProtection: boolean;
  prioritySupport: boolean;
  videoStories: boolean;
  externalLinks: boolean;
  storyVideoMaxSeconds: number;
  externalLinksMax: number;
};

/**
 * Both paid subscriptions and manual admin grants unlock the exact same
 * product benefits. Keeping this in one resolver prevents test/admin Blue
 * Ticks from drifting away from the paid experience.
 */
export function resolveBlueTickEntitlements(
  active: boolean,
  source: BlueTickSource | null = null,
): BlueTickEntitlements {
  if (!active) {
    return {
      active: false,
      source: null,
      badgeEverywhere: false,
      impersonationProtection: false,
      prioritySupport: false,
      videoStories: false,
      externalLinks: false,
      storyVideoMaxSeconds: 0,
      externalLinksMax: 0,
    };
  }

  return {
    active: true,
    source,
    ...BLUE_TICK_BENEFITS,
    storyVideoMaxSeconds: BLUE_TICK_LIMITS.storyVideoMaxSeconds,
    externalLinksMax: BLUE_TICK_LIMITS.externalLinksMax,
  };
}
