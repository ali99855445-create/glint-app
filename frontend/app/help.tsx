import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { Field, Button } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { api, fileUrl } from "@/src/api/client";
import { pickAndUploadImage } from "@/src/lib/media";
import { timeAgo } from "@/src/lib/time";

export default function Help() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const tickets = useQuery({ queryKey: ["tickets"], queryFn: () => api.get("/tickets/me") });
  useFocusEffect(React.useCallback(() => { tickets.refetch(); }, []));

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function attach() {
    try {
      const r = await pickAndUploadImage({ quality: 0.6 });
      if (r?.denied) return toast.show("Photo permission needed", "error");
      if (r?.url) setScreenshot(r.url);
    } catch (e: any) {
      toast.show(e.message || "Upload failed", "error");
    }
  }

  async function submit() {
    if (!subject.trim() || !description.trim()) return toast.show("Fill in subject and description", "error");
    setSubmitting(true);
    try {
      await api.post("/tickets", { subject: subject.trim(), description: description.trim(), screenshot });
      toast.show("Ticket submitted!", "success");
      setSubject(""); setDescription(""); setScreenshot(null);
      tickets.refetch();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="help-back"><Icon name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Help Center</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["2xl"] }} keyboardShouldPersistTaps="handled" bottomOffset={20}>
        <Text style={styles.sectionTitle}>Describe your issue</Text>
        <Field value={subject} onChangeText={setSubject} placeholder="Subject" testID="help-subject" />
        <Field value={description} onChangeText={setDescription} placeholder="Tell us what's happening..." multiline testID="help-description" />
        <Pressable style={styles.attach} onPress={attach} testID="help-attach">
          {screenshot ? (
            <Image source={{ uri: fileUrl(screenshot) }} style={styles.attachImg} contentFit="cover" />
          ) : (
            <><Icon name="attach-outline" size={22} color={colors.brand} /><Text style={styles.attachText}>Attach screenshot (optional)</Text></>
          )}
        </Pressable>
        <Button title="Submit ticket" onPress={submit} loading={submitting} testID="help-submit" />

        {(tickets.data?.length || 0) > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Your tickets</Text>
            {tickets.data.map((t: any) => (
              <View key={t.id} style={styles.ticket}>
                <View style={styles.ticketTop}>
                  <Text style={styles.ticketSubject}>{t.subject}</Text>
                  <View style={[styles.statusPill, { backgroundColor: t.status === "resolved" ? colors.success + "22" : colors.warning + "22" }]}>
                    <Text style={[styles.statusText, { color: t.status === "resolved" ? colors.success : colors.warning }]}>{t.status}</Text>
                  </View>
                </View>
                <Text style={styles.ticketDesc}>{t.description}</Text>
                {t.reply && (
                  <View style={styles.reply}>
                    <Text style={styles.replyLabel}>Glint Support:</Text>
                    <Text style={styles.replyText}>{t.reply}</Text>
                  </View>
                )}
                <Text style={styles.ticketTime}>{timeAgo(t.created_at)}</Text>
              </View>
            ))}
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 18 },
  sectionTitle: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 16 },
  attach: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1.5, borderStyle: "dashed", borderColor: c.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  attachImg: { width: "100%", height: 120 },
  attachText: { color: c.onSurfaceTertiary, fontFamily: fonts.medium, fontSize: 14 },
  ticket: { backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: spacing.xs },
  ticketTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ticketSubject: { flex: 1, color: c.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  statusPill: { paddingHorizontal: spacing.md, paddingVertical: 3, borderRadius: radius.pill },
  statusText: { fontFamily: fonts.semibold, fontSize: 12, textTransform: "capitalize" },
  ticketDesc: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14, lineHeight: 20 },
  reply: { backgroundColor: c.brandTertiary, borderRadius: radius.sm, padding: spacing.md, marginTop: spacing.xs, gap: 2 },
  replyLabel: { color: c.onBrandTertiary, fontFamily: fonts.semibold, fontSize: 12 },
  replyText: { color: c.onBrandTertiary, fontFamily: fonts.text, fontSize: 14 },
  ticketTime: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: spacing.xs },
}));
