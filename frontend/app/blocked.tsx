import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";

export default function Blocked() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const blocked = useQuery({ queryKey: ["blocked"], queryFn: () => api.get("/users/me/blocked") });
  const unblock = useMutation({ mutationFn: (id: string) => api.post(`/users/${id}/unblock`), onSuccess: () => { toast.show("Unblocked", "success"); blocked.refetch(); } });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="blocked-back"><Icon name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Blocked Users</Text>
        <View style={{ width: 40 }} />
      </View>

      {blocked.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={blocked.data || []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar uri={item.avatar} name={item.full_name} size={48} />
              <View style={{ flex: 1 }}>
                <UserName name={item.full_name} verified={item.verified} size={15} />
                <Text style={styles.username}>@{item.username}</Text>
              </View>
              <Button title="Unblock" small variant="secondary" onPress={() => unblock.mutate(item.id)} testID={`unblock-${item.username}`} />
            </View>
          )}
          ListEmptyComponent={<View style={styles.empty}><Icon name="checkmark-circle-outline" size={48} color={colors.muted} /><Text style={styles.emptyText}>You haven&apos;t blocked anyone.</Text></View>}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  username: { color: c.muted, fontFamily: fonts.text, fontSize: 13, marginTop: 2 },
  empty: { alignItems: "center", gap: spacing.md, paddingTop: spacing["3xl"] },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15 },
}));
