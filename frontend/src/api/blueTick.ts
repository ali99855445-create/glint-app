import { api } from "@/src/api/client";

export type BlueEntitlements = {
  active: boolean;
  source: "subscription" | "admin_manual" | null;
  badge_everywhere: boolean;
  impersonation_protection: boolean;
  priority_support: boolean;
  video_stories: boolean;
  external_links: boolean;
  story_video_max_seconds: number;
  external_links_max: number;
};

export type BlueEntitlementResponse = {
  ok: boolean;
  blue: BlueEntitlements;
  subscription: {
    status: string;
    ends_at: string | null;
    auto_renew: boolean;
  };
};

/**
 * Single source of truth for paid/manual Blue Tick capabilities.
 * Screens should use this instead of checking a local `verified` flag.
 */
export async function getMyBlueEntitlements(): Promise<BlueEntitlementResponse> {
  return api.get("/blue/entitlements");
}
