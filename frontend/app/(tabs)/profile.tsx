import React from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api, fileUrl } from "@/src/api/client";
import { Avatar, BlueTick } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { PostCard } from "@/src/components/PostCard";
import { useAuth } from "@/src/context/AuthContext";
import { usesNativeTabs } from "@/src/navigation";

const DEFAULT_COVER = "https://images.unsplash.com/photo-1511081692775-05d0f180a065?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNTl8MHwxfHNlYXJjaHwxfHxhZXN0aGV0aWMlMjBjYWZlJTIwaW50ZXJpb3J8ZW58MHx8fHwxNzkwMjcxMjM2fDA&ixlib=rb-4.1.0&q=85";

export default function ProfileTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const profile = useQuery({
    queryKey: ["profile", user?.username],
    queryFn: () => api.get(`/users/${user?.username}`),
    enabled: !!user?.username,
  });

  useFocusEffect(React.useCallback(() => { profile.refetch(); }, []));

  const data = profile.data;

  const Header = (
    <View>
      <View style={styles.coverWrap}>
        <Image source={{ uri: fileUrl(data?.cover) || DEFAULT_COVER }} style={styles.cover} contentFit="cover" />
        <LinearGradient colors={["rgba(0,0,0,0.35)", "transparent", "rgba(0,0,0,0.15)"]} style={styles.coverScrim} />
        <View style={[styles.coverActions, { top: insets.top + spacing.xs }]}>
          <Pressable style={styles.coverBtn} onPress={() => router.push("/settings")} testID="profile-settings">
            <Icon name="settings-outline" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={styles.infoWrap}>
        <View style={styles.avatarRow}>
          <View style={styles.avatarBorder}>
            <Avatar uri={data?.avatar} name={data?.full_name} size={92} />
          </View>
          <View style={styles.headerBtns}>
            <Pressable style={styles.outlineBtn} onPress={() => router.push("/edit-profile")} testID="profile-edit">
              <Icon name="pencil" size={16} color={colors.onSurface} />
              <Text style={styles.outlineBtnText}>Edit</Text>
            </Pressable>
            <Pressable style={styles.outlineBtn} onPress={() => router.push("/qr")} testID="profile-share">
              <Icon name="qr-code-outline" size={16} color={colors.onSurface} />
              <Text style={styles.outlineBtnText}>Share</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.nameRow}>
          <Text style={styles.name}>{data?.full_name}</Text>
          {data?.verified && <BlueTick size={20} />}
        </View>
        <Text style={styles.username}>glint.app/{data?.username}</Text>
        {!!data?.bio && <Text style={styles.bio}>{data.bio}</Text>}
        {!!data?.location && (
          <View style={styles.locationRow}>
            <Icon name="location-outline" size={15} color={colors.muted} />
            <Text style={styles.location}>{data.location}</Text>
          </View>
        )}

        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{data?.counts?.posts ?? 0}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statDivider} />
          <Pressable
            style={styles.stat}
            onPress={() => data?.id && router.push(`/follows?mode=followers&userId=${data.id}&username=${encodeURIComponent(data.username || "")}`)}
            testID="profile-followers"
          >
            <Text style={styles.statNum}>{data?.counts?.followers ?? 0}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </Pressable>
          <View style={styles.statDivider} />
          <Pressable
            style={styles.stat}
            onPress={() => data?.id && router.push(`/follows?mode=following&userId=${data.id}&username=${encodeURIComponent(data.username || "")}`)}
            testID="profile-following"
          >
            <Text style={styles.statNum}>{data?.counts?.following ?? 0}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </Pressable>
        </View>

        <View style={styles.secondaryStats}>
          <View style={styles.secondaryStat}>
            <Text style={styles.secondaryNum}>{data?.counts?.friends ?? 0}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
          <Pressable style={styles.secondaryStat} onPress={() => router.push("/inner-circle")} testID="profile-sparks">
            <Text style={[styles.secondaryNum, { color: colors.brandSecondary }]}>🪙 {user?.sparks ?? 0}</Text>
            <Text style={styles.statLabel}>Sparks</Text>
          </Pressable>
        </View>

        <Text style={styles.postsHeader}>Posts</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {profile.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : (
        <FlatList
          data={data?.posts || []}
          keyExtractor={(p) => p.id}
          ListHeaderComponent={Header}
          renderItem={({ item }) => <View style={{ paddingHorizontal: spacing.lg }}><PostCard post={item} onChanged={() => profile.refetch()} /></View>}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          contentContainerStyle={{ paddingBottom: bottomChrome + 40 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyPosts}>
              <Icon name="grid-outline" size={44} color={colors.muted} />
              <Text style={styles.emptyText}>No posts yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  coverWrap: { width: "100%", height: 200 },
  cover: { width: "100%", height: "100%", backgroundColor: c.surfaceTertiary },
  coverScrim: { ...({ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any) },
  coverActions: { position: "absolute", right: spacing.lg, flexDirection: "row", gap: spacing.sm },
  coverBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  infoWrap: { paddingHorizontal: spacing.lg, marginTop: -46 },
  avatarRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  avatarBorder: { padding: 4, borderRadius: 54, backgroundColor: c.surface },
  headerBtns: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  outlineBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  outlineBtnText: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 14 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.md },
  name: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 24 },
  username: { color: c.brand, fontFamily: fonts.medium, fontSize: 14, marginTop: 2 },
  bio: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 15, lineHeight: 22, marginTop: spacing.md },
  locationRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  location: { color: c.muted, fontFamily: fonts.text, fontSize: 14 },
  stats: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg },
  stat: { flex: 1, alignItems: "center" },
  statNum: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 22 },
  statLabel: { color: c.muted, fontFamily: fonts.text, fontSize: 13 },
  statDivider: { width: 1, height: 30, backgroundColor: c.border },
  secondaryStats: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  secondaryStat: { flex: 1, alignItems: "center", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingVertical: spacing.sm },
  secondaryNum: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 17 },
  postsHeader: { color: c.onSurface, fontFamily: fonts.display, fontSize: 18, marginTop: spacing.xl, marginBottom: spacing.md },
  emptyPosts: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15 },
}));
