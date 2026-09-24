import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme, fonts, spacing } from "@/src/theme";
import { Button, Field } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";

export default function Forgot() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { loginWithToken } = useAuth();

  const [stage, setStage] = useState<"request" | "reset">("request");
  const [contact, setContact] = useState("");
  const [userId, setUserId] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestCode() {
    if (!contact.trim()) return toast.show("Enter your email, phone or username", "error");
    setLoading(true);
    try {
      const res = await api.post("/auth/forgot", { contact: contact.trim() });
      setUserId(res.user_id);
      setStage("reset");
      toast.show(`Reset code: ${res.dev_otp}`, "info");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function reset() {
    if (code.trim().length < 6 || password.length < 6) return toast.show("Enter the code and a new 6+ char password", "error");
    setLoading(true);
    try {
      const res = await api.post("/auth/reset", { user_id: userId, code: code.trim(), password });
      await loginWithToken(res.token, res.user);
      toast.show("Password reset!", "success");
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
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="forgot-back">
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
      </View>
      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>We&apos;ll send a verification code to reset your password.</Text>

        {stage === "request" ? (
          <>
            <Field value={contact} onChangeText={setContact} placeholder="Email, phone or username" autoCapitalize="none" testID="forgot-contact"
              icon={<Icon name="person-outline" size={20} color={colors.muted} />} />
            <Button title="Send reset code" onPress={requestCode} loading={loading} testID="forgot-send" />
          </>
        ) : (
          <>
            <Field value={code} onChangeText={setCode} placeholder="6-digit code" keyboardType="number-pad" testID="forgot-code"
              icon={<Icon name="keypad-outline" size={20} color={colors.muted} />} />
            <Field value={password} onChangeText={setPassword} placeholder="New password" secureTextEntry testID="forgot-new-password"
              icon={<Icon name="lock-closed-outline" size={20} color={colors.muted} />} />
            <Button title="Reset password" onPress={reset} loading={loading} testID="forgot-reset" />
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: spacing.lg },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.lg },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 30 },
  subtitle: { color: c.muted, fontFamily: fonts.text, fontSize: 15, lineHeight: 22, marginTop: -spacing.md },
}));
