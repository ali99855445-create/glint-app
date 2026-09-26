import React, { useEffect, useState } from "react";
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
  | "restorePost"
  | "deleteComment"
  | "restoreComment"
  | "deleteStory"
  | "restoreStory"
  | "warn"
  | "restrict"
  | "clearRestrictions"
  | "forceLogout";

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
  const [postingDays, setPostingDays] = useState("7");
  const [messagingDays, setMessagingDays] = useState("7");

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editPrivacy, setEditPrivacy] = useState("public");
  const [editContactVisibility, setEditContactVisibility] = useState("only_me");

  const detail = useQuery({
    queryKey: ["admin-user-full", id],
    queryFn: () => api.get(`/admin/users/${id}/full`, true),
    enabled: !!id,
  });

  const u = detail.data?.user;

  useEffect(() => {
    if (!u || !editOpen) return;
    setEditName(u.full_name || "");
    setEditUsername(u.username || "");
    setEditBio(u.bio || "");
    setEditLocation(u.location || "");
    setEditPrivacy(u.privacy || "public");
    setEditContactVisibility(u.contact_visibility || "only_me");
  }, [editOpen, u]);

  const editProfile = useMutation({
    mutationFn: () => api.post(`/admin/users/${id}/edit`, {
      full_name: editName.trim(),
      username: editUsername.trim(),
      bio: editBio.trim() || null,
      location: editLocation.trim() || null,
      privacy: editPrivacy,
      contact_visibility: editContactVisibility,
    }, true),
    onSuccess: () => {
      toast.show("Profile updated", "success");
      setEditOpen(false);
      detail.refetch();
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-audit"] });
    },
    onError: (e: any) => toast.show(e.message || "Could not update profile", "error"),
  });

  const runAction = useMutation({
    mutationFn: async () => {
      if (!action) return;
      const why = reason.trim() || "Glint administrator action";
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
        case "restorePost":
          return api.post(`/admin/posts/${action.targetId}/restore`, { reason: why }, true);
        case "deleteComment":
          return api.post(`/admin/comments/${action.targetId}/delete`, { reason: why }, true);
        case "restoreComment":
          return api.post(`/admin/comments/${action.targetId}/restore`, { reason: why }, true);
        case "deleteStory":
          return api.post(`/admin/stories/${action.targetId}/delete`, { reason: why }, true);
        case "restoreStory":
          return api.post(`/admin/stories/${action.targetId}/restore`, { reason: why }, true);
        case "warn":
          return api.post(`/admin/users/${id}/warn`, { reason: why }, true);
        case "restrict":
          return api.post(`/admin/users/${id}/restrictions`, {
            posting_days: Math.max(0, Number(postingDays) || 0),
            messaging_days: Math.max(0, Number(messagingDays) || 0),
            reason: why,
          }, true);
        case "clearRestrictions":
          return api.post(`/admin/users/${id}/clear-restrictions`, { reason: why }, true);
        case "forceLogout":
          return api.post(`/admin/users/${id}/force-logout`, { reason: why }, true);
      }
    },
    onSuccess: () => {
      const deletedAccount = action?.kind === "deleteAccount";
      toast.show(deletedAccount ? "Account permanently removed" : "Admin action completed", "success");
      setAction(null);
      setReason("");
      setDays("7");
      setPostingDays("7");
      setMessagingDays("7");
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-audit"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      if (deletedAccount) router.back();
      else detail.refetch();
    },
    onError: (e: any) => toast.show(e.message || "Action failed", "error"),
  });

  function openAction(next: PendingAction, defaultReason = "") {
    setAction(next);
    setReason(defaultReason);
    setDays("7");
    setPostingDays("7");
    setMessagingDays("7");
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
  const statusText = u.permanent_deleted ? "Removed" : u.suspended ? "Suspended" : "Active";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.iconBtn} onPress={() => router.back()} testID="admin-user-back">
          <Icon name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>User Control</Text>
          <Text style={styles.subtitle}>Profile, safety, content & account access</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={() => detail.refetch()}>
          <Icon name="refresh-outline" size={21} color={colors.onSurface} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + 40 }}>
        <View style={styles.profileCard}>
          {!!u.cover && <Image source={{ uri: fileUrl(u.cover) }} style={styles.cover} contentFit="cover" />}
          <View style={styles.profileTop}>
            <Avatar uri={u.avatar} name={u.full_name} size={72} />
            <View style={{ flex: 1 }}>
              <UserName name={u.full_name} verified={u.blue_tick} size={19} />
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
          <Info label="Bio" value={u.bio || "Not added"} />
          <Info label="Location" value={u.location || "Not added"} />
          <Info label="Profile privacy" value={u.privacy || "public"} />
          <Info label="Contact visibility" value={u.contact_visibility || "only_me"} />
          <Info label="Sparks" value={String(u.sparks ?? 0)} />
          {!!u.suspended_until && <Info label="Suspended until" value={new Date(u.suspended_until).toLocaleString()} />}
          {!!u.suspend_reason && <Info label="Suspension reason" value={u.suspend_reason} />}
          {!!u.posting_restricted_until && <Info label="Posting restricted until" value={new Date(u.posting_restricted_until).toLocaleString()} />}
          {!!u.messaging_restricted_until && <Info label="Messaging restricted until" value={new Date(u.messaging_restricted_until).toLocaleString()} />}
          {!!u.restriction_reason && <Info label="Restriction reason" value={u.restriction_reason} />}

          <Button title="Edit profile details" small variant="secondary" onPress={() => setEditOpen(true)} style={{ alignSelf: "flex-start", marginTop: spacing.sm }} />
          <Text style={styles.securityNote}>Security rule: passwords, password hashes, OTP codes and private service keys are never displayed or editable from the dashboard.</Text>
        </View>

        <View style={styles.statsRow}>
          <MiniStat label="Posts" value={data.counts?.posts} />
          <MiniStat label="Comments" value={data.counts?.comments} />
          <MiniStat label="Stories" value={data.counts?.stories} />
          <MiniStat label="Friends" value={data.counts?.friends} />
          <MiniStat label="Followers" value={data.counts?.followers} />
          <MiniStat label="Following" value={data.counts?.following} />
          <MiniStat label="Messages sent" value={data.counts?.messages_sent} />
          <MiniStat label="Warnings" value={data.counts?.warnings} />
          <MiniStat label="Tickets" value={data.counts?.tickets} />
          <MiniStat label="Reports made" value={data.counts?.reports_made} />
          <MiniStat label="Reports received" value={data.counts?.reports_received} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account & safety controls</Text>
          <View style={styles.actionGrid}>
            <Button
              title={u.blue_tick ? "Remove Blue Tick" : "Grant Blue Tick"}
              small variant="secondary"
              onPress={() => openAction({ kind: u.blue_tick ? "revoke" : "grant", title: u.blue_tick ? "Remove Blue Tick" : "Grant Blue Tick" }, u.blue_tick ? "Blue Tick removed by Glint administrator" : "Blue Tick granted by Glint administrator")}
              style={{ flex: 1 }}
            />
            <Button
              title={u.suspended ? "Restore account" : "Suspend account"}
              small variant="secondary"
              onPress={() => openAction({ kind: u.suspended ? "restore" : "suspend", title: u.suspended ? "Restore account" : "Suspend account" })}
              style={{ flex: 1 }}
            />
          </View>
          <View style={styles.actionGrid}>
            <Button title="Send warning" small variant="secondary" onPress={() => openAction({ kind: "warn", title: "Send account warning" })} style={{ flex: 1 }} />
            <Button title="Restrict features" small variant="secondary" onPress={() => openAction({ kind: "restrict", title: "Restrict posting & messaging" })} style={{ flex: 1 }} />
          </View>
          <View style={styles.actionGrid}>
            <Button title="Clear restrictions" small variant="secondary" onPress={() => openAction({ kind: "clearRestrictions", title: "Clear feature restrictions" }, "Restrictions removed after admin review")} style={{ flex: 1 }} />
            <Button title="Force logout" small variant="secondary" onPress={() => openAction({ kind: "forceLogout", title: "Force logout on all sessions" }, "Security session reset")} style={{ flex: 1 }} />
          </View>
          <Button
            title="Permanently delete account"
            variant="danger"
            onPress={() => openAction({ kind: "deleteAccount", title: "Permanently delete account" })}
            testID="admin-permanent-delete-account"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Friends</Text>
          {!data.friends?.length ? <Text style={styles.empty}>No friends.</Text> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {data.friends.map((friend: any) => (
                <View key={friend.id} style={styles.friendCard}>
                  <Avatar uri={friend.avatar} name={friend.full_name} size={42} />
                  <Text style={styles.friendName} numberOfLines={1}>{friend.full_name}</Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>@{friend.username}</Text>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent posts</Text>
          {!data.posts?.length ? <Text style={styles.empty}>No posts.</Text> : data.posts.map((p: any) => (
            <View key={p.id} style={styles.contentCard}>
              <View style={styles.cardTop}>
                <Text style={styles.cardMeta}>{p.type || "post"} · {p.created_at ? timeAgo(p.created_at) : ""}</Text>
                {p.deleted_at ? <Pill text="Removed" tone="danger" /> : null}
              </View>
              {!!p.text && <Text style={styles.bodyText}>{p.text}</Text>}
              {!!p.image && <Image source={{ uri: fileUrl(p.image) }} style={styles.media} contentFit="cover" />}
              {!!p.moderation_reason && <Text style={styles.reasonText}>Reason: {p.moderation_reason}</Text>}
              <Button
                title={p.deleted_at ? "Restore post" : "Delete post"}
                small variant={p.deleted_at ? "secondary" : "danger"}
                onPress={() => openAction({
                  kind: p.deleted_at ? "restorePost" : "deletePost",
                  targetId: p.id,
                  title: p.deleted_at ? "Restore post" : "Delete post",
                }, p.deleted_at ? "Restored after admin review" : "")}
                style={{ alignSelf: "flex-start" }}
              />
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent stories</Text>
          {!data.stories?.length ? <Text style={styles.empty}>No stories.</Text> : data.stories.map((st: any) => (
            <View key={st.id} style={styles.contentCard}>
              <View style={styles.cardTop}>
                <Text style={styles.cardMeta}>{st.type || "story"} · {st.created_at ? timeAgo(st.created_at) : ""}</Text>
                {st.deleted_at ? <Pill text="Removed" tone="danger" /> : null}
              </View>
              {!!st.text && <Text style={styles.bodyText}>{st.text}</Text>}
              {!!st.image && <Image source={{ uri: fileUrl(st.image) }} style={styles.media} contentFit="cover" />}
              {!!st.moderation_reason && <Text style={styles.reasonText}>Reason: {st.moderation_reason}</Text>}
              <Button
                title={st.deleted_at ? "Restore story" : "Delete story"}
                small variant={st.deleted_at ? "secondary" : "danger"}
                onPress={() => openAction({
                  kind: st.deleted_at ? "restoreStory" : "deleteStory",
                  targetId: st.id,
                  title: st.deleted_at ? "Restore story" : "Delete story",
                }, st.deleted_at ? "Restored after admin review" : "")}
                style={{ alignSelf: "flex-start" }}
              />
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent comments</Text>
          {!data.comments?.length ? <Text style={styles.empty}>No comments.</Text> : data.comments.map((cm: any) => (
            <View key={cm.id} style={styles.contentCard}>
              <View style={styles.cardTop}>
                <Text style={styles.cardMeta}>{cm.created_at ? timeAgo(cm.created_at) : ""} · Post {String(cm.post_id || "").slice(0, 8)}</Text>
                {cm.deleted_at ? <Pill text="Removed" tone="danger" /> : null}
              </View>
              <Text style={styles.bodyText}>{cm.text}</Text>
              {!!cm.moderation_reason && <Text style={styles.reasonText}>Reason: {cm.moderation_reason}</Text>}
              <Button
                title={cm.deleted_at ? "Restore comment" : "Delete comment"}
                small variant={cm.deleted_at ? "secondary" : "danger"}
                onPress={() => openAction({
                  kind: cm.deleted_at ? "restoreComment" : "deleteComment",
                  targetId: cm.id,
                  title: cm.deleted_at ? "Restore comment" : "Delete comment",
                }, cm.deleted_at ? "Restored after admin review" : "")}
                style={{ alignSelf: "flex-start" }}
              />
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Warnings</Text>
          {!data.warnings?.length ? <Text style={styles.empty}>No warnings.</Text> : data.warnings.map((w: any) => (
            <View key={w.id} style={styles.contentCard}>
              <Text style={styles.bodyText}>{w.reason}</Text>
              <Text style={styles.cardMeta}>{w.created_at ? new Date(w.created_at).toLocaleString() : ""}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Login activity</Text>
          {!data.login_activity?.length ? <Text style={styles.empty}>No login events recorded yet.</Text> : data.login_activity.map((e: any) => (
            <View key={e.id} style={styles.contentCard}>
              <Text style={styles.bodyText}>{String(e.type || "login").replaceAll("_", " ")}</Text>
              <Text style={styles.cardMeta}>{e.created_at ? new Date(e.created_at).toLocaleString() : ""}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Blue Tick verification history</Text>
          {!data.verifications?.length ? <Text style={styles.empty}>No verification requests.</Text> : data.verifications.map((v: any) => (
            <View key={v.id} style={styles.contentCard}>
              <Text style={styles.bodyText}>{v.status?.toUpperCase()} · {v.full_legal_name || "No legal name"}</Text>
              <Text style={styles.cardMeta}>{v.created_at ? new Date(v.created_at).toLocaleString() : ""}</Text>
              {v.review_reason ? <Text style={styles.reasonText}>Review: {v.review_reason}</Text> : null}
              <View style={styles.verificationMedia}>
                {!!v.document && <Image source={{ uri: fileUrl(v.document) }} style={styles.smallMedia} contentFit="cover" />}
                {!!v.selfie && <Image source={{ uri: fileUrl(v.selfie) }} style={styles.smallMedia} contentFit="cover" />}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Admin audit history</Text>
          {!data.moderation_history?.length ? <Text style={styles.empty}>No admin actions yet.</Text> : data.moderation_history.map((a: any) => (
            <View key={a.id} style={styles.contentCard}>
              <Text style={styles.bodyText}>{String(a.action || "").replaceAll("_", " ")}</Text>
              <Text style={styles.reasonText}>{a.reason || "No reason"}</Text>
              <Text style={styles.cardMeta}>{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit user profile</Text>
            <TextInput value={editName} onChangeText={setEditName} placeholder="Full name" placeholderTextColor={colors.muted} style={styles.input} />
            <TextInput value={editUsername} onChangeText={setEditUsername} autoCapitalize="none" placeholder="Username" placeholderTextColor={colors.muted} style={styles.input} />
            <TextInput value={editBio} onChangeText={setEditBio} placeholder="Bio" placeholderTextColor={colors.muted} multiline style={[styles.input, styles.reasonInput]} />
            <TextInput value={editLocation} onChangeText={setEditLocation} placeholder="Location" placeholderTextColor={colors.muted} style={styles.input} />

            <Text style={styles.modalHint}>Profile privacy</Text>
            <View style={styles.choiceRow}>
              {["public", "friends", "only_me"].map((x) => <Choice key={x} label={x} active={editPrivacy === x} onPress={() => setEditPrivacy(x)} />)}
            </View>
            <Text style={styles.modalHint}>Contact visibility</Text>
            <View style={styles.choiceRow}>
              {["public", "friends", "only_me"].map((x) => <Choice key={x} label={x} active={editContactVisibility === x} onPress={() => setEditContactVisibility(x)} />)}
            </View>

            <Button title="Save profile" onPress={() => editProfile.mutate()} loading={editProfile.isPending} disabled={!editName.trim() || !editUsername.trim()} />
            <Pressable onPress={() => setEditOpen(false)}><Text style={styles.cancel}>Cancel</Text></Pressable>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!action} transparent animationType="fade" onRequestClose={() => setAction(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{action?.title}</Text>
            <Text style={styles.modalHint}>The reason is saved to the admin audit log and is shown to the user where applicable.</Text>

            {action?.kind === "suspend" && (
              <TextInput
                value={days}
                onChangeText={setDays}
                keyboardType="number-pad"
                placeholder="Suspension days (0 = long-term)"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            )}

            {action?.kind === "restrict" && (
              <>
                <TextInput
                  value={postingDays}
                  onChangeText={setPostingDays}
                  keyboardType="number-pad"
                  placeholder="Posting restriction days"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
                <TextInput
                  value={messagingDays}
                  onChangeText={setMessagingDays}
                  keyboardType="number-pad"
                  placeholder="Messaging restriction days"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
              </>
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
              variant={["deleteAccount", "deletePost", "deleteComment", "deleteStory"].includes(action?.kind || "") ? "danger" : "primary"}
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

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.choice, active && { backgroundColor: colors.brandPrimary }]}>
      <Text style={[styles.choiceText, { color: active ? colors.onBrandPrimary : colors.onSurface }]}>{label.replace("_", " ")}</Text>
    </Pressable>
  );
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
  friendCard: { width: 120, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, alignItems: "center", gap: 4 },
  friendName: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 12, maxWidth: 100 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, borderWidth: 1, borderColor: c.border, maxHeight: "90%" },
  modalTitle: { color: c.onSurface, fontFamily: fonts.displayBold, fontSize: 21 },
  modalHint: { color: c.muted, fontFamily: fonts.text, fontSize: 13, lineHeight: 19 },
  input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, color: c.onSurface, fontFamily: fonts.text, fontSize: 15 },
  reasonInput: { minHeight: 90, textAlignVertical: "top" },
  cancel: { color: c.onSurfaceSecondary, fontFamily: fonts.semibold, fontSize: 15, textAlign: "center", paddingVertical: spacing.sm },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choice: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  choiceText: { fontFamily: fonts.semibold, fontSize: 12, textTransform: "capitalize" },
}));
