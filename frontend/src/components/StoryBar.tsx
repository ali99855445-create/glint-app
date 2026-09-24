import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { makeStyles, useTheme, fonts, spacing } from "@/src/theme";
import { Avatar } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { useAuth } from "@/src/context/AuthContext";

export function StoryBar({ groups }: { groups: any[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const mine = groups.find((g) => g.is_mine);
  const others = groups.filter((g) => !g.is_mine);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {/* your story / add */}
      <Pressable
        style={styles.item}
        testID="story-add"
        onPress={() => (mine ? router.push(`/story/${user?.id}`) : router.push("/story/create"))}
      >
        <View style={styles.ringWrap}>
          {mine && mine.has_unseen ? (
            <LinearGradient colors={[colors.brandPrimary, colors.brandSecondary]} style={styles.ring}>
              <View style={styles.inner}><Avatar uri={user?.avatar} name={user?.full_name} size={58} /></View>
            </LinearGradient>
          ) : (
            <View style={[styles.ring, { backgroundColor: colors.surfaceTertiary }]}>
              <View style={styles.inner}><Avatar uri={user?.avatar} name={user?.full_name} size={58} /></View>
            </View>
          )}
          <Pressable style={styles.addBadge} onPress={() => router.push("/story/create")} testID="story-add-badge">
            <Icon name="add" size={16} color={colors.onBrandPrimary} />
          </Pressable>
        </View>
        <Text style={styles.name} numberOfLines={1}>Your story</Text>
      </Pressable>

      {others.map((g) => (
        <Pressable key={g.author.id} style={styles.item} testID={`story-${g.author.username}`} onPress={() => router.push(`/story/${g.author.id}`)}>
          <View style={styles.ringWrap}>
            {g.has_unseen ? (
              <LinearGradient colors={[colors.brandPrimary, colors.brandSecondary, colors.error]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
                <View style={styles.inner}><Avatar uri={g.author.avatar} name={g.author.full_name} size={58} /></View>
              </LinearGradient>
            ) : (
              <View style={[styles.ring, { backgroundColor: colors.border }]}>
                <View style={styles.inner}><Avatar uri={g.author.avatar} name={g.author.full_name} size={58} /></View>
              </View>
            )}
          </View>
          <Text style={styles.name} numberOfLines={1}>{g.author.full_name?.split(" ")[0]}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  row: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingVertical: spacing.sm },
  item: { alignItems: "center", width: 72, gap: spacing.xs },
  ringWrap: { width: 70, height: 70 },
  ring: { width: 70, height: 70, borderRadius: 35, alignItems: "center", justifyContent: "center" },
  inner: { width: 62, height: 62, borderRadius: 31, backgroundColor: c.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  addBadge: { position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.surface },
  name: { color: c.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 12, maxWidth: 68 },
}));
