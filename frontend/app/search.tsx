import React, { useState, useEffect } from "react";
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";

export default function Search() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 350);
    return () => clearTimeout(t);
  }, [q]);

  const results = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.get(`/users/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length > 0,
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.searchBar}>
        <Pressable onPress={() => router.back()} testID="search-back"><Icon name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <View style={styles.inputWrap}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search people"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoFocus
            testID="search-input"
          />
          {q.length > 0 && <Pressable onPress={() => setQ("")} testID="search-clear"><Icon name="close-circle" size={18} color={colors.muted} /></Pressable>}
        </View>
      </View>

      {results.isFetching ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={results.data || []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/user/${item.username}`)} testID={`search-result-${item.username}`}>
              <Avatar uri={item.avatar} name={item.full_name} size={48} />
              <View style={{ flex: 1 }}>
                <UserName name={item.full_name} verified={item.verified} size={15} />
                <Text style={styles.username}>@{item.username}</Text>
              </View>
              <Icon name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          )}
          ListEmptyComponent={
            debounced.trim() ? (
              <View style={styles.empty}><Text style={styles.emptyText}>No people found for &quot;{debounced}&quot;</Text></View>
            ) : (
              <View style={styles.empty}><Icon name="search" size={48} color={colors.muted} /><Text style={styles.emptyText}>Search for friends by name or username</Text></View>
            )
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  searchBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  inputWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  input: { flex: 1, color: c.onSurface, fontFamily: fonts.text, fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  username: { color: c.muted, fontFamily: fonts.text, fontSize: 13, marginTop: 2 },
  empty: { alignItems: "center", gap: spacing.md, paddingTop: spacing["3xl"] },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15, textAlign: "center", paddingHorizontal: spacing.xl },
}));
