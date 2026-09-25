import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { Field, Button } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { GoldenTick } from "@/src/components/Avatar";
import { useToast } from "@/src/components/Toast";
import { api, fileUrl } from "@/src/api/client";
import { pickAndUploadImage } from "@/src/lib/media";

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
  const [submitting, setSubmitting] = useState(false);

  const current = status.data?.status;

  async function uploadDoc() {
    try {
      const r = await pickAndUploadImage({ quality: 0.7 });
      if (r?.denied) return toast.show("Photo permission needed", "error");
      if (r?.url) setDoc(r.url);
    } catch (e: any) {
      toast.show(e.message || "Upload failed", "error");
    }
  }

  async function submit() {
    if (!legalName.trim()) return toast.show("Enter your full legal name", "error");
    if (!doc) return toast.show("Upload an ID document", "error");
    setSubmitting(true);
    try {
      await api.post("/verification", { document: doc, full_legal_name: legalName.trim(), note: note.trim() || null });
      toast.show("Verification submitted!", "success");
      status.refetch();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const StatusBanner = () => {
    if (current === "pending") return <Banner icon="hourglass-outline" color={colors.warning} title="Under review" text="Your verification request is being reviewed by our team. This can take a few days." />;
    if (current === "approved") return <Banner icon="checkmark-circle" color={colors.brandSecondary} title="You're verified!" text="Your Golden Tick is now visible across Glint." />;
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
          <GoldenTick size={40} />
          <Text style={styles.heroTitle}>The Golden Tick</Text>
          <Text style={styles.heroText}>Verify your identity to earn a Golden Tick that appears next to your name everywhere on Glint.</Text>
        </View>

        <StatusBanner />

        {current !== "pending" && current !== "approved" && (
          <>
            <Field value={legalName} onChangeText={setLegalName} placeholder="Full legal name" testID="verification-name" icon={<Icon name="person-outline" size={20} color={colors.muted} />} />
            <Pressable style={styles.docUpload} onPress={uploadDoc} testID="verification-upload-doc">
              {doc ? (
                <Image source={{ uri: fileUrl(doc) }} style={styles.docImage} contentFit="cover" />
              ) : (
                <>
                  <Icon name="cloud-upload-outline" size={36} color={colors.brand} />
                  <Text style={styles.docText}>Upload a government ID or document</Text>
                </>
              )}
            </Pressable>
            <Field value={note} onChangeText={setNote} placeholder="Anything we should know? (optional)" multiline testID="verification-note" />
            <Button title="Submit request" onPress={submit} loading={submitting} testID="verification-submit" />
          </>
        )}
      </KeyboardAwareScrollView>
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
  hero: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  heroTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 24 },
  heroText: { color: c.muted, fontFamily: fonts.text, fontSize: 15, textAlign: "center", lineHeight: 22, paddingHorizontal: spacing.md },
  banner: { flexDirection: "row", gap: spacing.md, alignItems: "center", backgroundColor: c.surfaceSecondary, borderWidth: 1.5, borderRadius: radius.md, padding: spacing.lg },
  bannerTitle: { fontFamily: fonts.semibold, fontSize: 16 },
  bannerText: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14, marginTop: 2, lineHeight: 20 },
  docUpload: { minHeight: 160, borderWidth: 2, borderStyle: "dashed", borderColor: c.border, borderRadius: radius.md, alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  docImage: { width: "100%", height: 200 },
  docText: { color: c.onSurfaceTertiary, fontFamily: fonts.medium, fontSize: 14 },
}));
