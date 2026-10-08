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
import { useAuth } from "@/src/context/AuthContext";
import { Avatar } from "@/src/components/Avatar";
import { usesNativeTabs } from "@/src/navigation";

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {user}=useAuth();
  const toast = useToast();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const feed = useQuery({ queryKey: ["feed"], queryFn: () => api.get("/posts/feed") });
  const stories = useQuery({ queryKey: ["stories"], queryFn: () => api.get("/stories/feed") });
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
  return (
    <View style={[styles.root, { paddingTop: 0 }]}>
      {feed.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : (
        <FlatList
          data={feed.data || []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PostCard post={item} />}
          ListHeaderComponent={<View><View style={{flexDirection:'row',alignItems:'center',gap:12,padding:16}}><Pressable onPress={()=>router.push('/(tabs)/profile')}><Avatar uri={user?.avatar} name={user?.full_name} size={42}/></Pressable><Pressable style={{flex:1,borderWidth:1,borderColor:colors.border,borderRadius:24,padding:12}} onPress={()=>router.push('/post/create')}><Text style={{color:colors.onSurface,fontSize:16}}>What's on your mind?</Text></Pressable></View><StoryBar groups={stories.data || []}/></View>}
          contentContainerStyle={{ paddingBottom: bottomChrome + 100, gap: spacing.md }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { feed.refetch(); stories.refetch(); }} tintColor={colors.brandPrimary} />}
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
