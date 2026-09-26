import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal, TextInput, Switch } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api, adminForm, fileUrl, ADMIN_TOKEN_KEY } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { storage } from "@/src/utils/storage";
import { timeAgo } from "@/src/lib/time";

const TABS = ["Users", "Content", "Reports", "Appeals", "Verify", "Tickets", "Controls", "Audit", "System"];
const FLAG_LABELS: Record<string, string> = {
  registration_enabled: "New registrations",
  uploads_enabled: "Photo / file uploads",
  posts_enabled: "Posts & comments",
  stories_enabled: "Stories",
  chat_enabled: "Chat & messages",
  verification_enabled: "Blue Tick applications",
};

type ContentAction = { id: string; kind: "post" | "story" | "comment"; restore: boolean } | null;
type AppealAction = { id: string; decision: "approved" | "rejected"; restoreAccount: boolean } | null;

export default function AdminDashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState("Users");
  const [userQuery, setUserQuery] = useState("");
  const [contentStatus, setContentStatus] = useState("all");
  const [replyModal, setReplyModal] = useState<{ id: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [reportDeleteModal, setReportDeleteModal] = useState<{ id: string; target_type: string } | null>(null);
  const [moderationReason, setModerationReason] = useState("");
  const [contentAction, setContentAction] = useState<ContentAction>(null);
  const [contentReason, setContentReason] = useState("");
  const [appealAction, setAppealAction] = useState<AppealAction>(null);
  const [appealNote, setAppealNote] = useState("");

  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastActive, setBroadcastActive] = useState(false);
  const [forceActive, setForceActive] = useState(false);
  const [maintenanceActive, setMaintenanceActive] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({
    registration_enabled: true,
    uploads_enabled: true,
    posts_enabled: true,
    stories_enabled: true,
    chat_enabled: true,
    verification_enabled: true,
  });

  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => api.get("/admin/stats", true) });
  const users = useQuery({
    queryKey: ["admin-users", userQuery],
    queryFn: () => api.get(`/admin/users?q=${encodeURIComponent(userQuery)}`, true),
    enabled: tab === "Users",
  });
  const contentQ = useQuery({
    queryKey: ["admin-content", contentStatus],
    queryFn: () => api.get(`/admin/content?kind=all&status=${contentStatus}`, true),
    enabled: tab === "Content",
  });
  const reports = useQuery({ queryKey: ["admin-reports"], queryFn: () => api.get("/admin/reports", true), enabled: tab === "Reports" });
  const appeals = useQuery({ queryKey: ["admin-appeals"], queryFn: () => api.get("/admin/appeals", true), enabled: tab === "Appeals" });
  const verifications = useQuery({ queryKey: ["admin-verifications"], queryFn: () => api.get("/admin/verifications", true), enabled: tab === "Verify" });
  const tickets = useQuery({ queryKey: ["admin-tickets"], queryFn: () => api.get("/admin/tickets", true), enabled: tab === "Tickets" });
  const controls = useQuery({ queryKey: ["admin-controls"], queryFn: () => api.get("/admin/controls", true), enabled: tab === "Controls" });
  const audit = useQuery({ queryKey: ["admin-audit"], queryFn: () => api.get("/admin/audit", true), enabled: tab === "Audit" });
  const system = useQuery({ queryKey: ["admin-system"], queryFn: () => api.get("/admin/system", true), enabled: tab === "System" });

  useEffect(() => {
    if (!controls.data) return;
    setBroadcastMsg(controls.data.broadcast?.message || "");
    setBroadcastActive(!!controls.data.broadcast?.active);
    setForceActive(!!controls.data.force_update?.active);
    setMaintenanceActive(!!controls.data.maintenance?.active);
    setMaintenanceMessage(controls.data.maintenance?.message || "");
    setFeatureFlags((prev) => ({ ...prev, ...(controls.data.feature_flags || {}) }));
  }, [controls.data]);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-content"] });
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
    qc.invalidateQueries({ queryKey: ["admin-appeals"] });
    qc.invalidateQueries({ queryKey: ["admin-verifications"] });
    qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    qc.invalidateQueries({ queryKey: ["admin-controls"] });
    qc.invalidateQueries({ queryKey: ["admin-audit"] });
    qc.invalidateQueries({ queryKey: ["admin-system"] });
  };

  const resolveTicket = useMutation({
    mutationFn: () => adminForm(`/admin/tickets/${replyModal!.id}/resolve`, { reply: replyText }),
    onSuccess: () => {
      toast.show("Ticket resolved", "success");
      setReplyModal(null);
      setReplyText("");
      refreshAll();
    },
  });

  const approveV = useMutation({
    mutationFn: (id: string) => api.post(`/admin/verifications/${id}/approve`, { reason: "Approved by Glint administrator" }, true),
    onSuccess: () => { toast.show("Blue Tick granted", "success"); refreshAll(); },
  });
  const rejectV = useMutation({
    mutationFn: (id: string) => api.post(`/admin/verifications/${id}/reject`, { reason: "Verification requirements were not met" }, true),
    onSuccess: () => { toast.show("Verification rejected", "info"); refreshAll(); },
  });

  const delReported = useMutation({
    mutationFn: () => api.post(`/admin/reports/${reportDeleteModal!.id}/delete-content`, { reason: moderationReason.trim() }, true),
    onSuccess: () => {
      toast.show(reportDeleteModal?.target_type === "user" ? "Account removed" : "Content removed", "success");
      setReportDeleteModal(null);
      setModerationReason("");
      refreshAll();
    },
  });
  const dismissReport = useMutation({
    mutationFn: (id: string) => api.post(`/admin/reports/${id}/dismiss`, {}, true),
    onSuccess: refreshAll,
  });

  const contentMut = useMutation({
    mutationFn: async () => {
      if (!contentAction) return;
      const action = contentAction.restore ? "restore" : "delete";
      const plural = contentAction.kind === "story" ? "stories" : contentAction.kind === "comment" ? "comments" : "posts";
      return api.post(`/admin/${plural}/${contentAction.id}/${action}`, { reason: contentReason.trim() }, true);
    },
    onSuccess: () => {
      toast.show(contentAction?.restore ? "Content restored" : "Content removed", "success");
      setContentAction(null);
      setContentReason("");
      refreshAll();
    },
    onError: (e: any) => toast.show(e.message || "Action failed", "error"),
  });

  const appealMut = useMutation({
    mutationFn: async () => {
      if (!appealAction) return;
      return api.post(`/admin/appeals/${appealAction.id}/decision`, {
        decision: appealAction.decision,
        note: appealNote.trim(),
        restore_account: appealAction.restoreAccount,
      }, true);
    },
    onSuccess: () => {
      toast.show("Appeal decision saved", "success");
      setAppealAction(null);
      setAppealNote("");
      refreshAll();
    },
  });

  const sendBroadcast = useMutation({
    mutationFn: () => api.post("/admin/broadcast", { message: broadcastMsg, active: broadcastActive }, true),
    onSuccess: () => { toast.show("Broadcast saved", "success"); refreshAll(); },
  });
  const setForce = useMutation({
    mutationFn: () => api.post("/admin/force-update", {
      active: forceActive,
      message: "A new version of Glint is available. Please update.",
      min_version: null,
    }, true),
    onSuccess: () => { toast.show("Force update setting saved", "success"); refreshAll(); },
  });
  const saveControls = useMutation({
    mutationFn: () => api.post("/admin/controls", {
      maintenance_mode: maintenanceActive,
      maintenance_message: maintenanceMessage,
      ...featureFlags,
    }, true),
    onSuccess: () => { toast.show("App controls saved", "success"); refreshAll(); },
  });

  async function signOut() {
    await storage.secureRemove(ADMIN_TOKEN_KEY);
    router.replace("/(tabs)");
  }

  const S = stats.data || {};

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Glint Admin</Text>
          <Text style={styles.subtitle}>Super Admin control center</Text>
        </View>
        <Pressable onPress={refreshAll} style={styles.iconBtn} testID="admin-refresh">
          <Icon name="refresh-outline" size={21} color={colors.onSurface} />
        </Pressable>
        <Pressable onPress={signOut} style={styles.iconBtn} testID="admin-signout">
          <Icon name="log-out-outline" size={21} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
        <View style={styles.statsGrid}>
          <Stat icon="people" label="Users" value={S.users} />
          <Stat icon="pulse" label="Active 24h" value={S.active_24h} />
          <Stat icon="document-text" label="Posts" value={S.posts} />
          <Stat icon="chatbubbles" label="Messages" value={S.messages} />
          <Stat icon="flag" label="Reports" value={S.open_reports} />
          <Stat icon="mail-open" label="Appeals" value={S.open_appeals} />
          <Stat icon="ban" label="Suspended" value={S.suspended_users} />
          <Stat icon="checkmark-circle" label="Blue Tick" value={S.blue_tick_users} />
          <Stat icon="ribbon" label="Verify Queue" value={S.pending_verifications} />
          <Stat icon="help-buoy" label="Tickets" value={S.open_tickets} />
          <Stat icon="warning" label="Warnings" value={S.warnings} />
          <Stat icon="chatbox" label="Comments" value={S.comments} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {TABS.map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.chip, tab === t && { backgroundColor: colors.brandPrimary }]} testID={`admin-tab-${t}`}>
              <Text style={[styles.chipText, { color: tab === t ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.content}>
          {tab === "Users" && (
            <View style={{ gap: spacing.sm }}>
              <View style={styles.searchWrap}>
                <Icon name="search" size={18} color={colors.muted} />
                <TextInput
                  value={userQuery}
                  onChangeText={setUserQuery}
                  placeholder="Search name, username, email or phone"
                  placeholderTextColor={colors.muted}
                  style={styles.searchInput}
                  testID="admin-user-search"
                />
              </View>
              {users.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : !(users.data || []).length ? (
                <Empty text="No users found" />
              ) : (users.data || []).map((u: any) => (
                <View key={u.id} style={styles.card}>
                  <View style={styles.userRow}>
                    <Avatar uri={u.avatar} name={u.full_name} size={46} />
                    <View style={{ flex: 1 }}>
                      <UserName name={u.full_name} verified={u.blue_tick} size={15} />
                      <Text style={styles.cardMeta}>@{u.username}{u.suspended ? " · Suspended" : ""}</Text>
                      <Text style={styles.cardMeta}>{u.email || u.phone || "No contact"}</Text>
                      {(u.posting_restricted_until || u.messaging_restricted_until) ? <Text style={styles.warningText}>Feature restriction active</Text> : null}
                    </View>
                    <Pressable style={styles.viewBtn} onPress={() => router.push(`/admin/user/${u.id}`)}>
                      <Text style={styles.viewBtnText}>Control</Text>
                      <Icon name="chevron-forward" size={16} color={colors.brand} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {tab === "Content" && (
            <View style={{ gap: spacing.md }}>
              <View style={styles.filterRow}>
                {["all", "active", "removed"].map((f) => (
                  <Pressable key={f} onPress={() => setContentStatus(f)} style={[styles.filterChip, contentStatus === f && { backgroundColor: colors.brandPrimary }]}>
                    <Text style={[styles.filterText, { color: contentStatus === f ? colors.onBrandPrimary : colors.onSurface }]}>{f}</Text>
                  </Pressable>
                ))}
              </View>
              <Section loading={contentQ.isLoading} empty={!contentQ.data?.length} emptyText="No content">
                {(contentQ.data || []).map((item: any) => (
                  <View key={`${item.kind}-${item.id}`} style={styles.card}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardTitle}>{String(item.kind).toUpperCase()}</Text>
                      <Text style={styles.cardMeta}>{item.created_at ? timeAgo(item.created_at) : ""}</Text>
                    </View>
                    {item.author ? <Text style={styles.cardMeta}>{item.author.full_name} · @{item.author.username}</Text> : null}
                    {item.text ? <Text style={styles.cardDesc}>{item.text}</Text> : null}
                    {item.image ? <Image source={{ uri: fileUrl(item.image) }} style={styles.attachImg} contentFit="cover" /> : null}
                    {item.moderation_reason ? <Text style={styles.warningText}>Reason: {item.moderation_reason}</Text> : null}
                    <Button
                      title={item.deleted_at ? "Restore content" : "Remove content"}
                      small
                      variant={item.deleted_at ? "secondary" : "danger"}
                      onPress={() => {
                        setContentAction({ id: item.id, kind: item.kind, restore: !!item.deleted_at });
                        setContentReason(item.deleted_at ? "Restored after admin review" : "");
                      }}
                      style={{ alignSelf: "flex-start" }}
                    />
                  </View>
                ))}
              </Section>
            </View>
          )}

          {tab === "Reports" && (
            <Section loading={reports.isLoading} empty={!reports.data?.length} emptyText="No open reports">
              {(reports.data || []).map((r: any) => (
                <View key={r.id} style={styles.card}>
                  <Text style={styles.cardTitle}>Reported {r.target_type}</Text>
                  <Text style={styles.cardDesc}>Reason: {r.reason}</Text>
                  {r.target?.text ? <Text style={styles.quoted}>&quot;{r.target.text}&quot;</Text> : null}
                  {r.target?.type === "user" ? (
                    <View style={styles.userRow}>
                      <Avatar uri={r.target.avatar} name={r.target.full_name} size={40} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{r.target.full_name || "Reported user"}</Text>
                        <Text style={styles.cardMeta}>@{r.target.username}</Text>
                      </View>
                    </View>
                  ) : null}
                  {r.target?.image ? <Image source={{ uri: fileUrl(r.target.image) }} style={styles.attachImg} contentFit="cover" /> : null}
                  <View style={styles.actionRow}>
                    <Button
                      title={r.target_type === "user" ? "Remove account" : "Delete content"}
                      small variant="danger"
                      onPress={() => { setReportDeleteModal({ id: r.id, target_type: r.target_type }); setModerationReason(""); }}
                      style={{ flex: 1 }}
                    />
                    <Button title="Dismiss" small variant="secondary" onPress={() => dismissReport.mutate(r.id)} style={{ flex: 1 }} />
                  </View>
                </View>
              ))}
            </Section>
          )}

          {tab === "Appeals" && (
            <Section loading={appeals.isLoading} empty={!appeals.data?.length} emptyText="No appeals">
              {(appeals.data || []).map((a: any) => (
                <View key={a.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{a.category || "Account"} appeal</Text>
                    <StatusPill status={a.status} />
                  </View>
                  {a.user ? <Text style={styles.cardMeta}>{a.user.full_name} · @{a.user.username}</Text> : null}
                  <Text style={styles.cardDesc}>{a.reason}</Text>
                  {a.admin_note ? <Text style={styles.cardMeta}>Admin note: {a.admin_note}</Text> : null}
                  {a.status === "open" ? (
                    <View style={styles.actionRow}>
                      <Button title="Approve & restore" small onPress={() => { setAppealAction({ id: a.id, decision: "approved", restoreAccount: true }); setAppealNote(""); }} style={{ flex: 1 }} />
                      <Button title="Reject" small variant="secondary" onPress={() => { setAppealAction({ id: a.id, decision: "rejected", restoreAccount: false }); setAppealNote(""); }} style={{ flex: 1 }} />
                    </View>
                  ) : null}
                </View>
              ))}
            </Section>
          )}

          {tab === "Verify" && (
            <Section loading={verifications.isLoading} empty={!verifications.data?.length} emptyText="No Blue Tick requests">
              {(verifications.data || []).map((v: any) => (
                <View key={v.id} style={styles.card}>
                  <View style={styles.userRow}>
                    <Avatar uri={v.user?.avatar} name={v.user?.full_name} size={44} />
                    <View style={{ flex: 1 }}>
                      <UserName name={v.user?.full_name} verified={v.user?.verified} size={15} />
                      <Text style={styles.cardMeta}>Legal name: {v.full_legal_name}</Text>
                    </View>
                    <StatusPill status={v.status} />
                  </View>
                  {v.note ? <Text style={styles.cardDesc}>{v.note}</Text> : null}
                  {v.document ? <><Text style={styles.cardMeta}>ID document</Text><Image source={{ uri: fileUrl(v.document) }} style={styles.attachImg} contentFit="cover" /></> : null}
                  {v.selfie ? <><Text style={styles.cardMeta}>Live selfie</Text><Image source={{ uri: fileUrl(v.selfie) }} style={styles.attachImg} contentFit="cover" /></> : null}
                  {v.status === "pending" ? (
                    <View style={styles.actionRow}>
                      <Button title="Grant Blue Tick" small onPress={() => approveV.mutate(v.id)} style={{ flex: 1 }} />
                      <Button title="Reject" small variant="secondary" onPress={() => rejectV.mutate(v.id)} style={{ flex: 1 }} />
                    </View>
                  ) : null}
                </View>
              ))}
            </Section>
          )}

          {tab === "Tickets" && (
            <Section loading={tickets.isLoading} empty={!tickets.data?.length} emptyText="No support tickets">
              {(tickets.data || []).map((t: any) => (
                <View key={t.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{t.subject}</Text>
                    <StatusPill status={t.status} />
                  </View>
                  <Text style={styles.cardDesc}>{t.description}</Text>
                  {t.user ? <Text style={styles.cardMeta}>@{t.user.username} · {timeAgo(t.created_at)}</Text> : null}
                  {t.screenshot ? <Image source={{ uri: fileUrl(t.screenshot) }} style={styles.attachImg} contentFit="cover" /> : null}
                  {t.reply ? <Text style={styles.quoted}>Reply: {t.reply}</Text> : null}
                  {t.status !== "resolved" ? (
                    <Button title="Reply & resolve" small onPress={() => { setReplyModal({ id: t.id }); setReplyText(""); }} style={{ alignSelf: "flex-start" }} />
                  ) : null}
                </View>
              ))}
            </Section>
          )}

          {tab === "Controls" && (
            <View style={{ gap: spacing.lg }}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Feature Controls</Text>
                <Text style={styles.cardMeta}>Turn key Glint features on or off from the server.</Text>
                {Object.keys(FLAG_LABELS).map((key) => (
                  <View key={key} style={styles.switchRow}>
                    <Text style={styles.switchLabel}>{FLAG_LABELS[key]}</Text>
                    <Switch
                      value={featureFlags[key] !== false}
                      onValueChange={(v) => setFeatureFlags((prev) => ({ ...prev, [key]: v }))}
                      trackColor={{ true: colors.brandPrimary }}
                    />
                  </View>
                ))}
                <Button title="Save feature controls" onPress={() => saveControls.mutate()} loading={saveControls.isPending} />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Maintenance Mode</Text>
                <Text style={styles.cardMeta}>Save a maintenance state and message. Feature switches above are enforced immediately by the backend.</Text>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Maintenance flag</Text>
                  <Switch value={maintenanceActive} onValueChange={setMaintenanceActive} trackColor={{ true: colors.brandPrimary }} />
                </View>
                <TextInput value={maintenanceMessage} onChangeText={setMaintenanceMessage} placeholder="Maintenance message..." placeholderTextColor={colors.muted} style={styles.input} />
                <Button title="Save maintenance setting" onPress={() => saveControls.mutate()} loading={saveControls.isPending} />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Broadcast Banner</Text>
                <Text style={styles.cardMeta}>Show an announcement to users on Glint.</Text>
                <TextInput value={broadcastMsg} onChangeText={setBroadcastMsg} placeholder="Announcement..." placeholderTextColor={colors.muted} style={styles.textArea} multiline />
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Broadcast active</Text>
                  <Switch value={broadcastActive} onValueChange={setBroadcastActive} trackColor={{ true: colors.brandPrimary }} />
                </View>
                <Button title="Save broadcast" onPress={() => sendBroadcast.mutate()} loading={sendBroadcast.isPending} />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Force App Update</Text>
                <Text style={styles.cardMeta}>Control the update prompt for users.</Text>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Force update popup</Text>
                  <Switch value={forceActive} onValueChange={setForceActive} trackColor={{ true: colors.brandPrimary }} />
                </View>
                <Button title="Save update setting" onPress={() => setForce.mutate()} loading={setForce.isPending} />
              </View>
            </View>
          )}

          {tab === "Audit" && (
            <Section loading={audit.isLoading} empty={!audit.data?.length} emptyText="No admin actions yet">
              {(audit.data || []).map((a: any) => (
                <View key={a.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{String(a.action || "").replaceAll("_", " ")}</Text>
                  <Text style={styles.cardDesc}>{a.reason || "No reason recorded"}</Text>
                  <Text style={styles.cardMeta}>{a.target_type} · {String(a.target_id || "").slice(0, 20)} · {a.created_at ? timeAgo(a.created_at) : ""}</Text>
                </View>
              ))}
            </Section>
          )}

          {tab === "System" && (
            <Section loading={system.isLoading} empty={!system.data} emptyText="System status unavailable">
              <View style={styles.card}>
                <Text style={styles.cardTitle}>System Health</Text>
                <HealthRow label="API" ok={!!system.data?.api} />
                <HealthRow label="Database" ok={!!system.data?.mongodb} />
                <HealthRow label={`Email (${system.data?.email_provider || "none"})`} ok={!!system.data?.email_configured} />
                <HealthRow label={`SMS (${system.data?.sms_provider || "none"})`} ok={!!system.data?.sms_configured} />
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Live Counters</Text>
                <InfoRow label="Users" value={system.data?.users} />
                <InfoRow label="Stored files" value={system.data?.files} />
                <InfoRow label="Open reports" value={system.data?.open_reports} />
                <InfoRow label="Open tickets" value={system.data?.open_tickets} />
                <InfoRow label="Open appeals" value={system.data?.open_appeals} />
              </View>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Admin Security</Text>
                <Text style={styles.cardDesc}>Passwords, OTP codes, hashes and secret keys are never displayed here. Individual user sessions can be force-logged-out from User Control.</Text>
              </View>
            </Section>
          )}
        </View>
      </ScrollView>

      <Modal visible={!!replyModal} transparent animationType="fade" onRequestClose={() => setReplyModal(null)}>
        <ModalShell>
          <Text style={styles.modalTitle}>Reply to ticket</Text>
          <TextInput value={replyText} onChangeText={setReplyText} placeholder="Type your reply..." placeholderTextColor={colors.muted} style={styles.textArea} multiline />
          <Button title="Send & resolve" onPress={() => replyText.trim() && resolveTicket.mutate()} loading={resolveTicket.isPending} />
          <Pressable onPress={() => setReplyModal(null)}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </ModalShell>
      </Modal>

      <Modal visible={!!reportDeleteModal} transparent animationType="fade" onRequestClose={() => setReportDeleteModal(null)}>
        <ModalShell>
          <Text style={styles.modalTitle}>{reportDeleteModal?.target_type === "user" ? "Remove reported account" : "Remove reported content"}</Text>
          <Text style={styles.modalHint}>Write the reason. It is saved in the audit log and shown to the affected user where applicable.</Text>
          <TextInput value={moderationReason} onChangeText={setModerationReason} placeholder="Reason..." placeholderTextColor={colors.muted} style={styles.textArea} multiline />
          <Button title="Confirm removal" variant="danger" onPress={() => moderationReason.trim() && delReported.mutate()} loading={delReported.isPending} disabled={!moderationReason.trim()} />
          <Pressable onPress={() => setReportDeleteModal(null)}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </ModalShell>
      </Modal>

      <Modal visible={!!contentAction} transparent animationType="fade" onRequestClose={() => setContentAction(null)}>
        <ModalShell>
          <Text style={styles.modalTitle}>{contentAction?.restore ? "Restore content" : "Remove content"}</Text>
          <TextInput value={contentReason} onChangeText={setContentReason} placeholder="Reason..." placeholderTextColor={colors.muted} style={styles.textArea} multiline />
          <Button title="Confirm" variant={contentAction?.restore ? "primary" : "danger"} onPress={() => contentReason.trim() && contentMut.mutate()} loading={contentMut.isPending} disabled={!contentReason.trim()} />
          <Pressable onPress={() => setContentAction(null)}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </ModalShell>
      </Modal>

      <Modal visible={!!appealAction} transparent animationType="fade" onRequestClose={() => setAppealAction(null)}>
        <ModalShell>
          <Text style={styles.modalTitle}>{appealAction?.decision === "approved" ? "Approve appeal" : "Reject appeal"}</Text>
          <TextInput value={appealNote} onChangeText={setAppealNote} placeholder="Admin note..." placeholderTextColor={colors.muted} style={styles.textArea} multiline />
          <Button title="Save decision" variant={appealAction?.decision === "rejected" ? "danger" : "primary"} onPress={() => appealMut.mutate()} loading={appealMut.isPending} />
          <Pressable onPress={() => setAppealAction(null)}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </ModalShell>
      </Modal>
    </View>
  );
}

function Stat({ icon, label, value }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.statTile}>
      <View style={styles.statIcon}><Icon name={icon} size={18} color={colors.brand} /></View>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ loading, empty, emptyText, children }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (loading) return <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />;
  if (empty) return <Empty text={emptyText} />;
  return <View style={{ gap: spacing.md }}>{children}</View>;
}

function Empty({ text }: { text: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return <View style={styles.emptyBox}><Icon name="checkmark-circle-outline" size={42} color={colors.muted} /><Text style={styles.emptyText}>{text}</Text></View>;
}

function ModalShell({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.modalOverlay}><View style={styles.modalCard}>{children}</View></View>;
}

function StatusPill({ status }: { status: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const good = status === "approved" || status === "resolved";
  const bad = status === "rejected";
  const fg = good ? colors.success : bad ? colors.error : colors.warning;
  return <View style={[styles.statusPill, { backgroundColor: fg + "20" }]}><Text style={[styles.statusText, { color: fg }]}>{status || "pending"}</Text></View>;
}

function HealthRow({ label, ok }: { label: string; ok: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.infoLine}>
      <Text style={styles.switchLabel}>{label}</Text>
      <View style={[styles.healthDot, { backgroundColor: ok ? colors.success : colors.error }]} />
      <Text style={[styles.cardMeta, { color: ok ? colors.success : colors.error }]}>{ok ? "OK" : "Needs attention"}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: any }) {
  const styles = useStyles();
  return <View style={styles.infoLine}><Text style={styles.switchLabel}>{label}</Text><Text style={styles.cardTitle}>{value ?? "—"}</Text></View>;
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 24 },
  subtitle: { color: c.muted, fontFamily: fonts.text, fontSize: 13 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  statTile: { width: "31.5%", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  statIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  statValue: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 21 },
  statLabel: { color: c.muted, fontFamily: fonts.text, fontSize: 10.5 },
  tabRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  chip: { flexShrink: 0, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  chipText: { fontFamily: fonts.semibold, fontSize: 14 },
  content: { paddingHorizontal: spacing.lg },
  card: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  cardTitle: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  cardDesc: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14, lineHeight: 20 },
  cardMeta: { color: c.muted, fontFamily: fonts.text, fontSize: 12 },
  warningText: { color: c.error, fontFamily: fonts.medium, fontSize: 12 },
  quoted: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 13, backgroundColor: c.surfaceTertiary, borderRadius: radius.sm, padding: spacing.md },
  attachImg: { width: "100%", height: 170, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  userRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md },
  searchInput: { flex: 1, minHeight: 46, color: c.onSurface, fontFamily: fonts.text, fontSize: 14 },
  viewBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  viewBtnText: { color: c.brand, fontFamily: fonts.semibold, fontSize: 13 },
  filterRow: { flexDirection: "row", gap: spacing.sm },
  filterChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  filterText: { fontFamily: fonts.semibold, fontSize: 12, textTransform: "capitalize" },
  statusPill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontFamily: fonts.semibold, fontSize: 11, textTransform: "capitalize" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.xs },
  switchLabel: { color: c.onSurface, fontFamily: fonts.medium, fontSize: 14, flex: 1 },
  input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, color: c.onSurface, fontFamily: fonts.text, fontSize: 14 },
  textArea: { minHeight: 100, textAlignVertical: "top", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, color: c.onSurface, fontFamily: fonts.text, fontSize: 14 },
  emptyBox: { alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: 44 },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: c.border },
  modalTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 21 },
  modalHint: { color: c.muted, fontFamily: fonts.text, fontSize: 13, lineHeight: 19 },
  cancel: { color: c.onSurfaceSecondary, fontFamily: fonts.semibold, fontSize: 15, textAlign: "center", paddingVertical: spacing.sm },
  infoLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6 },
  healthDot: { width: 10, height: 10, borderRadius: 5 },
}));
