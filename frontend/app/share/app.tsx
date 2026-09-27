import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/src/theme";

export default function SharedAppLink() {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    router.replace("/(tabs)" as any);
  }, [router]);

  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}><ActivityIndicator color={colors.brandPrimary} /></View>;
}
