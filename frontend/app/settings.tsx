import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";

function Row({ icon, label, value, onPress, danger, testID, rightEl }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable style={styles.row} onPress={onPress} testID={testID}>
      <View style={[styles.rowIcon, { backgroundColor: danger ? colors.error + "22" : colors.brandTertiary }]}>
        <Icon name={icon} size={18} color={danger ? colors.error : colors.brand} />
      </View>
      <Text style={[styles.rowLabel, danger && { color: colors.error }]}>{label}</Text>
      {rightEl || (value ? <Text style={styles.rowValue}>{value}</Text> : <Icon name="chevron-forward" size={18} color={colors.muted} />)}
    </Pressable>
  );
}

export default function Settings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user, refresh, logout } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [privacyPicker, setPrivacyPicker] = useState<"profile" | "contact" | null>(null);

  const me = useQuery({ queryKey: ["me-settings"], queryFn: () => api.get("/users/me") });
  useFocusEffect(React.useCallback(() => { me.refetch(); }, []));

  const privacy = me.data?.privacy || "public";
  const contactVisibility = me.data?.contact_visibility || "only_me";

  const visibilityLabel = (value: string) => value === "public" ? "Public" : value === "friends" ? "Friends Only" : "Only Me";

  const updateVisibility = useMutation({
    mutationFn: ({ field, value }: { field: "privacy" | "contact_visibility"; value: string }) => api.put("/users/me", { [field]: value }),
    onSuccess: async () => {
      await refresh();
      await me.refetch();
      setPrivacyPicker(null);
      toast.show("Privacy updated", "success");
    },
    onError: (e: any) => toast.show(e.message || "Could not update privacy", "error"),
  });

  const deleteAcct = useMutation({
    mutationFn: () => api.del("/users/me"),
    onSuccess: async () => { await logout(); router.replace("/(auth)/welcome"); },
  });

  async function doLogout() {
    await logout();
    router.replace("/(auth)/welcome");
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="settings-back"><Icon name="chevron-back" size={26} color={colors.onSurface} /></Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.xl }}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.contactSummary}>
            <Text style={styles.contactSummaryTitle}>Account contact</Text>
            <View style={styles.contactLine}>
              <Icon name="mail-outline" size={17} color={colors.brand} />
              <Text style={styles.contactLabel}>Email</Text>
              <Text style={styles.contactValue}>{me.data?.email || "Not linked"}</Text>
            </View>
            <View style={styles.contactLine}>
              <Icon name="call-outline" size={17} color={colors.brand} />
              <Text style={styles.contactLabel}>Phone</Text>
              <Text style={styles.contactValue}>{me.data?.phone || "Not linked"}</Text>
            </View>
            <Text style={styles.contactHint}>You can log in with your username, linked email, or linked phone number.</Text>
          </View>
          <Row icon="person-outline" label="Edit profile" onPress={() => router.push("/edit-profile")} testID="settings-edit-profile" />
          <Row icon="bookmark-outline" label="Saved posts" onPress={() => router.push("/saved")} testID="settings-saved" />
          <Row icon="star-outline" label="Inner Circle" onPress={() => router.push("/inner-circle")} testID="settings-inner-circle" />
          <Row
            icon={privacy === "public" ? "earth-outline" : privacy === "friends" ? "people-outline" : "lock-closed-outline"}
            label="Profile privacy"
            testID="settings-privacy"
            onPress={() => setPrivacyPicker("profile")}
            rightEl={
              <View style={styles.pill}><Text style={styles.pillText}>{visibilityLabel(privacy)}</Text></View>
            }
          />
          <Row
            icon={contactVisibility === "public" ? "earth-outline" : contactVisibility === "friends" ? "people-outline" : "lock-closed-outline"}
            label="Personal info (email & phone)"
            testID="settings-contact-privacy"
            onPress={() => setPrivacyPicker("contact")}
            rightEl={
              <View style={styles.pill}><Text style={styles.pillText}>{visibilityLabel(contactVisibility)}</Text></View>
            }
          />
          <Row icon="ban-outline" label="Blocked users" onPress={() => router.push("/blocked")} testID="settings-blocked" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Glint</Text>
          <Row icon="ribbon-outline" label="Get verified (Blue Tick)" onPress={() => router.push("/verification")} testID="settings-verification" />
          <Row icon="help-buoy-outline" label="Help Center" onPress={() => router.push("/help")} testID="settings-help" />
          {(me.data?.is_admin || user?.is_admin) && <Row icon="shield-checkmark-outline" label="Admin panel" onPress={() => router.push("/admin/login")} testID="settings-admin" />}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <Row icon="document-text-outline" label="Terms & Conditions" onPress={() => router.push("/legal/terms")} testID="settings-terms" />
          <Row icon="lock-closed-outline" label="Privacy Policy" onPress={() => router.push("/legal/privacy")} testID="settings-privacy-policy" />
          <Row icon="people-outline" label="Community Standards" onPress={() => router.push("/legal/guidelines")} testID="settings-guidelines" />
        </View>

        <View style={styles.section}>
          <Row icon="log-out-outline" label="Log out" onPress={doLogout} testID="settings-logout" />
          <Row icon="trash-outline" label="Delete account" danger onPress={() => setConfirmDelete(true)} testID="settings-delete" />
        </View>

        <Text style={styles.version}>Glint v1.0.10 · @{user?.username}</Text>
      </ScrollView>

      <Modal visible={!!privacyPicker} transparent animationType="fade" onRequestClose={() => setPrivacyPicker(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.privacyCard}>
            <Text style={styles.modalTitle}>{privacyPicker === "contact" ? "Personal information privacy" : "Profile privacy"}</Text>
            <Text style={styles.modalText}>
              {privacyPicker === "contact"
                ? "Choose who can see your email address and phone number."
                : "Choose who can see your profile posts."}
            </Text>
            {[
              { value: "public", label: "Public", icon: "earth-outline", sub: "Anyone on Glint" },
              { value: "friends", label: "Friends Only", icon: "people-outline", sub: "Only your friends" },
              { value: "only_me", label: "Only Me", icon: "lock-closed-outline", sub: "Private to you" },
            ].map((opt) => {
              const current = privacyPicker === "contact" ? contactVisibility : privacy;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.privacyOption, current === opt.value && styles.privacyOptionSelected]}
                  onPress={() => updateVisibility.mutate({
                    field: privacyPicker === "contact" ? "contact_visibility" : "privacy",
                    value: opt.value,
                  })}
                  testID={`privacy-${privacyPicker}-${opt.value}`}
                >
                  <View style={styles.privacyOptionIcon}><Icon name={opt.icon as any} size={19} color={colors.brand} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.privacyOptionTitle}>{opt.label}</Text>
                    <Text style={styles.privacyOptionSub}>{opt.sub}</Text>
                  </View>
                  {current === opt.value && <Icon name="checkmark-circle" size={22} color={colors.brand} />}
                </Pressable>
              );
            })}
            <Pressable onPress={() => setPrivacyPicker(null)}><Text style={styles.cancel}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={confirmDelete} transparent animationType="fade" onRequestClose={() => setConfirmDelete(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}><Icon name="warning" size={30} color={colors.error} /></View>
            <Text style={styles.modalTitle}>Delete your account?</Text>
            <Text style={styles.modalText}>This permanently removes your profile, posts, and stories. This cannot be undone.</Text>
            <Button title="Delete permanently" variant="danger" loading={deleteAcct.isPending} onPress={() => deleteAcct.mutate()} testID="confirm-delete" />
            <Pressable onPress={() => setConfirmDelete(false)} testID="cancel-delete"><Text style={styles.cancel}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 18 },
  section: { gap: spacing.xs },
  sectionTitle: { color: c.muted, fontFamily: fonts.semibold, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: spacing.xs },
  contactSummary: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, marginBottom: spacing.xs },
  contactSummaryTitle: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  contactLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  contactLabel: { width: 52, color: c.muted, fontFamily: fonts.medium, fontSize: 13 },
  contactValue: { flex: 1, color: c.onSurface, fontFamily: fonts.medium, fontSize: 14, textAlign: "right" },
  contactHint: { color: c.muted, fontFamily: fonts.text, fontSize: 12, lineHeight: 17, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md },
  rowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  rowLabel: { flex: 1, color: c.onSurface, fontFamily: fonts.medium, fontSize: 15 },
  rowValue: { color: c.muted, fontFamily: fonts.text, fontSize: 14 },
  pill: { backgroundColor: c.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  pillText: { color: c.onBrandTertiary, fontFamily: fonts.semibold, fontSize: 13 },
  themeRow: { flexDirection: "row", gap: spacing.sm, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 4 },
  themeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.md, borderRadius: radius.sm },
  themeText: { fontFamily: fonts.semibold, fontSize: 14 },
  version: { color: c.muted, fontFamily: fonts.text, fontSize: 12, textAlign: "center", marginTop: spacing.md },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, alignItems: "center", width: "100%" },
  privacyCard: { backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, width: "100%" },
  privacyOption: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: c.surfaceSecondary },
  privacyOptionSelected: { borderColor: c.brand, backgroundColor: c.brandTertiary },
  privacyOptionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: c.brandTertiary },
  privacyOptionTitle: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  privacyOptionSub: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 2 },
  modalIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: c.error + "22", alignItems: "center", justifyContent: "center" },
  modalTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 20 },
  modalText: { color: c.muted, fontFamily: fonts.text, fontSize: 14, textAlign: "center", lineHeight: 21 },
  cancel: { color: c.onSurfaceSecondary, fontFamily: fonts.semibold, fontSize: 15, marginTop: spacing.xs },
}));
