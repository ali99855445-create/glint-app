import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, FlatList, ActivityIndicator, Modal, TextInput, Switch } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api, adminForm, fileUrl, ADMIN_TOKEN_KEY } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { Button } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { storage } from "@/src/utils/storage";
import { timeAgo } from "@/src/lib/time";

const TABS = ["Tickets", "Verify", "Reports", "Users", "Audit", "Broadcast"];

export default function AdminDashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("Tickets");
  const [replyModal, setReplyModal] = useState<{ id: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastActive, setBroadcastActive] = useState(true);
  const [forceActive, setForceActive] = useState(false);
  const [userQuery, setUserQuery] = useState("");

  const stats = useQuery({ queryKey: ["admin-stats"], queryFn: () => api.get("/admin/stats", true) });
  const tickets = useQuery_admin("tickets", "/admin/tickets", tab === "Tickets");
  const verifications = useQuery_admin("verifications", "/admin/verifications", tab === "Verify");
  const reports = useQuery_admin("reports", "/admin/reports", tab === "Reports");
  const audit = useQuery_admin("audit", "/admin/audit", tab === "Audit");
  const users = useQuery({ queryKey: ["admin-users", userQuery], queryFn: () => api.get(`/admin/users?q=${encodeURIComponent(userQuery)}`, true), enabled: tab === "Users" });

  function useQuery_admin(key: string, path: string, enabled: boolean) {
    return useQuery({ queryKey: [`admin-${key}`], queryFn: () => api.get(path, true), enabled });
  }

  const refreshAll = () => qc.invalidateQueries();

  const resolveTicket = useMutation({
    mutationFn: () => adminForm(`/admin/tickets/${replyModal!.id}/resolve`, { reply: replyText }),
    onSuccess: () => { toast.show("Ticket resolved", "success"); setReplyModal(null); setReplyText(""); qc.invalidateQueries({ queryKey: ["admin-tickets"] }); stats.refetch(); },
  });
  const approveV = useMutation({ mutationFn: (id: string) => api.post(`/admin/verifications/${id}/approve`, {}, true), onSuccess: () => { toast.show("Approved — Blue Tick granted", "success"); verifications.refetch(); stats.refetch(); } });
  const rejectV = useMutation({ mutationFn: (id: string) => api.post(`/admin/verifications/${id}/reject`, {}, true), onSuccess: () => { toast.show("Rejected", "info"); verifications.refetch(); } });
  const delContent = useMutation({ mutationFn: (id: string) => api.post(`/admin/reports/${id}/delete-content`, {}, true), onSuccess: () => { toast.show("Content removed", "success"); reports.refetch(); stats.refetch(); } });
  const dismissReport = useMutation({ mutationFn: (id: string) => api.post(`/admin/reports/${id}/dismiss`, {}, true), onSuccess: () => { reports.refetch(); stats.refetch(); } });
  const sendBroadcast = useMutation({ mutationFn: () => api.post("/admin/broadcast", { message: broadcastMsg, active: broadcastActive }, true), onSuccess: () => toast.show("Broadcast sent to all users", "success") });
  const setForce = useMutation({ mutationFn: (active: boolean) => api.post("/admin/force-update", { active, message: "A new version of Glint is available. Please update." }, true), onSuccess: () => toast.show("Force update setting saved", "success") });

  async function signOut() {
    await storage.secureRemove(ADMIN_TOKEN_KEY);
    router.replace("/(tabs)");
  }

  const S = stats.data || {};

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Admin Panel</Text>
          <Text style={styles.subtitle}>Glint control center</Text>
        </View>
        <Pressable onPress={signOut} style={styles.iconBtn} testID="admin-signout"><Icon name="log-out-outline" size={22} color={colors.onSurface} /></Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
        {/* stats grid */}
        <View style={styles.statsGrid}>
          <Stat icon="people" label="Users" value={S.users} />
          <Stat icon="document-text" label="Posts" value={S.posts} />
          <Stat icon="radio" label="Stories" value={S.stories} />
          <Stat icon="ribbon" label="Pending Verify" value={S.pending_verifications} />
          <Stat icon="help-buoy" label="Open Tickets" value={S.open_tickets} />
          <Stat icon="flag" label="Reports" value={S.open_reports} />
          <Stat icon="ban" label="Suspended" value={S.suspended_users} />
          <Stat icon="checkmark-circle" label="Blue Tick" value={S.blue_tick_users} />
        </View>

        {/* tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {TABS.map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.chip, tab === t && { backgroundColor: colors.brandPrimary }]} testID={`admin-tab-${t}`}>
              <Text style={[styles.chipText, { color: tab === t ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.content}>
          {tab === "Tickets" && (
            <Section loading={tickets.isLoading} empty={!tickets.data?.length} emptyText="No tickets">
              {(tickets.data || []).map((t: any) => (
                <View key={t.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>{t.subject}</Text>
                    <View style={[styles.statusPill, { backgroundColor: t.status === "resolved" ? colors.success + "22" : colors.warning + "22" }]}>
                      <Text style={[styles.statusText, { color: t.status === "resolved" ? colors.success : colors.warning }]}>{t.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardDesc}>{t.description}</Text>
                  {t.user && <Text style={styles.cardMeta}>@{t.user.username} · {timeAgo(t.created_at)}</Text>}
                  {t.screenshot && <Image source={{ uri: fileUrl(t.screenshot) }} style={styles.attachImg} contentFit="cover" />}
                  {t.status !== "resolved" && (
                    <Button title="Reply & resolve" small onPress={() => { setReplyModal({ id: t.id }); setReplyText(""); }} testID={`admin-resolve-${t.id}`} style={{ alignSelf: "flex-start", marginTop: spacing.sm }} />
                  )}
                </View>
              ))}
            </Section>
          )}

          {tab === "Verify" && (
            <Section loading={verifications.isLoading} empty={!verifications.data?.length} emptyText="No verification requests">
              {(verifications.data || []).map((v: any) => (
                <View key={v.id} style={styles.card}>
                  <View style={styles.userRow}>
                    <Avatar uri={v.user?.avatar} name={v.user?.full_name} size={44} />
                    <View style={{ flex: 1 }}>
                      <UserName name={v.user?.full_name} verified={v.user?.verified} size={15} />
                      <Text style={styles.cardMeta}>Legal name: {v.full_legal_name}</Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: colors.surfaceTertiary }]}><Text style={[styles.statusText, { color: colors.onSurfaceTertiary }]}>{v.status}</Text></View>
                  </View>
                  {v.note ? <Text style={styles.cardDesc}>{v.note}</Text> : null}
                  {v.document && (<><Text style={styles.cardMeta}>ID document</Text><Image source={{ uri: fileUrl(v.document) }} style={styles.attachImg} contentFit="cover" /></>)}
                  {v.selfie && (<><Text style={styles.cardMeta}>Live selfie</Text><Image source={{ uri: fileUrl(v.selfie) }} style={styles.attachImg} contentFit="cover" /></>)}
                  {v.status === "pending" && (
                    <View style={styles.actionRow}>
                      <Button title="Approve" small onPress={() => approveV.mutate(v.id)} testID={`admin-approve-${v.id}`} style={{ flex: 1 }} />
                      <Button title="Reject" small variant="secondary" onPress={() => rejectV.mutate(v.id)} testID={`admin-reject-${v.id}`} style={{ flex: 1 }} />
                    </View>
                  )}
                </View>
              ))}
            </Section>
          )}

          {tab === "Reports" && (
            <Section loading={reports.isLoading} empty={!reports.data?.length} emptyText="No open reports">
              {(reports.data || []).map((r: any) => (
                <View key={r.id} style={styles.card}>
                  <Text style={styles.cardTitle}>Reported {r.target_type}</Text>
                  <Text style={styles.cardDesc}>Reason: {r.reason}</Text>
                  {r.target?.text ? <Text style={styles.quoted}>&quot;{r.target.text}&quot;</Text> : null}
                  {r.target?.image && <Image source={{ uri: fileUrl(r.target.image) }} style={styles.attachImg} contentFit="cover" />}
                  <View style={styles.actionRow}>
                    <Button title="Delete content" small variant="danger" onPress={() => delContent.mutate(r.id)} testID={`admin-delcontent-${r.id}`} style={{ flex: 1 }} />
                    <Button title="Dismiss" small variant="secondary" onPress={() => dismissReport.mutate(r.id)} testID={`admin-dismiss-${r.id}`} style={{ flex: 1 }} />
                  </View>
                </View>
              ))}
            </Section>
          )}

          {tab === "Users" && (
            <View style={{ gap: spacing.sm }}>
              <View style={styles.searchWrap}>
                <Icon name="search" size={18} color={colors.muted} />
                <TextInput value={userQuery} onChangeText={setUserQuery} placeholder="Search name, username, email or phone" placeholderTextColor={colors.muted} style={styles.searchInput} testID="admin-user-search" />
              </View>
              {users.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : (users.data || []).map((u: any) => (
                <View key={u.id} style={styles.card}>
                  <View style={styles.userRow}>
                    <Avatar uri={u.avatar} name={u.full_name} size={44} />
                    <View style={{ flex: 1 }}>
                      <UserName name={u.full_name} verified={u.verified} size={15} />
                      <Text style={styles.cardMeta}>@{u.username}{u.suspended ? " · suspended" : ""}{u.blue_tick ? " · Blue Tick" : ""}</Text>
                      <Text style={styles.cardMeta}>{u.email || u.phone || "No contact"}</Text>
                    </View>
                    <Pressable style={styles.viewBtn} onPress={() => router.push(`/admin/user/${u.id}`)} testID={`admin-view-${u.username}`}>
                      <Text style={styles.viewBtnText}>View</Text>
                      <Icon name="chevron-forward" size={16} color={colors.brand} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {tab === "Audit" && (
            <Section loading={audit.isLoading} empty={!audit.data?.length} emptyText="No admin actions yet">
              {(audit.data || []).map((a: any) => (
                <View key={a.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{String(a.action || "").replaceAll("_", " ")}</Text>
                  <Text style={styles.cardDesc}>{a.reason || "No reason recorded"}</Text>
                  <Text style={styles.cardMeta}>{a.target_type} · {String(a.target_id || "").slice(0, 16)} · {timeAgo(a.created_at)}</Text>
                </View>
              ))}
            </Section>
          )}

          {tab === "Broadcast" && (
            <View style={{ gap: spacing.lg }}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Broadcast Banner</Text>
                <Text style={styles.cardMeta}>Show a message to all users on their home feed.</Text>
                <TextInput value={broadcastMsg} onChangeText={setBroadcastMsg} placeholder="Your announcement..." placeholderTextColor={colors.muted} style={styles.textArea} multiline testID="admin-broadcast-input" />
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Active</Text>
                  <Switch value={broadcastActive} onValueChange={setBroadcastActive} trackColor={{ true: colors.brandPrimary }} testID="admin-broadcast-active" />
                </View>
                <Button title="Send broadcast" onPress={() => broadcastMsg.trim() ? sendBroadcast.mutate() : toast.show("Enter a message", "error")} testID="admin-broadcast-send" />
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Force App Update</Text>
                <Text style={styles.cardMeta}>Prompt all users to update to the latest version.</Text>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Force update popup</Text>
                  <Switch value={forceActive} onValueChange={(v) => { setForceActive(v); setForce.mutate(v); }} trackColor={{ true: colors.brandPrimary }} testID="admin-force-update" />
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={!!replyModal} transparent animationType="fade" onRequestClose={() => setReplyModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reply to ticket</Text>
            <TextInput value={replyText} onChangeText={setReplyText} placeholder="Type your reply..." placeholderTextColor={colors.muted} style={styles.textArea} multiline testID="admin-reply-input" />
            <Button title="Send & resolve" onPress={() => replyText.trim() && resolveTicket.mutate()} loading={resolveTicket.isPending} testID="admin-reply-send" />
            <Pressable onPress={() => setReplyModal(null)} testID="admin-reply-cancel"><Text style={styles.cancel}>Cancel</Text></Pressable>
          </View>
        </View>
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
  if (empty) return <View style={styles.emptyBox}><Icon name="checkmark-circle-outline" size={44} color={colors.muted} /><Text style={styles.emptyText}>{emptyText}</Text></View>;
  return <View style={{ gap: spacing.md }}>{children}</View>;
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 24 },
  subtitle: { color: c.muted, fontFamily: fonts.text, fontSize: 13 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  statTile: { width: "31.5%", backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  statIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  statValue: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 22 },
  statLabel: { color: c.muted, fontFamily: fonts.text, fontSize: 11 },
  tabRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  chip: { flexShrink: 0, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  chipText: { fontFamily: fonts.semibold, fontSize: 14 },
  content: { paddingHorizontal: spacing.lg },
  card: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { flex: 1, color: c.onSurface, fontFamily: fonts.semibold, fontSize: 16 },
  cardDesc: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14, lineHeight: 20 },
  cardMeta: { color: c.muted, fontFamily: fonts.text, fontSize: 13 },
  quoted: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14, fontStyle: "italic", backgroundColor: c.surfaceTertiary, padding: spacing.md, borderRadius: radius.sm },
  attachImg: { width: "100%", height: 160, borderRadius: radius.sm, marginTop: spacing.xs, backgroundColor: c.surfaceTertiary },
  statusPill: { paddingHorizontal: spacing.md, paddingVertical: 3, borderRadius: radius.pill },
  statusText: { fontFamily: fonts.semibold, fontSize: 12, textTransform: "capitalize" },
  userRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  searchInput: { flex: 1, color: c.onSurface, fontFamily: fonts.text, fontSize: 15 },
  viewBtn: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: c.brandTertiary, borderRadius: radius.pill },
  viewBtnText: { color: c.brand, fontFamily: fonts.semibold, fontSize: 13 },
  textArea: { minHeight: 90, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, color: c.onSurface, fontFamily: fonts.text, fontSize: 15, textAlignVertical: "top", marginVertical: spacing.sm },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing.sm },
  switchLabel: { color: c.onSurface, fontFamily: fonts.medium, fontSize: 15 },
  emptyBox: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing["2xl"] },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
  modalTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 20 },
  cancel: { color: c.onSurfaceSecondary, fontFamily: fonts.semibold, fontSize: 15, textAlign: "center", marginTop: spacing.sm },
}));
