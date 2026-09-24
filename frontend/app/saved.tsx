import React from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { PostCard } from "@/src/components/PostCard";
import { Icon } from "@/src/components/Icon";

export default function Saved() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const saved = useQuery({ queryKey: ["saved"], queryFn: () => api.get("/posts/saved/list") });
  useFocusEffect(React.useCallback(() => { saved.refetch(); }, []));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="saved-back">
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Saved Posts</Text>
        <View style={{ width: 40 }} />
      </View>

      {saved.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={saved.data || []}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <View style={{ paddingHorizontal: spacing.lg }}><PostCard post={item} onChanged={() => saved.refetch()} /></View>}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="bookmark-outline" size={56} color={colors.brandSecondary} />
              <Text style={styles.emptyTitle}>No saved posts yet</Text>
              <Text style={styles.emptyText}>Tap the bookmark on any post to save it here for later.</Text>
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
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: spacing.sm, paddingTop: spacing["3xl"], paddingHorizontal: spacing.xl },
  emptyTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 20 },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15, textAlign: "center", lineHeight: 22 },
}));
