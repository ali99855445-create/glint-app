import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { Field, Button } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { api, ADMIN_TOKEN_KEY } from "@/src/api/client";
import { storage } from "@/src/utils/storage";

export default function AdminLogin() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    try {
      const res = await api.post("/admin/login", { email: email.trim(), password });
      await storage.secureSet(ADMIN_TOKEN_KEY, res.token);
      router.replace("/admin");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="admin-login-back"><Icon name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
        <View style={styles.badge}><Icon name="shield-checkmark" size={40} color={colors.onBrandPrimary} /></View>
        <Text style={styles.title}>Admin Control Panel</Text>
        <Text style={styles.subtitle}>Restricted access. Authorised personnel only.</Text>

        <Field value={email} onChangeText={setEmail} placeholder="Admin email" autoCapitalize="none" keyboardType="email-address" testID="admin-email" icon={<Icon name="mail-outline" size={20} color={colors.muted} />} />
        <Field value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry testID="admin-password" icon={<Icon name="lock-closed-outline" size={20} color={colors.muted} />} />
        <Button title="Access dashboard" onPress={login} loading={loading} testID="admin-login-submit" />
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.lg },
  badge: { width: 72, height: 72, borderRadius: radius.lg, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 28 },
  subtitle: { color: c.muted, fontFamily: fonts.text, fontSize: 15, marginTop: -spacing.md },
}));
