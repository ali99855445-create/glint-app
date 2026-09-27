import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme } from "@/src/theme";

export default function SharedProfileLink() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (username) router.replace(`/user/${username}` as any);
  }, [username, router]);

  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><ActivityIndicator color={colors.brandPrimary} /></View>;
}
