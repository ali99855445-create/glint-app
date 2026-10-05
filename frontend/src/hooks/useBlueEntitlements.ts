import { useQuery } from "@tanstack/react-query";
import { getMyBlueEntitlements } from "@/src/api/blueTick";

/**
 * Shared live entitlement hook for every Blue-only surface.
 * Keeping the query key central means admin/manual grants, cancellation and
 * expiry refresh consistently across profile, stories, links and support.
 */
export function useBlueEntitlements() {
  return useQuery({
    queryKey: ["blue-entitlements"],
    queryFn: getMyBlueEntitlements,
    staleTime: 30_000,
    refetchOnMount: true,
    refetchOnReconnect: true,
  });
}
