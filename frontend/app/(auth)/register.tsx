import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { Button, Field } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { api, fileUrl } from "@/src/api/client";
import { pickAndUploadImage } from "@/src/lib/media";

const TOTAL = 5;

export default function Register() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { loginWithToken, refresh } = useAuth();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // form
  const [agreed, setAgreed] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [userId, setUserId] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [success, setSuccess] = useState(false);

  const step1Valid = agreed && fullName.trim().length > 1 && username.trim().length >= 3;

  async function handleStep1() {
    setStep(2);
  }

  async function sendOtp() {
    if (!contact.trim() || password.length < 6) {
      toast.show("Enter a valid contact and a 6+ char password", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/auth/register-init", {
        full_name: fullName.trim(),
        username: username.trim(),
        method,
        contact: contact.trim(),
        password,
      });
      setUserId(res.user_id);
      setOtpSent(true);
      toast.show(`Verification code: ${res.dev_otp}`, "info");
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    try {
      const res = await api.post("/auth/verify-otp", { user_id: userId, code: otp.trim() });
      await loginWithToken(res.token, res.user);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setStep(3);
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function uploadAvatar() {
    const r = await pickAndUploadImage({ aspect: [1, 1] });
    if (r?.denied) return toast.show("Photo permission needed", "error");
    if (r?.url) {
      setAvatar(r.url);
      await api.put("/users/me", { avatar: r.url });
    }
  }

  async function uploadCover() {
    const r = await pickAndUploadImage({ aspect: [16, 9] });
    if (r?.denied) return toast.show("Photo permission needed", "error");
    if (r?.url) {
      setCover(r.url);
      await api.put("/users/me", { cover: r.url });
    }
  }

  async function saveBio() {
    setLoading(true);
    try {
      await api.put("/users/me", { bio: bio.trim() || null, location: location.trim() || null });
      await finish();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function finish() {
    await refresh();
    setSuccess(true);
  }

  function goBack() {
    if (step === 1 || (step === 3)) {
      // step 3 onwards you're already registered; block going back to auth
      if (step === 1) router.back();
      return;
    }
    setStep((s) => Math.max(1, s - 1));
  }

  if (success) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.successWrap}>
          <View style={styles.successBadge}>
            <Icon name="sparkles" size={54} color={colors.onBrandPrimary} />
          </View>
          <Text style={styles.successTitle}>Welcome to Glint!</Text>
          <Text style={styles.successSub}>Congratulations 🎉 Your Glint account is ready. Time to shine.</Text>
        </View>
        <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.lg }}>
          <Button title="Enter Glint" onPress={() => router.replace("/(tabs)")} testID="register-enter-app" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      {/* header */}
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.iconBtn} testID="register-back">
          {step <= 2 ? <Icon name="chevron-back" size={26} color={colors.onSurface} /> : <View style={{ width: 26 }} />}
        </Pressable>
        <View style={styles.progressBar}>
          {Array.from({ length: TOTAL }).map((_, i) => (
            <View key={i} style={[styles.progressSeg, { backgroundColor: i < step ? colors.brandPrimary : colors.surfaceTertiary }]} />
          ))}
        </View>
        {step >= 3 ? (
          <Pressable onPress={() => (step === 5 ? saveBio() : setStep((s) => s + 1))} style={styles.iconBtn} testID="register-skip">
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        {step === 1 && (
          <View style={styles.stepWrap}>
            <Text style={styles.title}>Let&apos;s get started</Text>
            <Text style={styles.subtitle}>Tell us who you are on Glint.</Text>
            <Field value={fullName} onChangeText={setFullName} placeholder="Full name" testID="register-fullname"
              icon={<Icon name="person-outline" size={20} color={colors.muted} />} />
            <Field value={username} onChangeText={(t) => setUsername(t.replace(/\s/g, "").toLowerCase())} placeholder="Unique username"
              autoCapitalize="none" testID="register-username" icon={<Icon name="at-outline" size={20} color={colors.muted} />} />

            <Pressable style={styles.checkboxRow} onPress={() => setAgreed((a) => !a)} testID="register-terms-checkbox">
              <View style={[styles.checkbox, agreed && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
                {agreed && <Icon name="checkmark" size={16} color={colors.onBrandPrimary} />}
              </View>
              <Text style={styles.checkboxText}>
                I agree to the{" "}
                <Text style={styles.link} onPress={() => router.push("/terms")}>Terms of Service</Text>{" "}
                &{" "}
                <Text style={styles.link} onPress={() => router.push("/guidelines")}>Community Guidelines</Text>
              </Text>
            </Pressable>
          </View>
        )}

        {step === 2 && (
          <View style={styles.stepWrap}>
            <Text style={styles.title}>Verify your account</Text>
            <Text style={styles.subtitle}>Choose how you&apos;d like to sign up.</Text>
            <View style={styles.segment}>
              {(["email", "phone"] as const).map((m) => (
                <Pressable key={m} onPress={() => { setMethod(m); setOtpSent(false); }} style={[styles.segItem, method === m && { backgroundColor: colors.brandPrimary }]} testID={`register-method-${m}`}>
                  <Icon name={m === "email" ? "mail-outline" : "call-outline"} size={18} color={method === m ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
                  <Text style={[styles.segText, { color: method === m ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>{m === "email" ? "Email" : "Phone"}</Text>
                </Pressable>
              ))}
            </View>
            <Field value={contact} onChangeText={setContact} placeholder={method === "email" ? "you@example.com" : "+1 555 000 0000"}
              autoCapitalize="none" keyboardType={method === "email" ? "email-address" : "phone-pad"} testID="register-contact"
              icon={<Icon name={method === "email" ? "mail-outline" : "call-outline"} size={20} color={colors.muted} />} />
            <Field value={password} onChangeText={setPassword} placeholder="Strong password (6+ chars)" secureTextEntry testID="register-password"
              icon={<Icon name="lock-closed-outline" size={20} color={colors.muted} />} />

            {!otpSent ? (
              <Button title="Send verification code" onPress={sendOtp} loading={loading} testID="register-send-otp" />
            ) : (
              <View style={{ gap: spacing.md }}>
                <Field value={otp} onChangeText={setOtp} placeholder="Enter 6-digit code" keyboardType="number-pad" testID="register-otp"
                  icon={<Icon name="keypad-outline" size={20} color={colors.muted} />} />
                <Button title="Verify & continue" onPress={verifyOtp} loading={loading} testID="register-verify-otp" />
                <Pressable onPress={sendOtp}><Text style={styles.resend}>Resend code</Text></Pressable>
              </View>
            )}
          </View>
        )}

        {step === 3 && (
          <View style={styles.stepWrap}>
            <Text style={styles.title}>Add a profile photo</Text>
            <Text style={styles.subtitle}>Help friends recognise you.</Text>
            <Pressable style={styles.avatarPick} onPress={uploadAvatar} testID="register-pick-avatar">
              {avatar ? (
                <Image source={{ uri: fileUrl(avatar) }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Icon name="camera-outline" size={40} color={colors.muted} />
              )}
            </Pressable>
            <Button title="Continue" onPress={() => setStep(4)} testID="register-avatar-continue" />
          </View>
        )}

        {step === 4 && (
          <View style={styles.stepWrap}>
            <Text style={styles.title}>Add a cover image</Text>
            <Text style={styles.subtitle}>Make your profile pop.</Text>
            <Pressable style={styles.coverPick} onPress={uploadCover} testID="register-pick-cover">
              {cover ? (
                <Image source={{ uri: fileUrl(cover) }} style={styles.coverImg} contentFit="cover" />
              ) : (
                <Icon name="image-outline" size={40} color={colors.muted} />
              )}
            </Pressable>
            <Button title="Continue" onPress={() => setStep(5)} testID="register-cover-continue" />
          </View>
        )}

        {step === 5 && (
          <View style={styles.stepWrap}>
            <Text style={styles.title}>Tell your story</Text>
            <Text style={styles.subtitle}>A short bio and where you&apos;re based.</Text>
            <Field value={bio} onChangeText={setBio} placeholder="Write a short bio..." multiline maxLength={160} testID="register-bio" />
            <Field value={location} onChangeText={setLocation} placeholder="Location" testID="register-location"
              icon={<Icon name="location-outline" size={20} color={colors.muted} />} />
            <Button title="Finish" onPress={saveBio} loading={loading} testID="register-finish" />
          </View>
        )}
      </KeyboardAwareScrollView>

      {step === 1 && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button title="Next" onPress={handleStep1} disabled={!step1Valid} testID="register-step1-next" />
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, gap: spacing.md, marginBottom: spacing.md },
  iconBtn: { minWidth: 44, height: 44, alignItems: "center", justifyContent: "center" },
  progressBar: { flex: 1, flexDirection: "row", gap: 6 },
  progressSeg: { flex: 1, height: 5, borderRadius: 3 },
  skip: { color: c.brand, fontFamily: fonts.semibold, fontSize: 15 },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: spacing["2xl"] },
  stepWrap: { gap: spacing.lg },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 28 },
  subtitle: { color: c.muted, fontFamily: fonts.text, fontSize: 15, marginTop: -spacing.sm },
  checkboxRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start", marginTop: spacing.sm },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  checkboxText: { flex: 1, color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14, lineHeight: 20 },
  link: { color: c.brand, fontFamily: fonts.semibold },
  segment: { flexDirection: "row", backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 4, gap: 4 },
  segItem: { flex: 1, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", paddingVertical: spacing.md, borderRadius: radius.sm },
  segText: { fontFamily: fonts.semibold, fontSize: 15 },
  resend: { color: c.brand, fontFamily: fonts.semibold, fontSize: 14, textAlign: "center" },
  avatarPick: { alignSelf: "center", width: 140, height: 140, borderRadius: 70, backgroundColor: c.surfaceTertiary, borderWidth: 2, borderColor: c.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  coverPick: { width: "100%", aspectRatio: 16 / 9, borderRadius: radius.lg, backgroundColor: c.surfaceTertiary, borderWidth: 2, borderColor: c.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  coverImg: { width: "100%", height: "100%" },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
  successWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg, paddingHorizontal: spacing.xl },
  successBadge: { width: 120, height: 120, borderRadius: 60, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  successTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 30, textAlign: "center" },
  successSub: { color: c.muted, fontFamily: fonts.text, fontSize: 16, textAlign: "center", lineHeight: 23 },
}));
