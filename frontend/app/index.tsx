import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { useTheme } from "@/src/theme";

export default function Index() {
  const { loading, signedIn } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    if (signedIn) router.replace("/(tabs)");
    else router.replace("/(auth)/welcome");
  }, [loading, signedIn, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.brandPrimary} size="large" />
    </View>
  );
}
