import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, Modal, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, fileUrl } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { timeAgo } from "@/src/lib/time";

type ActionKind =
  | "suspend"
  | "restore"
  | "grant"
  | "revoke"
  | "deleteAccount"
  | "deletePost"
  | "deleteComment";

type PendingAction = {
  kind: ActionKind;
  targetId?: string;
  title: string;
};

export default function AdminUserDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();

  const [action, setAction] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("7");

  const detail = useQuery({
    queryKey: ["admin-user-full", id],
    queryFn: () => api.get(`/admin/users/${id}/full`, true),
    enabled: !!id,
  });

  const runAction = useMutation({
    mutationFn: async () => {
      if (!action) return;
      const why = reason.trim() || "Violation of Glint rules";
      switch (action.kind) {
        case "suspend":
          return api.post(`/admin/users/${id}/suspend`, { reason: why, duration_days: Math.max(0, Number(days) || 0) }, true);
        case "restore":
          return api.post(`/admin/users/${id}/restore`, { reason: why }, true);
        case "grant":
          return api.post(`/admin/users/${id}/blue-tick`, { verified: true, reason: why }, true);
        case "revoke":
          return api.post(`/admin/users/${id}/blue-tick`, { verified: false, reason: why }, true);
        case "deleteAccount":
          return api.post(`/admin/users/${id}/permanent-delete`, { reason: why }, true);
        case "deletePost":
          return api.post(`/admin/posts/${action.targetId}/delete`, { reason: why }, true);
        case "deleteComment":
          return api.post(`/admin/comments/${action.targetId}/delete`, { reason: why }, true);
      }
    },
    onSuccess: () => {
      const deletedAccount = action?.kind === "deleteAccount";
      toast.show(deletedAccount ? "Account permanently removed" : "Admin action completed", "success");
      setAction(null);
      setReason("");
      setDays("7");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-audit"] });
      if (deletedAccount) router.back();
      else detail.refetch();
    },
    onError: (e: any) => toast.show(e.message || "Action failed", "error"),
  });

  function openAction(next: PendingAction) {
    setAction(next);
    setReason("");
    setDays("7");
  }

  if (detail.isLoading) {
    return <View style={[styles.root, styles.center, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>;
  }

  if (detail.isError || !detail.data?.user) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Could not load this user.</Text>
        <Button title="Back" onPress={() => router.back()} />
      </View>
    );
  }

  const data = detail.data;
  const u = data.user;
  const statusText = u.permanent_deleted ? "Removed" : u.suspended ? "Suspended" : "Active";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} testID="admin-user-back">
          <Icon name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>User Control</Text>
          <Text style={styles.subtitle}>Full account & moderation view</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.profileCard}>
          {!!u.cover && <Image source={{ uri: fileUrl(u.cover) }} style={styles.cover} contentFit="cover" />}
          <View style={styles.profileTop}>
            <Avatar uri={u.avatar} name={u.full_name} size={72} />
            <View style={{ flex: 1 }}>
              <UserName name={u.full_name} verified={u.verified} size={19} />
              <Text style={styles.username}>@{u.username}</Text>
              <View style={styles.pills}>
                <Pill text={statusText} tone={u.suspended || u.permanent_deleted ? "danger" : "good"} />
                {u.blue_tick && <Pill text="Blue Tick" tone="blue" />}
                {u.phone_verified && <Pill text="Phone verified" tone="good" />}
              </View>
            </View>
          </View>

          <Info label="Email" value={u.email || "Not added"} />
          <Info label="Phone" value={u.phone || "Not added"} />
          <Info label="Joined" value={u.created_at ? new Date(u.created_at).toLocaleString() : "Unknown"} />
          <Info label="Last seen" value={u.last_seen ? new Date(u.last_seen).toLocaleString() : "Unknown"} />
          <Info label="Privacy" value={u.privacy || "public"} />
          <Info label="Sparks" value={String(u.sparks ?? 0)} />
          {!!u.suspended_until && <Info label="Suspended until" value={new Date(u.suspended_until).toLocaleString()} />}
          {!!u.suspend_reason && <Info label="Suspension reason" value={u.suspend_reason} />}
          <Text style={styles.securityNote}>For security, passwords, password hashes, OTP codes and private authentication secrets are never displayed in the admin dashboard.</Text>
        </View>

        <View style={styles.statsRow}>
          <MiniStat label="Posts" value={data.counts?.posts} />
          <MiniStat label="Comments" value={data.counts?.comments} />
          <MiniStat label="Stories" value={data.counts?.stories} />
          <MiniStat label="Friends" value={data.counts?.friends} />
          <MiniStat label="Tickets" value={data.counts?.tickets} />
          <MiniStat label="Reports" value={data.counts?.reports_made} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account actions</Text>
          <View style={styles.actionGrid}>
            <Button
              title={u.blue_tick ? "Remove Blue Tick" : "Grant Blue Tick"}
              small
              variant="secondary"
              onPress={() => openAction({ kind: u.blue_tick ? "revoke" : "grant", title: u.blue_tick ? "Remove Blue Tick" : "Grant Blue Tick" })}
              style={{ flex: 1 }}
            />
            <Button
              title={u.suspended ? "Restore account" : "Suspend account"}
              small
              variant="secondary"
              onPress={() => openAction({ kind: u.suspended ? "restore" : "suspend", title: u.suspended ? "Restore account" : "Suspend account" })}
              style={{ flex: 1 }}
            />
          </View>
          <Button
            title="Permanently delete account"
            variant="danger"
            onPress={() => openAction({ kind: "deleteAccount", title: "Permanently delete account" })}
            testID="admin-permanent-delete-account"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent posts</Text>
          {!data.posts?.length ? <Text style={styles.empty}>No posts.</Text> : data.posts.map((p: any) => (
            <View key={p.id} style={styles.contentCard}>
              <View style={styles.cardTop}>
                <Text style={styles.cardMeta}>{p.type || "post"} · {p.created_at ? timeAgo(p.created_at) : ""}</Text>
                {p.deleted_at ? <Pill text="Deleted" tone="danger" /> : null}
              </View>
              {!!p.text && <Text style={styles.bodyText}>{p.text}</Text>}
              {!!p.image && <Image source={{ uri: fileUrl(p.image) }} style={styles.media} contentFit="cover" />}
              {!!p.moderation_reason && <Text style={styles.reasonText}>Reason: {p.moderation_reason}</Text>}
              {!p.deleted_at && (
                <Button
                  title="Delete post"
                  small
                  variant="danger"
                  onPress={() => openAction({ kind: "deletePost", targetId: p.id, title: "Delete post" })}
                  style={{ alignSelf: "flex-start" }}
                />
              )}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent comments</Text>
          {!data.comments?.length ? <Text style={styles.empty}>No comments.</Text> : data.comments.map((cm: any) => (
            <View key={cm.id} style={styles.contentCard}>
              <View style={styles.cardTop}>
                <Text style={styles.cardMeta}>{cm.created_at ? timeAgo(cm.created_at) : ""} · Post {String(cm.post_id || "").slice(0, 8)}</Text>
                {cm.deleted_at ? <Pill text="Deleted" tone="danger" /> : null}
              </View>
              <Text style={styles.bodyText}>{cm.text}</Text>
              {!!cm.moderation_reason && <Text style={styles.reasonText}>Reason: {cm.moderation_reason}</Text>}
              {!cm.deleted_at && (
                <Button
                  title="Delete comment"
                  small
                  variant="danger"
                  onPress={() => openAction({ kind: "deleteComment", targetId: cm.id, title: "Delete comment" })}
                  style={{ alignSelf: "flex-start" }}
                />
              )}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification history</Text>
          {!data.verifications?.length ? <Text style={styles.empty}>No verification requests.</Text> : data.verifications.map((v: any) => (
            <View key={v.id} style={styles.contentCard}>
              <Text style={styles.bodyText}>{v.status?.toUpperCase()} · {v.full_legal_name || "No legal name"}</Text>
              <Text style={styles.cardMeta}>{v.created_at ? new Date(v.created_at).toLocaleString() : ""}</Text>
              <View style={styles.verificationMedia}>
                {!!v.document && <Image source={{ uri: fileUrl(v.document) }} style={styles.smallMedia} contentFit="cover" />}
                {!!v.selfie && <Image source={{ uri: fileUrl(v.selfie) }} style={styles.smallMedia} contentFit="cover" />}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Moderation history</Text>
          {!data.moderation_history?.length ? <Text style={styles.empty}>No admin actions yet.</Text> : data.moderation_history.map((a: any) => (
            <View key={a.id} style={styles.contentCard}>
              <Text style={styles.bodyText}>{String(a.action || "").replaceAll("_", " ")}</Text>
              <Text style={styles.reasonText}>{a.reason || "No reason"}</Text>
              <Text style={styles.cardMeta}>{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal visible={!!action} transparent animationType="fade" onRequestClose={() => setAction(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{action?.title}</Text>
            <Text style={styles.modalHint}>Write the reason. The user will be told this reason where applicable, and it will be saved in the admin audit log.</Text>
            {action?.kind === "suspend" && (
              <TextInput
                value={days}
                onChangeText={setDays}
                keyboardType="number-pad"
                placeholder="Suspension days (0 = indefinite)"
                placeholderTextColor={colors.muted}
                style={styles.input}
                testID="admin-suspension-days"
              />
            )}
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Reason..."
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.input, styles.reasonInput]}
              testID="admin-action-reason"
            />
            <Button
              title={action?.kind === "deleteAccount" ? "Confirm permanent delete" : "Confirm"}
              variant={action?.kind === "deleteAccount" || action?.kind === "deletePost" || action?.kind === "deleteComment" ? "danger" : "primary"}
              onPress={() => runAction.mutate()}
              loading={runAction.isPending}
              disabled={!reason.trim()}
              testID="admin-action-confirm"
            />
            <Pressable onPress={() => setAction(null)}><Text style={styles.cancel}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

function MiniStat({ label, value }: { label: string; value: any }) {
  const styles = useStyles();
  return <View style={styles.statBox}><Text style={styles.statValue}>{value ?? 0}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function Pill({ text, tone }: { text: string; tone: "good" | "danger" | "blue" }) {
  const styles = useStyles();
  const bg = tone === "blue" ? "#E8F1FF" : tone === "danger" ? "#FEECEC" : "#E8F7ED";
  const fg = tone === "blue" ? "#1877F2" : tone === "danger" ? "#C62828" : "#24733D";
  return <View style={[styles.pill, { backgroundColor: bg }]}><Text style={[styles.pillText, { color: fg }]}>{text}</Text></View>;
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  center: { alignItems: "center", justifyContent: "center", gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 22 },
  subtitle: { color: c.muted, fontFamily: fonts.text, fontSize: 12 },
  errorText: { color: c.onSurface, fontFamily: fonts.medium, fontSize: 16 },
  profileCard: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, overflow: "hidden" },
  cover: { height: 120, marginHorizontal: -spacing.lg, marginTop: -spacing.lg, marginBottom: spacing.md },
  profileTop: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  username: { color: c.muted, fontFamily: fonts.text, fontSize: 14, marginTop: 2 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { fontFamily: fonts.semibold, fontSize: 11 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.lg, paddingVertical: 4 },
  infoLabel: { color: c.muted, fontFamily: fonts.text, fontSize: 13 },
  infoValue: { flex: 1, color: c.onSurface, fontFamily: fonts.medium, fontSize: 13, textAlign: "right" },
  securityNote: { marginTop: spacing.sm, color: c.muted, fontFamily: fonts.text, fontSize: 12, lineHeight: 18, backgroundColor: c.surfaceTertiary, padding: spacing.md, borderRadius: radius.md },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  statBox: { width: "31%", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md },
  statValue: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 20 },
  statLabel: { color: c.muted, fontFamily: fonts.text, fontSize: 11 },
  section: { gap: spacing.sm },
  sectionTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 18 },
  actionGrid: { flexDirection: "row", gap: spacing.sm },
  contentCard: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  cardMeta: { color: c.muted, fontFamily: fonts.text, fontSize: 12 },
  bodyText: { color: c.onSurface, fontFamily: fonts.text, fontSize: 14, lineHeight: 20 },
  reasonText: { color: c.error, fontFamily: fonts.medium, fontSize: 12 },
  media: { width: "100%", height: 180, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary },
  verificationMedia: { flexDirection: "row", gap: spacing.sm },
  smallMedia: { flex: 1, height: 120, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary },
  empty: { color: c.muted, fontFamily: fonts.text, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: c.border },
  modalTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 21 },
  modalHint: { color: c.muted, fontFamily: fonts.text, fontSize: 13, lineHeight: 19 },
  input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, color: c.onSurface, fontFamily: fonts.text, fontSize: 15 },
  reasonInput: { minHeight: 100, textAlignVertical: "top" },
  cancel: { color: c.onSurfaceSecondary, fontFamily: fonts.semibold, fontSize: 15, textAlign: "center", paddingVertical: spacing.sm },
}));
