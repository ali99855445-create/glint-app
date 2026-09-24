import React from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { PostCard } from "@/src/components/PostCard";
import { Icon } from "@/src/components/Icon";

export default function GoldenFeed() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const feed = useQuery({ queryKey: ["golden-feed"], queryFn: () => api.get("/posts/golden") });
  useFocusEffect(React.useCallback(() => { feed.refetch(); }, []));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={[colors.brandSecondary, colors.brandPrimary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="golden-back">
          <Icon name="chevron-back" size={26} color={colors.onBrandSecondary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>✨ Golden Feed</Text>
          <Text style={styles.subtitle}>The most-loved posts of today&apos;s Golden Hour</Text>
        </View>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {feed.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : (
        <FlatList
          data={feed.data || []}
          keyExtractor={(p) => p.id}
          renderItem={({ item, index }) => (
            <View style={{ paddingHorizontal: spacing.lg }}>
              <View style={styles.rankRow}>
                <Text style={styles.rank}>#{index + 1}</Text>
              </View>
              <PostCard post={item} onChanged={() => feed.refetch()} />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: insets.bottom + spacing.xl }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="sparkles-outline" size={56} color={colors.brandSecondary} />
              <Text style={styles.emptyTitle}>No golden posts yet</Text>
              <Text style={styles.emptyText}>Post during the daily Golden Hour to land here and shine!</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  title: { color: c.onBrandSecondary, fontFamily: fonts.displayBold, fontSize: 20 },
  subtitle: { color: c.onBrandSecondary, fontFamily: fonts.text, fontSize: 12, opacity: 0.85, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  rankRow: { flexDirection: "row", marginBottom: spacing.xs },
  rank: { color: c.brandSecondary, fontFamily: fonts.displayBold, fontSize: 15 },
  empty: { alignItems: "center", gap: spacing.sm, paddingTop: spacing["3xl"], paddingHorizontal: spacing.xl },
  emptyTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 20 },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15, textAlign: "center", lineHeight: 22 },
}));
