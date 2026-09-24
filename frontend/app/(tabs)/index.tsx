import React from "react";
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api } from "@/src/api/client";
import { PostCard } from "@/src/components/PostCard";
import { StoryBar } from "@/src/components/StoryBar";
import { Icon } from "@/src/components/Icon";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { usesNativeTabs } from "@/src/navigation";

function useCountdown(target?: string | null) {
  const [label, setLabel] = React.useState("");
  React.useEffect(() => {
    if (!target) return;
    const tick = () => {
      const diff = Math.max(0, new Date(target).getTime() - Date.now());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return label;
}

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const feed = useQuery({ queryKey: ["feed"], queryFn: () => api.get("/posts/feed") });
  const stories = useQuery({ queryKey: ["stories"], queryFn: () => api.get("/stories/feed") });
  const config = useQuery({ queryKey: ["config"], queryFn: () => api.get("/config") });
  const unread = useQuery({ queryKey: ["unread-count"], queryFn: () => api.get("/notifications/unread-count"), refetchInterval: 15000 });
  const unreadCount = unread.data?.count || 0;
  const golden = useQuery({ queryKey: ["golden-status"], queryFn: () => api.get("/golden/status"), refetchInterval: 60000 });

  React.useEffect(() => {
    (async () => {
      try {
        const r = await api.post("/spark/claim-daily");
        if (r.claimed) toast.show(`+${r.reward} Sparks claimed! 🪙`, "success");
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshing = feed.isRefetching || stories.isRefetching;
  const broadcast = config.data?.broadcast;
  const gActive = golden.data?.active;
  const countdown = useCountdown(gActive ? golden.data?.ends_at : golden.data?.next_start);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* sticky header */}
      <View style={styles.header}>
        <Text style={styles.logo}>Glint</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push("/notifications")} style={styles.headerBtn} testID="home-notifications">
            <Icon name="notifications-outline" size={22} color={colors.onSurface} />
            {unreadCount > 0 && (
              <View style={styles.badge} testID="home-notif-badge">
                <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            )}
          </Pressable>
          <Pressable onPress={() => router.push("/search")} style={styles.headerBtn} testID="home-search">
            <Icon name="search" size={22} color={colors.onSurface} />
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/chat")} style={styles.headerBtn} testID="home-chat">
            <Icon name="paper-plane-outline" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>

      {broadcast?.active && (
        <View style={styles.broadcast} testID="broadcast-banner">
          <Icon name="megaphone" size={18} color={colors.onBrandSecondary} />
          <Text style={styles.broadcastText}>{broadcast.message}</Text>
        </View>
      )}

      <Pressable style={[styles.golden, gActive && styles.goldenActive]} onPress={() => router.push("/golden")} testID="golden-hour-banner">
        <Icon name="sparkles" size={20} color={gActive ? colors.onBrandSecondary : colors.brandSecondary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.goldenTitle, gActive && { color: colors.onBrandSecondary }]}>
            {gActive ? "Golden Hour is LIVE ✨" : "Golden Hour"}
          </Text>
          <Text style={[styles.goldenSub, gActive && { color: colors.onBrandSecondary }]}>
            {gActive ? `Post now for the Golden Feed · ends in ${countdown}` : `Starts in ${countdown} · tap to see the glow`}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={gActive ? colors.onBrandSecondary : colors.brandSecondary} />
      </Pressable>

      {feed.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : (
        <FlatList
          data={feed.data || []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PostCard post={item} />}
          ListHeaderComponent={<StoryBar groups={stories.data || []} />}
          contentContainerStyle={{ paddingBottom: bottomChrome + 100, gap: spacing.md }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feed.refetch(); stories.refetch(); config.refetch(); }} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="planet-outline" size={64} color={colors.muted} />
              <Text style={styles.emptyTitle}>Your feed is quiet</Text>
              <Text style={styles.emptySub}>Follow friends or create your first post to get things glowing.</Text>
              <Button title="Find friends" onPress={() => router.push("/(tabs)/friends")} testID="home-find-friends" small />
            </View>
          }
        />
      )}

      <Pressable style={[styles.fab, { bottom: bottomChrome + 16 }]} onPress={() => router.push("/post/create")} testID="home-create-post">
        <Icon name="add" size={30} color={colors.onBrandPrimary} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  logo: { color: c.brand, fontFamily: fonts.displayBold, fontSize: 28 },
  headerActions: { flexDirection: "row", gap: spacing.xs },
  headerBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -2, right: -2, backgroundColor: c.error, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 2, borderColor: c.surface },
  badgeText: { color: c.onError, fontFamily: fonts.semibold, fontSize: 10 },
  broadcast: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.brandSecondary, marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md },
  broadcastText: { flex: 1, color: c.onBrandSecondary, fontFamily: fonts.medium, fontSize: 14 },
  golden: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.brandTertiary, borderWidth: 1, borderColor: c.brandSecondary, marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md },
  goldenActive: { backgroundColor: c.brandSecondary, borderColor: c.brandSecondary },
  goldenTitle: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  goldenSub: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing["3xl"] },
  emptyTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 20 },
  emptySub: { color: c.muted, fontFamily: fonts.text, fontSize: 15, textAlign: "center", lineHeight: 22 },
  fab: { position: "absolute", right: spacing.lg, width: 58, height: 58, borderRadius: 29, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", shadowColor: c.brandPrimary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
}));
