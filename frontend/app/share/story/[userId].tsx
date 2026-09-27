import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/src/theme";

export default function SharedStoryLink() {
  const { userId, storyId } = useLocalSearchParams<{ userId: string; storyId?: string }>();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (!userId) return;
    const suffix = storyId ? `?storyId=${encodeURIComponent(storyId)}` : "";
    router.replace(`/story/${userId}${suffix}` as any);
  }, [userId, storyId, router]);

  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><ActivityIndicator color={colors.brandPrimary} /></View>;
}
