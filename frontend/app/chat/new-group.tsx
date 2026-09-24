import React, { useState } from "react";
import { View, Text, Pressable, FlatList, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";

export default function NewGroup() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const friends = useQuery({ queryKey: ["friends"], queryFn: () => api.get("/friends") });

  const create = useMutation({
    mutationFn: () => api.post("/chat/groups", { name: name.trim(), member_ids: selected }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      router.replace(`/chat/group/${d.id}`);
    },
    onError: (e: any) => toast.show(e.message, "error"),
  });

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const canCreate = name.trim().length > 0 && selected.length >= 2;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="group-back">
          <Icon name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>New Group</Text>
        <Pressable onPress={() => canCreate && create.mutate()} disabled={!canCreate || create.isPending} testID="group-create">
          {create.isPending ? <ActivityIndicator color={colors.brand} /> : <Text style={[styles.create, { opacity: canCreate ? 1 : 0.4 }]}>Create</Text>}
        </Pressable>
      </View>

      <View style={styles.nameWrap}>
        <View style={styles.groupIcon}><Icon name="people" size={26} color={colors.onBrandPrimary} /></View>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Group name"
          placeholderTextColor={colors.muted}
          style={styles.nameInput}
          testID="group-name"
        />
      </View>

      <Text style={styles.sectionHint}>Add friends {selected.length > 0 ? `· ${selected.length} selected` : ""}</Text>

      {friends.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={friends.data || []}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.sm }}
          renderItem={({ item }) => {
            const on = selected.includes(item.id);
            return (
              <Pressable style={styles.row} onPress={() => toggle(item.id)} testID={`group-select-${item.username}`}>
                <Avatar uri={item.avatar} name={item.full_name} size={48} />
                <View style={{ flex: 1 }}>
                  <UserName name={item.full_name} verified={item.verified} size={15} />
                  <Text style={styles.username}>@{item.username}</Text>
                </View>
                <View style={[styles.check, on && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
                  {on && <Icon name="checkmark" size={16} color={colors.onBrandPrimary} />}
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="people-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>Add friends first to start a group chat.</Text>
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
  create: { color: c.brand, fontFamily: fonts.displayBold, fontSize: 16 },
  nameWrap: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  groupIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  nameInput: { flex: 1, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: c.onSurface, fontFamily: fonts.medium, fontSize: 16 },
  sectionHint: { color: c.muted, fontFamily: fonts.semibold, fontSize: 13, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  username: { color: c.muted, fontFamily: fonts.text, fontSize: 13, marginTop: 2 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: spacing.md, paddingTop: spacing["3xl"] },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15, textAlign: "center", paddingHorizontal: spacing.xl },
}));
