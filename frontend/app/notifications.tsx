import React from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { timeAgo } from "@/src/lib/time";

const TYPE_ICON: Record<string, { icon: any; colorKey: string }> = {
  reaction: { icon: "heart", colorKey: "error" },
  comment: { icon: "chatbubble", colorKey: "brandPrimary" },
  friend_request: { icon: "person-add", colorKey: "brandSecondary" },
  friend_accept: { icon: "people", colorKey: "success" },
  spark: { icon: "sparkles", colorKey: "brandSecondary" },
  message: { icon: "paper-plane", colorKey: "brandPrimary" },
};

export default function Notifications() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const notifs = useQuery({ queryKey: ["notifications"], queryFn: () => api.get("/notifications") });

  const readAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => {
      notifs.refetch();
      qc.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

  useFocusEffect(
    React.useCallback(() => {
      const t = setTimeout(() => readAll.mutate(), 1200);
      return () => clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  function open(n: any) {
    switch (n.type) {
      case "reaction":
      case "comment":
      case "spark":
        if (n.ref_id) return router.push(`/post/${n.ref_id}`);
        break;
      case "friend_request":
        return router.push("/(tabs)/friends");
      case "friend_accept":
        return n.actor?.username ? router.push(`/user/${n.actor.username}`) : router.push("/(tabs)/friends");
      case "message":
        return router.push(`/chat/${n.ref_id}`);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="notif-back">
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Activity</Text>
        <View style={{ width: 40 }} />
      </View>

      {notifs.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={notifs.data || []}
          keyExtractor={(n) => n.id}
          refreshControl={<RefreshControl refreshing={notifs.isRefetching} onRefresh={() => notifs.refetch()} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => {
            const meta = TYPE_ICON[item.type] || TYPE_ICON.message;
            const tint = (colors as any)[meta.colorKey];
            return (
              <Pressable style={[styles.row, !item.read && styles.rowUnread]} onPress={() => open(item)} testID={`notif-${item.id}`}>
                <View>
                  <Avatar uri={item.actor?.avatar} name={item.actor?.full_name} size={48} />
                  <View style={[styles.typeBadge, { backgroundColor: tint }]}>
                    <Icon name={meta.icon} size={12} color="#FFFFFF" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.text}>{item.text}</Text>
                  <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                </View>
                {!item.read && <View style={styles.dot} />}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="notifications-outline" size={56} color={colors.muted} />
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptyText}>New reactions, comments and friend activity will appear here.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  rowUnread: { backgroundColor: c.brandTertiary },
  typeBadge: { position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.surface },
  text: { color: c.onSurface, fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  time: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.brandPrimary },
  empty: { alignItems: "center", gap: spacing.sm, paddingTop: spacing["3xl"], paddingHorizontal: spacing.xl },
  emptyTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 20 },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15, textAlign: "center", lineHeight: 22 },
}));
