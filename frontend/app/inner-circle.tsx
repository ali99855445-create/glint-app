import React from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";

export default function InnerCircle() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const circle = useQuery({ queryKey: ["inner-circle"], queryFn: () => api.get("/inner-circle") });
  const friends = useQuery({ queryKey: ["friends"], queryFn: () => api.get("/friends") });
  useFocusEffect(React.useCallback(() => { circle.refetch(); }, []));

  const circleIds = new Set((circle.data || []).map((u: any) => u.id));

  const add = useMutation({
    mutationFn: (id: string) => api.post(`/inner-circle/${id}`),
    onSuccess: () => { circle.refetch(); qc.invalidateQueries({ queryKey: ["stories"] }); },
    onError: (e: any) => toast.show(e.message, "error"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/inner-circle/${id}`),
    onSuccess: () => { circle.refetch(); qc.invalidateQueries({ queryKey: ["stories"] }); },
  });

  const available = (friends.data || []).filter((f: any) => !circleIds.has(f.id));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="inner-back">
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Inner Circle</Text>
        <View style={{ width: 40 }} />
      </View>

      {circle.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={available}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.sm }}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
              <View style={styles.hero}>
                <View style={styles.starBadge}><Icon name="star" size={26} color={colors.onBrandSecondary} /></View>
                <Text style={styles.heroText}>Pick up to 10 closest friends. Share posts &amp; stories just with your Inner Circle — they&apos;ll see a golden star ring.</Text>
              </View>
              <Text style={styles.sectionTitle}>Your Inner Circle · {circleIds.size}/10</Text>
              {(circle.data || []).length === 0 ? (
                <Text style={styles.emptyInline}>No one yet. Add friends below.</Text>
              ) : (
                (circle.data || []).map((u: any) => (
                  <View key={u.id} style={styles.row}>
                    <Avatar uri={u.avatar} name={u.full_name} size={48} ring />
                    <View style={{ flex: 1 }}>
                      <UserName name={u.full_name} verified={u.verified} size={15} />
                      <Text style={styles.username}>@{u.username}</Text>
                    </View>
                    <Pressable style={styles.removeBtn} onPress={() => remove.mutate(u.id)} testID={`inner-remove-${u.username}`}>
                      <Icon name="star" size={20} color={colors.brandSecondary} />
                    </Pressable>
                  </View>
                ))
              )}
              <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>Add friends</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Avatar uri={item.avatar} name={item.full_name} size={48} />
              <View style={{ flex: 1 }}>
                <UserName name={item.full_name} verified={item.verified} size={15} />
                <Text style={styles.username}>@{item.username}</Text>
              </View>
              <Pressable style={styles.addBtn} onPress={() => add.mutate(item.id)} testID={`inner-add-${item.username}`}>
                <Icon name="star-outline" size={20} color={colors.muted} />
              </Pressable>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyInline}>Add more friends to grow your Inner Circle.</Text>}
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
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.brandTertiary, borderRadius: radius.md, padding: spacing.lg },
  starBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  heroText: { flex: 1, color: c.onBrandTertiary, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  sectionTitle: { color: c.muted, fontFamily: fonts.semibold, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 },
  emptyInline: { color: c.muted, fontFamily: fonts.text, fontSize: 14, paddingVertical: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  username: { color: c.muted, fontFamily: fonts.text, fontSize: 13, marginTop: 2 },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  removeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.brandTertiary },
}));
