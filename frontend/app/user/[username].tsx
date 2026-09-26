import React, { useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api, fileUrl } from "@/src/api/client";
import { Avatar, BlueTick } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { PostCard } from "@/src/components/PostCard";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { ReportModal } from "@/src/components/ReportModal";

const DEFAULT_COVER = "https://images.unsplash.com/photo-1511081692775-05d0f180a065?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNTl8MHwxfHNlYXJjaHwxfHxhZXN0aGV0aWMlMjBjYWZlJTIwaW50ZXJpb3J8ZW58MHx8fHwxNzkwMjcxMjM2fDA&ixlib=rb-4.1.0&q=85";

export default function UserProfile() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { username } = useLocalSearchParams<{ username: string }>();
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const profile = useQuery({ queryKey: ["profile", username], queryFn: () => api.get(`/users/${username}`) });
  const data = profile.data;

  const refetch = () => profile.refetch();

  const sendReq = useMutation({ mutationFn: () => api.post(`/friends/request/${data.id}`), onSuccess: () => { toast.show("Request sent", "success"); refetch(); } });
  const cancelReq = useMutation({ mutationFn: () => api.post(`/friends/cancel/${data.id}`), onSuccess: refetch });
  const accept = useMutation({ mutationFn: () => api.post(`/friends/accept/${data.id}`), onSuccess: () => { toast.show("Friend added!", "success"); refetch(); } });
  const unfriend = useMutation({ mutationFn: () => api.del(`/friends/${data.id}`), onSuccess: () => { toast.show("Removed", "success"); refetch(); } });
  const follow = useMutation({
    mutationFn: () => api.post(`/users/${data.id}/follow`),
    onSuccess: () => { toast.show("Following", "success"); refetch(); },
  });
  const unfollow = useMutation({
    mutationFn: () => api.del(`/users/${data.id}/follow`),
    onSuccess: () => { toast.show("Unfollowed", "success"); refetch(); },
  });
  const block = useMutation({ mutationFn: () => api.post(`/users/${data.id}/block`), onSuccess: () => { toast.show("User blocked", "success"); setMenu(false); refetch(); } });
  const toggleInner = useMutation({
    mutationFn: () => (data.is_inner ? api.del(`/inner-circle/${data.id}`) : api.post(`/inner-circle/${data.id}`)),
    onSuccess: () => { toast.show(data.is_inner ? "Removed from Inner Circle" : "Added to Inner Circle ⭐", "success"); setMenu(false); refetch(); },
    onError: (e: any) => { toast.show(e.message, "error"); setMenu(false); },
  });

  if (profile.isLoading || !data) {
    return <View style={[styles.root, styles.center]}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>;
  }

  if (data.is_me) {
    router.replace("/(tabs)/profile");
    return null;
  }

  const friendAction = () => {
    switch (data.friend_status) {
      case "friends":
        return <Button title="Friends" small variant="secondary" icon={<Icon name="checkmark" size={16} color={colors.onSurfaceTertiary} />} onPress={() => unfriend.mutate()} testID="unfriend-btn" />;
      case "outgoing":
        return <Button title="Requested" small variant="secondary" onPress={() => cancelReq.mutate()} testID="cancel-request-btn" />;
      case "incoming":
        return <Button title="Accept" small onPress={() => accept.mutate()} testID="accept-request-btn" />;
      default:
        return <Button title="Add friend" small onPress={() => sendReq.mutate()} testID="add-friend-btn" />;
    }
  };

  const Header = (
    <View>
      <View style={styles.coverWrap}>
        <Image source={{ uri: fileUrl(data.cover) || DEFAULT_COVER }} style={styles.cover} contentFit="cover" />
        <LinearGradient colors={["rgba(0,0,0,0.4)", "transparent"]} style={styles.coverScrim} />
        <View style={[styles.coverActions, { top: insets.top + spacing.xs }]}>
          <Pressable style={styles.coverBtn} onPress={() => router.back()} testID="user-back">
            <Icon name="chevron-back" size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable style={styles.coverBtn} onPress={() => setMenu((m) => !m)} testID="user-menu">
            <Icon name="ellipsis-horizontal" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
        {menu && (
          <View style={[styles.menu, { top: insets.top + 50 }]}>
            {data.friend_status === "friends" && (
              <Pressable style={styles.menuItem} onPress={() => toggleInner.mutate()} testID="user-inner-toggle">
                <Icon name={data.is_inner ? "star" : "star-outline"} size={18} color={colors.brandSecondary} />
                <Text style={[styles.menuText, { color: colors.brandSecondary }]}>{data.is_inner ? "Remove from Inner Circle" : "Add to Inner Circle"}</Text>
              </Pressable>
            )}
            <Pressable style={styles.menuItem} onPress={() => { setMenu(false); setReportOpen(true); }} testID="user-report">
              <Icon name="flag-outline" size={18} color={colors.error} />
              <Text style={[styles.menuText, { color: colors.error }]}>Report account</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => block.mutate()} testID="user-block">
              <Icon name="ban-outline" size={18} color={colors.error} />
              <Text style={[styles.menuText, { color: colors.error }]}>Block user</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.infoWrap}>
        <View style={styles.avatarRow}>
          <View style={styles.avatarBorder}><Avatar uri={data.avatar} name={data.full_name} size={92} /></View>
          <View style={styles.actionBtns}>
            <Button
              title={data.is_following ? "Following" : "Follow"}
              small
              variant={data.is_following ? "secondary" : "primary"}
              onPress={() => data.is_following ? unfollow.mutate() : follow.mutate()}
              loading={follow.isPending || unfollow.isPending}
              testID="user-follow"
            />
            {friendAction()}
            {data.friend_status === "friends" && (
              <Button title="Message" small variant="secondary" onPress={() => router.push(`/chat/${data.id}`)} testID="user-message" />
            )}
          </View>
        </View>

        <View style={styles.nameRow}>
          <Text style={styles.name}>{data.full_name}</Text>
          {data.verified && <BlueTick size={20} />}
        </View>
        <Text style={styles.username}>@{data.username}</Text>
        {!!data.bio && <Text style={styles.bio}>{data.bio}</Text>}
        {!!data.location && (
          <View style={styles.locationRow}><Icon name="location-outline" size={15} color={colors.muted} /><Text style={styles.location}>{data.location}</Text></View>
        )}

        {(data.email || data.phone) && (
          <View style={styles.contactCard}>
            <View style={styles.contactTitleRow}>
              <Icon name="lock-open-outline" size={16} color={colors.brand} />
              <Text style={styles.contactTitle}>Personal information</Text>
            </View>
            {!!data.email && (
              <View style={styles.contactRow}>
                <Icon name="mail-outline" size={16} color={colors.muted} />
                <Text style={styles.contactText}>{data.email}</Text>
              </View>
            )}
            {!!data.phone && (
              <View style={styles.contactRow}>
                <Icon name="call-outline" size={16} color={colors.muted} />
                <Text style={styles.contactText}>{data.phone}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.stats}>
          <View style={styles.stat}><Text style={styles.statNum}>{data.counts?.posts ?? 0}</Text><Text style={styles.statLabel}>Posts</Text></View>
          <View style={styles.statDivider} />
          <Pressable
            style={styles.stat}
            onPress={() => router.push(`/follows?mode=followers&userId=${data.id}&username=${encodeURIComponent(data.username || "")}`)}
            testID="user-followers"
          >
            <Text style={styles.statNum}>{data.counts?.followers ?? 0}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </Pressable>
          <View style={styles.statDivider} />
          <Pressable
            style={styles.stat}
            onPress={() => router.push(`/follows?mode=following&userId=${data.id}&username=${encodeURIComponent(data.username || "")}`)}
            testID="user-following"
          >
            <Text style={styles.statNum}>{data.counts?.following ?? 0}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </Pressable>
        </View>
        <View style={styles.friendCount}>
          <Text style={styles.friendCountNum}>{data.counts?.friends ?? 0}</Text>
          <Text style={styles.statLabel}>Friends</Text>
        </View>

        {!data.can_view && (
          <View style={styles.private}>
            <Icon name="lock-closed" size={28} color={colors.muted} />
            <Text style={styles.privateTitle}>This account is private</Text>
            <Text style={styles.privateSub}>{data.privacy === "only_me" ? "Only this user can see their posts." : "Become friends to see their posts."}</Text>
          </View>
        )}
        {data.can_view && <Text style={styles.postsHeader}>Posts</Text>}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={data.can_view ? data.posts : []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={Header}
        renderItem={({ item }) => <View style={{ paddingHorizontal: spacing.lg }}><PostCard post={item} onChanged={refetch} /></View>}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={data.can_view ? <View style={styles.emptyPosts}><Text style={styles.emptyText}>No posts yet</Text></View> : null}
      />
      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={data.id}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { alignItems: "center", justifyContent: "center" },
  coverWrap: { width: "100%", height: 200 },
  cover: { width: "100%", height: "100%", backgroundColor: c.surfaceTertiary },
  coverScrim: { ...({ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any) },
  coverActions: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", justifyContent: "space-between" },
  coverBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  menu: { position: "absolute", right: spacing.lg, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingVertical: spacing.xs, minWidth: 160, zIndex: 30 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  menuText: { fontFamily: fonts.medium, fontSize: 15 },
  infoWrap: { paddingHorizontal: spacing.lg, marginTop: -46 },
  avatarRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  avatarBorder: { padding: 4, borderRadius: 54, backgroundColor: c.surface },
  actionBtns: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: spacing.xs, marginBottom: spacing.sm, maxWidth: "72%" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.md },
  name: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 24 },
  username: { color: c.brand, fontFamily: fonts.medium, fontSize: 14, marginTop: 2 },
  bio: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 15, lineHeight: 22, marginTop: spacing.md },
  locationRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  location: { color: c.muted, fontFamily: fonts.text, fontSize: 14 },
  contactCard: { marginTop: spacing.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  contactTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  contactTitle: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 14 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  contactText: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14 },
  stats: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.lg },
  stat: { flex: 1, alignItems: "center" }, statNum: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 22 },
  statLabel: { color: c.muted, fontFamily: fonts.text, fontSize: 13 },
  statDivider: { width: 1, height: 30, backgroundColor: c.border },
  friendCount: { alignSelf: "flex-start", flexDirection: "row", alignItems: "baseline", gap: spacing.xs, marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  friendCountNum: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 14 },
  private: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing["2xl"], marginTop: spacing.lg },
  privateTitle: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 16 },
  privateSub: { color: c.muted, fontFamily: fonts.text, fontSize: 14 },
  postsHeader: { color: c.onSurface, fontFamily: fonts.display, fontSize: 18, marginTop: spacing.xl, marginBottom: spacing.md },
  emptyPosts: { alignItems: "center", paddingVertical: spacing.xl },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15 },
}));
