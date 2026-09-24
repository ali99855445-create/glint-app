import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { Button, Field } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";

export default function Login() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { loginWithToken } = useAuth();

  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    if (!contact.trim() || !password) {
      toast.show("Enter your details", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { contact: contact.trim(), password });
      await loginWithToken(res.token, res.user);
      router.replace("/(tabs)");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="login-back">
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
        <View style={styles.logoBadge}><Text style={styles.logoText}>G</Text></View>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Log in to your Glint account.</Text>

        <Field value={contact} onChangeText={setContact} placeholder="Email, phone or username" autoCapitalize="none" testID="login-contact"
          icon={<Icon name="person-outline" size={20} color={colors.muted} />} />
        <Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry testID="login-password"
          icon={<Icon name="lock-closed-outline" size={20} color={colors.muted} />} />

        <Pressable onPress={() => router.push("/(auth)/forgot")} testID="login-forgot">
          <Text style={styles.forgot}>Forgot password?</Text>
        </Pressable>

        <Button title="Log in" onPress={login} loading={loading} testID="login-submit" style={{ marginTop: spacing.sm }} />

        <View style={styles.bottomRow}>
          <Text style={styles.bottomText}>New to Glint? </Text>
          <Pressable onPress={() => router.replace("/(auth)/register")} testID="login-goto-register">
            <Text style={styles.link}>Create account</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.lg },
  logoBadge: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  logoText: { color: c.onBrandPrimary, fontFamily: fonts.displayBold, fontSize: 32 },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 30 },
  subtitle: { color: c.muted, fontFamily: fonts.text, fontSize: 15, marginTop: -spacing.md },
  forgot: { color: c.brand, fontFamily: fonts.semibold, fontSize: 14, textAlign: "right" },
  bottomRow: { flexDirection: "row", justifyContent: "center", marginTop: spacing.md },
  bottomText: { color: c.muted, fontFamily: fonts.text, fontSize: 15 },
  link: { color: c.brand, fontFamily: fonts.semibold, fontSize: 15 },
}));
