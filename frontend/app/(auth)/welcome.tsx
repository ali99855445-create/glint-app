import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, fonts, spacing, radius } from "@/src/theme";
import { Button } from "@/src/components/ui";

export default function Welcome() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#171511", "#0B0B0A", "#000000"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.brandTop}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>G</Text>
          </View>
          <Text style={styles.brand}>Glint</Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.headline}>Your world,{"\n"}beautifully connected.</Text>
          <Text style={styles.sub}>Share moments, spark conversations, and shine with the community you love.</Text>
        </View>

        <View style={styles.actions}>
          <Button title="Create account" onPress={() => router.push("/(auth)/register")} testID="welcome-create-account" />
          <Pressable style={styles.loginBtn} onPress={() => router.push("/(auth)/login")} testID="welcome-login">
            <Text style={styles.loginText}>I already have an account</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: "#000000" },
  content: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: "space-between", paddingVertical: spacing.xl },
  brandTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoBadge: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  logoText: { color: c.onBrandPrimary, fontFamily: fonts.displayBold, fontSize: 24 },
  brand: { color: "#FFFFFF", fontFamily: fonts.displayBold, fontSize: 26 },
  hero: { gap: spacing.md, marginTop: "auto", marginBottom: spacing["3xl"] },
  headline: { color: "#FFFFFF", fontFamily: fonts.displayBold, fontSize: 40, lineHeight: 46 },
  sub: { color: "rgba(255,255,255,0.82)", fontFamily: fonts.text, fontSize: 16, lineHeight: 23 },
  actions: { gap: spacing.md, marginBottom: spacing.md },
  loginBtn: { alignItems: "center", paddingVertical: spacing.md },
  loginText: { color: "#FFFFFF", fontFamily: fonts.semibold, fontSize: 15 },
}));
