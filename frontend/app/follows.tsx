import React from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { Button } from "@/src/components/ui";
import { useAuth } from "@/src/context/AuthContext";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { useToast } from "@/src/components/Toast";

export default function FollowsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ mode?: string; userId?: string; username?: string }>();
  const mode = params.mode === "following" ? "following" : "followers";
  const userId = params.userId || "";
  const username = params.username || "";

  const list = useQuery({
    queryKey: ["follows-list", userId, mode],
    queryFn: () => api.get(`/users/${userId}/${mode}`),
    enabled: !!userId,
  });

  const toggleFollow = useMutation({
    mutationFn: async (item: any) => {
      if (item.is_following) return api.del(`/users/${item.id}/follow`);
      return api.post(`/users/${item.id}/follow`);
    },
    onSuccess: (_data, item) => {
      toast.show(item.is_following ? "Unfollowed" : "Following", "success");
      list.refetch();
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: any) => toast.show(e.message || "Could not update follow", "error"),
  });

  const title = mode === "followers" ? "Followers" : "Following";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="chevron-back" size={25} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {!!username && <Text style={styles.subtitle}>@{username}</Text>}
        </View>
        <View style={{ width: 42 }} />
      </View>

      {list.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : list.isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Could not load {title.toLowerCase()}.</Text>
          <Button title="Try again" small onPress={() => list.refetch()} />
        </View>
      ) : (
        <FlatList
          data={list.data || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/user/${item.username}`)}>
              <Avatar uri={item.avatar} name={item.full_name} size={50} />
              <View style={{ flex: 1 }}>
                <UserName name={item.full_name} verified={item.verified} size={15} />
                <Text style={styles.username}>@{item.username}</Text>
              </View>
              {item.id !== user?.id && (
                <Button
                  title={item.is_following ? "Following" : "Follow"}
                  small
                  variant={item.is_following ? "secondary" : "primary"}
                  loading={toggleFollow.isPending && toggleFollow.variables?.id === item.id}
                  onPress={() => toggleFollow.mutate(item)}
                />
              )}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="people-outline" size={52} color={colors.muted} />
              <Text style={styles.emptyText}>No {title.toLowerCase()} yet.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border },
  backBtn: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 21, textAlign: "center" },
  subtitle: { color: c.muted, fontFamily: fonts.text, fontSize: 12, textAlign: "center", marginTop: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md },
  username: { color: c.muted, fontFamily: fonts.text, fontSize: 13, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  empty: { alignItems: "center", gap: spacing.md, paddingTop: spacing["3xl"] },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15, textAlign: "center" },
}));
