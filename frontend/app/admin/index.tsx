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

const TABS = ["Users", "Content", "Reports", "Appeals", "Verify", "Tickets", "Controls", "Audit", "Messages", "Warnings", "System"];
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
  const [userFilter, setUserFilter] = useState("all");
  const [contentKind, setContentKind] = useState("all");
  const [reportType, setReportType] = useState("all");
  const [queueStatus, setQueueStatus] = useState("all");
  const [moduleMenu, setModuleMenu] = useState(false);
  const [verificationAction, setVerificationAction] = useState<{ id: string; approve: boolean } | null>(null);
  const [verificationReason, setVerificationReason] = useState("");
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [dismissId, setDismissId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const validReason = (value: string) => value.trim().length >= 10 && value.trim().length <= 4000;
  const actionError = (e: any) => toast.show(e.message || "Action failed. Please try again.", "error");
  const openVerification = (id: string, approve: boolean) => { setVerificationAction({ id, approve }); setVerificationReason(""); setIdentityConfirmed(false); };
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
    queryKey: ["admin-users", userQuery, userFilter],
    queryFn: () => api.get(`/admin/users?q=${encodeURIComponent(userQuery)}&filter=${userFilter}`, true),
    enabled: tab === "Users",
  });
  const contentQ = useQuery({
    queryKey: ["admin-content", contentStatus, contentKind],
    queryFn: () => api.get(`/admin/content?kind=${contentKind}&status=${contentStatus}`, true),
    enabled: tab === "Content",
  });
  const reports = useQuery({ queryKey: ["admin-reports", reportType], queryFn: () => api.get(`/admin/reports?target_type=${reportType}`, true), enabled: tab === "Reports" });
  const appeals = useQuery({ queryKey: ["admin-appeals"], queryFn: () => api.get("/admin/appeals", true), enabled: tab === "Appeals" });
  const verifications = useQuery({ queryKey: ["admin-verifications"], queryFn: () => api.get("/admin/verifications", true), enabled: tab === "Verify" });
  const tickets = useQuery({ queryKey: ["admin-tickets"], queryFn: () => api.get("/admin/tickets", true), enabled: tab === "Tickets" });
  const controls = useQuery({ queryKey: ["admin-controls"], queryFn: () => api.get("/admin/controls", true), enabled: tab === "Controls" });
  const audit = useQuery({ queryKey: ["admin-audit"], queryFn: () => api.get("/admin/audit", true), enabled: tab === "Audit" });
  const system = useQuery({ queryKey: ["admin-system"], queryFn: () => api.get("/admin/system", true), enabled: tab === "System" });

  const activity = useQuery({ queryKey: ["admin-activity", tab], queryFn: () => api.get(`/admin/activity-summary?kind=${tab.toLowerCase()}`, true), enabled: tab === "Messages" || tab === "Warnings" });
  const activeQuery = ({ Users: users, Content: contentQ, Reports: reports, Appeals: appeals, Verify: verifications, Tickets: tickets, Controls: controls, Audit: audit, Messages: activity, Warnings: activity, System: system } as Record<string, any>)[tab];
  const queueRows = (rows: any[] = []) => queueStatus === "all" ? rows : rows.filter((row) => row.status === queueStatus);
  const openStat = (label: string) => {
    setQueueStatus("all"); setUserQuery(""); setUserFilter("all"); setContentKind("all"); setContentStatus("all"); setReportType("all");
    if (["Users", "Active 24h", "Suspended", "Blue Tick"].includes(label)) { setTab("Users"); setUserFilter(({ "Active 24h": "active", Suspended: "suspended", "Blue Tick": "blue" } as Record<string, string>)[label] || "all"); }
    else if (["Posts", "Comments", "Stories"].includes(label)) { setTab("Content"); setContentKind(({ Posts: "post", Comments: "comment", Stories: "story" } as Record<string, string>)[label]); setContentStatus("active"); }
    else if (label === "Verify Queue") { setTab("Verify"); setQueueStatus("pending"); }
    else { setTab(label); if (["Appeals", "Tickets"].includes(label)) setQueueStatus("open"); }
  };

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
    qc.invalidateQueries({ queryKey: ["admin-activity"] });
  };

  const resolveTicket = useMutation({
    mutationFn: () => adminForm(`/admin/tickets/${replyModal!.id}/resolve`, { reply: replyText }),
    onSuccess: () => {
      toast.show("Ticket resolved", "success");
      setReplyModal(null);
      setReplyText("");
      refreshAll();
    },
    onError: actionError,
  });

  const verificationMut = useMutation({
    mutationFn: () => api.post(`/admin/verifications/${verificationAction!.id}/${verificationAction!.approve ? "approve" : "reject"}`, { reason: verificationReason.trim(), identity_match_confirmed: identityConfirmed }, true),
    onSuccess: () => { toast.show("Verification decision saved", "success"); setVerificationAction(null); refreshAll(); },
    onError: actionError,
  });

  const delReported = useMutation({
    mutationFn: () => api.post(`/admin/reports/${reportDeleteModal!.id}/delete-content`, { reason: moderationReason.trim() }, true),
    onSuccess: () => {
      toast.show(reportDeleteModal?.target_type === "user" ? "Account removed" : "Content removed", "success");
      setReportDeleteModal(null);
      setModerationReason("");
      refreshAll();
    },
    onError: actionError,
  });
  const dismissReport = useMutation({
    mutationFn: () => api.post(`/admin/reports/${dismissId}/dismiss`, { reason: dismissReason.trim() }, true),
    onSuccess: () => { setDismissId(null); refreshAll(); },
    onError: actionError,
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
    onError: actionError,
  });

  const sendBroadcast = useMutation({
    mutationFn: () => api.post("/admin/broadcast", { message: broadcastMsg, active: broadcastActive }, true),
    onSuccess: () => { toast.show("Broadcast saved", "success"); refreshAll(); },
    onError: actionError,
  });
  const setForce = useMutation({
    mutationFn: () => api.post("/admin/force-update", {
      active: forceActive,
      message: "A new version of Glint is available. Please update.",
      min_version: null,
    }, true),
    onSuccess: () => { toast.show("Force update setting saved", "success"); refreshAll(); },
    onError: actionError,
  });
  const saveControls = useMutation({
    mutationFn: () => api.post("/admin/controls", {
      maintenance_mode: maintenanceActive,
      maintenance_message: maintenanceMessage,
    }, true),
    onSuccess: () => { toast.show("App controls saved", "success"); refreshAll(); },
    onError: actionError,
  });

  const saveModule = useMutation({
    mutationFn: (key: string) => api.post("/admin/controls", { [key]: featureFlags[key] }, true),
    onSuccess: () => { toast.show("Module setting saved", "success"); refreshAll(); },
    onError: actionError,
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
          <Stat icon="people" label="Users" value={S.users} onPress={() => openStat("Users")} />
          <Stat icon="pulse" label="Active 24h" value={S.active_24h} onPress={() => openStat("Active 24h")} />
          <Stat icon="images" label="Stories" value={S.stories} onPress={() => openStat("Stories")} />
          <Stat icon="document-text" label="Posts" value={S.posts} onPress={() => openStat("Posts")} />
          <Stat icon="chatbubbles" label="Messages" value={S.messages} onPress={() => openStat("Messages")} />
          <Stat icon="flag" label="Reports" value={S.open_reports} onPress={() => openStat("Reports")} />
          <Stat icon="mail-open" label="Appeals" value={S.open_appeals} onPress={() => openStat("Appeals")} />
          <Stat icon="ban" label="Suspended" value={S.suspended_users} onPress={() => openStat("Suspended")} />
          <Stat icon="checkmark-circle" label="Blue Tick" value={S.blue_tick_users} onPress={() => openStat("Blue Tick")} />
          <Stat icon="ribbon" label="Verify Queue" value={S.pending_verifications} onPress={() => openStat("Verify Queue")} />
          <Stat icon="help-buoy" label="Tickets" value={S.open_tickets} onPress={() => openStat("Tickets")} />
          <Stat icon="warning" label="Warnings" value={S.warnings} onPress={() => openStat("Warnings")} />
          <Stat icon="chatbox" label="Comments" value={S.comments} onPress={() => openStat("Comments")} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {TABS.map((t) => (
            <Pressable key={t} onPress={() => { setTab(t); setQueueStatus("all"); }} style={[styles.chip, tab === t && { backgroundColor: colors.brandPrimary }]} testID={`admin-tab-${t}`}>
              <Text style={[styles.chipText, { color: tab === t ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.content}>
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{tab}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`${tab} settings`} testID="admin-module-menu" onPress={() => setModuleMenu(true)} style={styles.iconBtn}><Icon name="ellipsis-vertical" size={22} color={colors.onSurface} /></Pressable>
          </View>
          {activeQuery?.isError ? <View style={styles.card}><Text style={styles.warningText}>{activeQuery.error?.message || "Unable to load this module"}</Text><Button title="Retry" onPress={() => activeQuery.refetch()} /></View> : null}
          {["Verify", "Tickets", "Appeals"].includes(tab) ? <FilterOptions values={tab === "Verify" ? ["all", "pending", "approved", "rejected"] : tab === "Tickets" ? ["all", "open", "resolved"] : ["all", "open", "approved", "rejected"]} value={queueStatus} onChange={setQueueStatus} /> : null}

          {tab === "Users" && (
            <View style={{ gap: spacing.sm }}>
              <FilterOptions values={["all", "active", "suspended", "blue"]} value={userFilter} onChange={setUserFilter} />
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
                    <Pressable accessibilityLabel="Account settings" style={styles.viewBtn} onPress={() => router.push(`/admin/user/${u.id}`)}>
                      <Text style={styles.viewBtnText}>Settings</Text>
                      <Icon name="ellipsis-vertical" size={20} color={colors.brand} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {tab === "Content" && (
            <View style={{ gap: spacing.md }}>
              <FilterOptions values={["all", "post", "story", "comment"]} value={contentKind} onChange={setContentKind} />
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
                    <ActionMenu>
                    <Button
                      title={item.deleted_at ? "Restore content" : "Remove content"}
                      small
                      variant={item.deleted_at ? "secondary" : "danger"}
                      onPress={() => {
                        setContentAction({ id: item.id, kind: item.kind, restore: !!item.deleted_at });
                        setContentReason("");
                      }}
                      style={{ alignSelf: "flex-start" }}
                    />
                    </ActionMenu>
                  </View>
                ))}
              </Section>
            </View>
          )}

          {tab === "Reports" && (
            <View style={{ gap: spacing.md }}><FilterOptions values={["all", "post", "story", "comment", "user", "group", "message"]} value={reportType} onChange={setReportType} />
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
                  <ActionMenu>
                    <Button
                      title={r.target_type === "user" ? "Remove account" : "Delete content"}
                      small variant="danger"
                      onPress={() => { setReportDeleteModal({ id: r.id, target_type: r.target_type }); setModerationReason(""); }}
                      style={{ flex: 1 }}
                    />
                    <Button title="Dismiss" small variant="secondary" onPress={() => { setDismissId(r.id); setDismissReason(""); }} style={{ flex: 1 }} />
                  </ActionMenu>
                </View>
              ))}
            </Section></View>
          )}

          {tab === "Appeals" && (
            <Section loading={appeals.isLoading} empty={!queueRows(appeals.data).length} emptyText="No appeals">
              {queueRows(appeals.data).map((a: any) => (
                <View key={a.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{a.category || "Account"} appeal</Text>
                    <StatusPill status={a.status} />
                  </View>
                  {a.user ? <Text style={styles.cardMeta}>{a.user.full_name} · @{a.user.username}</Text> : null}
                  <Text style={styles.cardDesc}>{a.reason}</Text>
                  {a.admin_note ? <Text style={styles.cardMeta}>Admin note: {a.admin_note}</Text> : null}
                  {a.status === "open" ? (
                    <ActionMenu>
                      <Button title="Approve & restore" small onPress={() => { setAppealAction({ id: a.id, decision: "approved", restoreAccount: true }); setAppealNote(""); }} style={{ flex: 1 }} />
                      <Button title="Reject" small variant="secondary" onPress={() => { setAppealAction({ id: a.id, decision: "rejected", restoreAccount: false }); setAppealNote(""); }} style={{ flex: 1 }} />
                    </ActionMenu>
                  ) : null}
                </View>
              ))}
            </Section>
          )}

          {tab === "Verify" && (
            <Section loading={verifications.isLoading} empty={!queueRows(verifications.data).length} emptyText="No Blue Tick requests">
              {queueRows(verifications.data).map((v: any) => (
                <View key={v.id} style={styles.card}>
                  <View style={styles.userRow}>
                    <Avatar uri={v.user?.avatar} name={v.user?.full_name} size={44} />
                    <View style={{ flex: 1 }}>
                      <UserName name={v.user?.full_name} verified={v.user?.verified} size={15} />
                      <Text style={styles.cardMeta}>Legal name: {v.full_legal_name}</Text>
                    </View>
                    <StatusPill status={v.status} />
                  </View>
                  {v.review_reason ? <Text style={styles.quoted}>Decision reason: {v.review_reason}</Text> : null}
                  {v.note ? <Text style={styles.cardDesc}>{v.note}</Text> : null}
                  {v.document ? <><Text style={styles.cardMeta}>ID document</Text><Image source={{ uri: fileUrl(v.document) }} style={styles.attachImg} contentFit="cover" /></> : null}
                  {v.selfie ? <><Text style={styles.cardMeta}>Live selfie</Text><Image source={{ uri: fileUrl(v.selfie) }} style={styles.attachImg} contentFit="cover" /></> : null}
                  {v.status === "pending" ? (
                    <ActionMenu>
                      <Button title="Grant Blue Tick" small onPress={() => openVerification(v.id, true)} style={{ flex: 1 }} />
                      <Button title="Reject" small variant="secondary" onPress={() => openVerification(v.id, false)} style={{ flex: 1 }} />
                    </ActionMenu>
                  ) : null}
                </View>
              ))}
            </Section>
          )}

          {tab === "Tickets" && (
            <Section loading={tickets.isLoading} empty={!queueRows(tickets.data).length} emptyText="No support tickets">
              {queueRows(tickets.data).map((t: any) => (
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

          {tab === "Messages" && !activity.isError && <Section loading={activity.isLoading} empty={false}><View style={styles.card}><Text style={styles.cardTitle}>Message activity</Text><Text style={styles.cardDesc}>Total messages: {activity.data?.total ?? "—"}</Text><Button title={`Open message reports (${activity.data?.group_reports ?? 0})`} onPress={() => { setReportType("message"); setTab("Reports"); }} /></View></Section>}
          {tab === "Warnings" && !activity.isError && <Section loading={activity.isLoading} empty={!activity.data?.length} emptyText="No warnings">{(Array.isArray(activity.data) ? activity.data : []).map((w: any) => <View key={w.id} style={styles.card}><Text style={styles.cardDesc}>{w.reason || w.message || "Account warning"}</Text><Text style={styles.cardMeta}>{w.created_at ? timeAgo(w.created_at) : ""}</Text><Button title="Open account" small onPress={() => router.push(`/admin/user/${w.user_id}`)} /></View>)}</Section>}
          {tab === "Controls" && (
            <View style={{ gap: spacing.lg }}>
              <Text style={styles.cardMeta}>Module controls apply to both the app and web admin. Save each module separately.</Text>
              {Object.keys(FLAG_LABELS).map((key) => <View key={key} style={styles.card}>
                <Text style={styles.cardTitle}>{FLAG_LABELS[key]}</Text>
                <View style={styles.switchRow}><Text style={styles.switchLabel}>Enabled</Text><Switch value={featureFlags[key] !== false} onValueChange={(v) => setFeatureFlags((prev) => ({ ...prev, [key]: v }))} trackColor={{ true: colors.brandPrimary }} /></View>
                <Button title="Save this module" onPress={() => saveModule.mutate(key)} disabled={!controls.data || saveModule.isPending} loading={saveModule.isPending && saveModule.variables === key} />
              </View>)}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Maintenance Mode</Text>
                <Text style={styles.cardMeta}>Save a maintenance state and message. Feature switches above are enforced immediately by the backend.</Text>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Maintenance flag</Text>
                  <Switch value={maintenanceActive} onValueChange={setMaintenanceActive} trackColor={{ true: colors.brandPrimary }} />
                </View>
                <TextInput value={maintenanceMessage} onChangeText={setMaintenanceMessage} placeholder="Maintenance message..." placeholderTextColor={colors.muted} style={styles.input} />
                <Button disabled={!controls.data} title="Save maintenance setting" onPress={() => saveControls.mutate()} loading={saveControls.isPending} />
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

      <Modal visible={moduleMenu} transparent animationType="fade" onRequestClose={() => setModuleMenu(false)}>
        <ModalShell><Text style={styles.modalTitle}>{tab} settings</Text><Button title="Refresh this module" onPress={() => { activeQuery?.refetch(); setModuleMenu(false); }} />
          <Button title="Feature & maintenance controls" onPress={() => { setTab("Controls"); setModuleMenu(false); }} />
          <Button title="View decision history" onPress={() => { setTab("Audit"); setModuleMenu(false); }} />
          <Button title="Reset module filters" onPress={() => { setUserFilter("all"); setUserQuery(""); setContentKind("all"); setContentStatus("all"); setReportType("all"); setQueueStatus("all"); setModuleMenu(false); }} />
          <Pressable onPress={() => setModuleMenu(false)}><Text style={styles.cancel}>Close</Text></Pressable>
        </ModalShell>
      </Modal>
      <Modal visible={!!verificationAction} transparent animationType="fade" onRequestClose={() => setVerificationAction(null)}>
        <ModalShell><Text style={styles.modalTitle}>{verificationAction?.approve ? "Approve verification" : "Reject verification"}</Text>
          <Text style={styles.modalHint}>This reason is saved in the decision history and sent to the applicant.</Text>
          <TextInput value={verificationReason} onChangeText={setVerificationReason} placeholder="Specific reason (10–4000 characters)" maxLength={4000} placeholderTextColor={colors.muted} style={styles.textArea} multiline />
          {verificationAction?.approve ? <View style={styles.switchRow}><Text style={styles.switchLabel}>I checked the document name, profile name and live selfie match.</Text><Switch value={identityConfirmed} onValueChange={setIdentityConfirmed} /></View> : null}
          <Button title="Save decision" variant={verificationAction?.approve ? "primary" : "danger"} disabled={!validReason(verificationReason) || (!!verificationAction?.approve && !identityConfirmed)} loading={verificationMut.isPending} onPress={() => verificationMut.mutate()} />
          <Pressable onPress={() => setVerificationAction(null)}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </ModalShell>
      </Modal>
      <Modal visible={!!dismissId} transparent animationType="fade" onRequestClose={() => setDismissId(null)}>
        <ModalShell><Text style={styles.modalTitle}>Dismiss report</Text><Text style={styles.modalHint}>Explain why no action is needed. The reporter receives this reason.</Text>
          <TextInput value={dismissReason} onChangeText={setDismissReason} placeholder="Specific reason (10–4000 characters)" maxLength={4000} placeholderTextColor={colors.muted} style={styles.textArea} multiline />
          <Button title="Dismiss with reason" disabled={!validReason(dismissReason)} loading={dismissReport.isPending} onPress={() => dismissReport.mutate()} />
          <Pressable onPress={() => setDismissId(null)}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </ModalShell>
      </Modal>
      <Modal visible={!!replyModal} transparent animationType="fade" onRequestClose={() => setReplyModal(null)}>
        <ModalShell>
          <Text style={styles.modalTitle}>Reply to ticket</Text>
          <TextInput value={replyText} onChangeText={setReplyText} placeholder="Type your reply..." placeholderTextColor={colors.muted} style={styles.textArea} multiline />
          <Button title="Send & resolve" onPress={() => validReason(replyText) && resolveTicket.mutate()} disabled={!validReason(replyText)} loading={resolveTicket.isPending} />
          <Pressable onPress={() => setReplyModal(null)}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </ModalShell>
      </Modal>

      <Modal visible={!!reportDeleteModal} transparent animationType="fade" onRequestClose={() => setReportDeleteModal(null)}>
        <ModalShell>
          <Text style={styles.modalTitle}>{reportDeleteModal?.target_type === "user" ? "Remove reported account" : "Remove reported content"}</Text>
          <Text style={styles.modalHint}>Write the reason. It is saved in the audit log and shown to the affected user where applicable.</Text>
          <TextInput value={moderationReason} onChangeText={setModerationReason} placeholder="Specific reason (10–4000 characters)..." maxLength={4000} placeholderTextColor={colors.muted} style={styles.textArea} multiline />
          <Button title="Confirm removal" variant="danger" onPress={() => validReason(moderationReason) && delReported.mutate()} loading={delReported.isPending} disabled={!validReason(moderationReason)} />
          <Pressable onPress={() => setReportDeleteModal(null)}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </ModalShell>
      </Modal>

      <Modal visible={!!contentAction} transparent animationType="fade" onRequestClose={() => setContentAction(null)}>
        <ModalShell>
          <Text style={styles.modalTitle}>{contentAction?.restore ? "Restore content" : "Remove content"}</Text>
          <TextInput value={contentReason} onChangeText={setContentReason} placeholder="Specific reason (10–4000 characters)..." maxLength={4000} placeholderTextColor={colors.muted} style={styles.textArea} multiline />
          <Button title="Confirm" variant={contentAction?.restore ? "primary" : "danger"} onPress={() => validReason(contentReason) && contentMut.mutate()} loading={contentMut.isPending} disabled={!validReason(contentReason)} />
          <Pressable onPress={() => setContentAction(null)}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </ModalShell>
      </Modal>

      <Modal visible={!!appealAction} transparent animationType="fade" onRequestClose={() => setAppealAction(null)}>
        <ModalShell>
          <Text style={styles.modalTitle}>{appealAction?.decision === "approved" ? "Approve appeal" : "Reject appeal"}</Text>
          <TextInput value={appealNote} onChangeText={setAppealNote} placeholder="Decision reason (10–4000 characters)..." maxLength={4000} placeholderTextColor={colors.muted} style={styles.textArea} multiline />
          <Button title="Save decision" variant={appealAction?.decision === "rejected" ? "danger" : "primary"} onPress={() => validReason(appealNote) && appealMut.mutate()} disabled={!validReason(appealNote)} loading={appealMut.isPending} />
          <Pressable onPress={() => setAppealAction(null)}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </ModalShell>
      </Modal>
    </View>
  );
}

function Stat({ icon, label, value, onPress }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${label}`} testID={`admin-stat-${label.replace(/ /g, "-")}`} onPress={onPress} style={styles.statTile}>
      <View style={styles.statIcon}><Icon name={icon} size={18} color={colors.brand} /></View>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

function ActionMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false); const styles = useStyles(); const { colors } = useTheme();
  return <View style={{ gap: spacing.sm }}><Pressable accessibilityRole="button" accessibilityLabel="Review actions" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={[styles.viewBtn, { alignSelf: "flex-end" }]}><Text style={styles.viewBtnText}>Actions</Text><Icon name="ellipsis-vertical" size={20} color={colors.onSurface} /></Pressable>{open ? <View style={{ gap: spacing.sm }}>{children}</View> : null}</View>;
}

function FilterOptions({ values, value, onChange }: { values: string[]; value: string; onChange: (v: string) => void }) {
  const styles = useStyles(); const { colors } = useTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>{values.map((v) => <Pressable key={v} accessibilityRole="button" accessibilityState={{ selected: value === v }} onPress={() => onChange(v)} style={[styles.filterChip, value === v && { backgroundColor: colors.brandPrimary }]}><Text style={[styles.filterText, { color: value === v ? colors.onBrandPrimary : colors.onSurface }]}>{v}</Text></Pressable>)}</ScrollView>;
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
