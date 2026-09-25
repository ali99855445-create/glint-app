import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { Field, Button } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { BlueTick } from "@/src/components/Avatar";
import { useToast } from "@/src/components/Toast";
import { api, fileUrl } from "@/src/api/client";
import { pickAndUploadImage, takeAndUploadSelfie } from "@/src/lib/media";

export default function Verification() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const status = useQuery({ queryKey: ["verification"], queryFn: () => api.get("/verification/me") });
  useFocusEffect(React.useCallback(() => { status.refetch(); }, []));

  const [legalName, setLegalName] = useState("");
  const [note, setNote] = useState("");
  const [doc, setDoc] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const current = status.data?.status;
  const eligibility = status.data?.eligibility;
  const eligible = !!eligibility?.account_old_enough && !!eligibility?.phone_verified;

  async function uploadDoc() {
    try {
      const r = await pickAndUploadImage({ quality: 0.75 });
      if (r?.denied) return toast.show("Photo permission needed", "error");
      if (r?.url) setDoc(r.url);
    } catch (e: any) {
      toast.show(e.message || "Upload failed", "error");
    }
  }

  async function captureSelfie() {
    try {
      const r = await takeAndUploadSelfie(0.75);
      if (r?.denied) return toast.show("Camera permission needed", "error");
      if (r?.url) setSelfie(r.url);
    } catch (e: any) {
      toast.show(e.message || "Selfie upload failed", "error");
    }
  }

  async function submit() {
    if (!eligibility?.account_old_enough) return toast.show("Account must be at least 2 months old", "error");
    if (!eligibility?.phone_verified) return toast.show("A verified phone number is required", "error");
    if (!legalName.trim()) return toast.show("Enter your full legal name", "error");
    if (!doc) return toast.show("Upload an ID document", "error");
    if (!selfie) return toast.show("Take a live selfie", "error");

    setSubmitting(true);
    try {
      await api.post("/verification", {
        document: doc,
        selfie,
        full_legal_name: legalName.trim(),
        note: note.trim() || null,
      });
      toast.show("Verification submitted!", "success");
      status.refetch();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const StatusBanner = () => {
    if (current === "pending") return <Banner icon="hourglass-outline" color={colors.warning} title="Under review" text="Your verification request is being reviewed by our team." />;
    if (current === "approved") return <Banner icon="checkmark-circle" color="#1877F2" title="You're verified!" text="Your Blue Tick is now visible across Glint." />;
    if (current === "rejected") return <Banner icon="close-circle" color={colors.error} title="Request declined" text="Your last request was declined. You can submit a new one below." />;
    return null;
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="verification-back"><Icon name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Get Verified</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing["2xl"] }} keyboardShouldPersistTaps="handled" bottomOffset={20}>
        <View style={styles.hero}>
          <BlueTick size={44} />
          <Text style={styles.heroTitle}>Blue Tick</Text>
          <Text style={styles.heroText}>Confirm your identity and eligibility to receive Glint's verified badge.</Text>
        </View>

        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>Verification requirements</Text>
          <Rule ok={!!eligibility?.account_old_enough} text={`Account at least 2 months old${eligibility ? ` · ${eligibility.account_age_days ?? 0} days` : ""}`} />
          <Rule ok={!!eligibility?.phone_verified} text="Phone number verified" />
          <Rule ok={!!doc} text="Government ID or official document" />
          <Rule ok={!!selfie} text="Live selfie taken in the app" />
        </View>

        <StatusBanner />

        {current !== "pending" && current !== "approved" && (
          <>
            {!eligible && (
              <View style={styles.eligibilityNote}>
                <Icon name="information-circle-outline" size={20} color={colors.onBrandTertiary} />
                <Text style={styles.eligibilityText}>You can prepare your documents now, but submission is enabled only after the account-age and verified-phone requirements are met.</Text>
              </View>
            )}

            <Field value={legalName} onChangeText={setLegalName} placeholder="Full legal name" testID="verification-name" icon={<Icon name="person-outline" size={20} color={colors.muted} />} />

            <Pressable style={styles.uploadCard} onPress={uploadDoc} testID="verification-upload-doc">
              {doc ? (
                <Image source={{ uri: fileUrl(doc) }} style={styles.uploadImage} contentFit="cover" />
              ) : (
                <>
                  <Icon name="document-text-outline" size={34} color={colors.brand} />
                  <Text style={styles.uploadTitle}>Upload ID document</Text>
                  <Text style={styles.uploadSub}>Government ID or another accepted identity document</Text>
                </>
              )}
            </Pressable>

            <Pressable style={styles.uploadCard} onPress={captureSelfie} testID="verification-live-selfie">
              {selfie ? (
                <Image source={{ uri: fileUrl(selfie) }} style={styles.uploadImage} contentFit="cover" />
              ) : (
                <>
                  <Icon name="camera-outline" size={34} color={colors.brand} />
                  <Text style={styles.uploadTitle}>Take live selfie</Text>
                  <Text style={styles.uploadSub}>Camera capture only — use a clear, recent photo of your face</Text>
                </>
              )}
            </Pressable>

            <Field value={note} onChangeText={setNote} placeholder="Anything we should know? (optional)" multiline testID="verification-note" />
            <Button title="Submit request" onPress={submit} loading={submitting} disabled={!eligible} testID="verification-submit" />
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

function Rule({ ok, text }: { ok: boolean; text: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.ruleRow}>
      <View style={[styles.ruleIcon, { backgroundColor: ok ? colors.brandTertiary : colors.surfaceTertiary }]}>
        <Icon name={ok ? "checkmark" : "ellipse-outline"} size={16} color={ok ? colors.brand : colors.muted} />
      </View>
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

function Banner({ icon, color, title, text }: any) {
  const styles = useStyles();
  return (
    <View style={[styles.banner, { borderColor: color }]}>
      <Icon name={icon} size={26} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerTitle, { color }]}>{title}</Text>
        <Text style={styles.bannerText}>{text}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 18 },
  hero: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  heroTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 24 },
  heroText: { color: c.muted, fontFamily: fonts.text, fontSize: 15, textAlign: "center", lineHeight: 22, paddingHorizontal: spacing.md },
  rulesCard: { gap: spacing.md, padding: spacing.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md },
  rulesTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 17 },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  ruleIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  ruleText: { flex: 1, color: c.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 14 },
  banner: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderRadius: radius.md, padding: spacing.lg },
  bannerTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  bannerText: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14, marginTop: 2, lineHeight: 20 },
  eligibilityNote: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, backgroundColor: c.brandTertiary, borderRadius: radius.md },
  eligibilityText: { flex: 1, color: c.onBrandTertiary, fontFamily: fonts.text, fontSize: 13, lineHeight: 19 },
  uploadCard: { minHeight: 150, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.borderStrong, borderRadius: radius.md, alignItems: "center", justifyContent: "center", gap: spacing.xs, backgroundColor: c.surfaceSecondary, overflow: "hidden", padding: spacing.lg },
  uploadImage: { width: "100%", height: 190, borderRadius: radius.sm },
  uploadTitle: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  uploadSub: { color: c.muted, fontFamily: fonts.text, fontSize: 13, textAlign: "center", lineHeight: 18 },
}));
