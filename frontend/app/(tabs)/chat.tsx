import React from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { timeAgo } from "@/src/lib/time";
import { usesNativeTabs } from "@/src/navigation";
import { useFocusEffect } from "expo-router";

export default function ChatList() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const convos = useQuery({ queryKey: ["conversations"], queryFn: () => api.get("/chat/conversations") });

  useFocusEffect(
    React.useCallback(() => {
      convos.refetch();
      api.post("/chat/heartbeat").catch(() => {});
    }, [])
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <Pressable onPress={() => router.push("/(tabs)/friends")} style={styles.newBtn} testID="chat-new">
          <Icon name="create-outline" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      {convos.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={convos.data || []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + 24 }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/chat/${item.user.id}`)} testID={`convo-${item.user.username}`}>
              <View>
                <Avatar uri={item.user.avatar} name={item.user.full_name} size={56} />
                {item.online && <View style={styles.onlineDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <UserName name={item.user.full_name} verified={item.user.verified} size={15} />
                  <Text style={styles.time}>{timeAgo(item.updated_at)}</Text>
                </View>
                <View style={styles.rowBottom}>
                  <Text style={[styles.preview, item.unread > 0 && { color: colors.onSurface, fontFamily: fonts.semibold }]} numberOfLines={1}>
                    {item.last_message || "Say hi 👋"}
                  </Text>
                  <View style={styles.rowBottomRight}>
                    {item.muted && <Icon name="notifications-off" size={14} color={colors.muted} />}
                    {item.unread > 0 && <View style={styles.unread}><Text style={styles.unreadText}>{item.unread}</Text></View>}
                  </View>
                </View>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="chatbubbles-outline" size={56} color={colors.muted} />
              <Text style={styles.emptyText}>No conversations yet. Message a friend to start chatting!</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 26 },
  newBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  onlineDot: { position: "absolute", bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: c.success, borderWidth: 2, borderColor: c.surface },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  time: { color: c.muted, fontFamily: fonts.text, fontSize: 12 },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 3 },
  rowBottomRight: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  preview: { flex: 1, color: c.muted, fontFamily: fonts.text, fontSize: 14, marginRight: spacing.sm },
  unread: { backgroundColor: c.brandPrimary, minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  unreadText: { color: c.onBrandPrimary, fontFamily: fonts.semibold, fontSize: 11 },
  empty: { alignItems: "center", gap: spacing.md, paddingTop: spacing["3xl"], paddingHorizontal: spacing.xl },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15, textAlign: "center" },
}));
