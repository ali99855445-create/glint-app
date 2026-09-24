import React, { useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { usesNativeTabs } from "@/src/navigation";

const TABS = [
  { key: "friends", label: "Friends" },
  { key: "requests", label: "Requests" },
  { key: "discover", label: "Discover" },
];

export default function Friends() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("friends");
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const friends = useQuery({ queryKey: ["friends"], queryFn: () => api.get("/friends") });
  const requests = useQuery({ queryKey: ["friend-requests"], queryFn: () => api.get("/friends/requests") });
  const suggestions = useQuery({ queryKey: ["suggestions"], queryFn: () => api.get("/friends/suggestions") });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["friends"] });
    qc.invalidateQueries({ queryKey: ["friend-requests"] });
    qc.invalidateQueries({ queryKey: ["suggestions"] });
  };

  const sendReq = useMutation({ mutationFn: (id: string) => api.post(`/friends/request/${id}`), onSuccess: () => { toast.show("Request sent", "success"); invalidateAll(); } });
  const accept = useMutation({ mutationFn: (id: string) => api.post(`/friends/accept/${id}`), onSuccess: () => { toast.show("Friend added!", "success"); invalidateAll(); } });
  const reject = useMutation({ mutationFn: (id: string) => api.post(`/friends/reject/${id}`), onSuccess: invalidateAll });

  const requestCount = (requests.data?.incoming?.length || 0);

  function renderUserRow(u: any, action: React.ReactNode) {
    return (
      <Pressable style={styles.row} onPress={() => router.push(`/user/${u.username}`)} testID={`user-row-${u.username}`}>
        <Avatar uri={u.avatar} name={u.full_name} size={52} />
        <View style={{ flex: 1 }}>
          <UserName name={u.full_name} verified={u.verified} size={15} />
          <Text style={styles.username}>@{u.username}</Text>
        </View>
        {action}
      </Pressable>
    );
  }

  const loading = friends.isLoading || requests.isLoading || suggestions.isLoading;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>People</Text>
        <Pressable onPress={() => router.push("/search")} style={styles.searchBtn} testID="friends-search">
          <Icon name="search" size={20} color={colors.onSurface} />
        </Pressable>
      </View>

      <View style={styles.segment}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.segItem, tab === t.key && { backgroundColor: colors.brandPrimary }]} testID={`friends-tab-${t.key}`}>
            <Text style={[styles.segText, { color: tab === t.key ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>{t.label}</Text>
            {t.key === "requests" && requestCount > 0 && (
              <View style={styles.badge}><Text style={styles.badgeText}>{requestCount}</Text></View>
            )}
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : tab === "friends" ? (
        <FlatList
          data={friends.data || []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: bottomChrome + 24, gap: spacing.sm }}
          renderItem={({ item }) => renderUserRow(item, (
            <Button title="Message" small variant="secondary" onPress={() => router.push(`/chat/${item.id}`)} testID={`friend-message-${item.username}`} />
          ))}
          ListEmptyComponent={<EmptyState icon="people-outline" text="No friends yet. Discover people to connect with!" />}
        />
      ) : tab === "requests" ? (
        <FlatList
          data={requests.data?.incoming || []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: bottomChrome + 24, gap: spacing.sm }}
          renderItem={({ item }) => renderUserRow(item, (
            <View style={{ flexDirection: "row", gap: spacing.xs }}>
              <Pressable style={[styles.circleBtn, { backgroundColor: colors.brandPrimary }]} onPress={() => accept.mutate(item.id)} testID={`accept-${item.username}`}>
                <Icon name="checkmark" size={20} color={colors.onBrandPrimary} />
              </Pressable>
              <Pressable style={[styles.circleBtn, { backgroundColor: colors.surfaceTertiary }]} onPress={() => reject.mutate(item.id)} testID={`reject-${item.username}`}>
                <Icon name="close" size={20} color={colors.onSurfaceTertiary} />
              </Pressable>
            </View>
          ))}
          ListEmptyComponent={<EmptyState icon="mail-open-outline" text="No pending friend requests." />}
        />
      ) : (
        <FlatList
          data={suggestions.data || []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: bottomChrome + 24, gap: spacing.sm }}
          ListHeaderComponent={<Text style={styles.sectionHint}>People you may know</Text>}
          renderItem={({ item }) => renderUserRow(item, (
            <Button title="Add" small onPress={() => sendReq.mutate(item.id)} testID={`add-${item.username}`} />
          ))}
          ListEmptyComponent={<EmptyState icon="sparkles-outline" text="No suggestions right now. Check back soon!" />}
        />
      )}
    </View>
  );
}

function EmptyState({ icon, text }: { icon: any; text: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={56} color={colors.muted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 26 },
  searchBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 4, marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  segItem: { flex: 1, flexDirection: "row", gap: spacing.xs, alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm, borderRadius: radius.sm },
  segText: { fontFamily: fonts.semibold, fontSize: 14 },
  badge: { backgroundColor: c.error, minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: c.onError, fontFamily: fonts.semibold, fontSize: 11 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  username: { color: c.muted, fontFamily: fonts.text, fontSize: 13, marginTop: 2 },
  circleBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sectionHint: { color: c.muted, fontFamily: fonts.medium, fontSize: 13, marginBottom: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: spacing.md, paddingTop: spacing["3xl"] },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15, textAlign: "center", paddingHorizontal: spacing.xl },
}));
