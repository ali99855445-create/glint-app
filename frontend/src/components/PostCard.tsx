import React, { useState } from "react";
import { View, Text, Pressable, Share, StyleSheet } from "react-native";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius, REACTIONS } from "@/src/theme";
import { api, fileUrl } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { timeAgo } from "@/src/lib/time";

export type Post = any;

function ReactionSummary({ counts }: { counts: Record<string, number> }) {
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!top.length) return null;
  return (
    <View style={{ flexDirection: "row" }}>
      {top.map(([k]) => {
        const r = REACTIONS.find((x) => x.key === k);
        return <Text key={k} style={{ fontSize: 15 }}>{r?.emoji}</Text>;
      })}
    </View>
  );
}

export function PostCard({ post, onChanged }: { post: Post; onChanged?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [local, setLocal] = useState(post);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["feed"] });
    onChanged?.();
  };

  const reactMut = useMutation({
    mutationFn: (reaction: string | null) => api.post(`/posts/${local.id}/react`, { reaction }),
    onSuccess: (data) => setLocal(data),
  });

  const saveMut = useMutation({
    mutationFn: () => api.post(`/posts/${local.id}/save`),
    onSuccess: (d) => { setLocal({ ...local, saved: d.saved }); toast.show(d.saved ? "Saved" : "Removed from saved", "success"); },
  });

  const voteMut = useMutation({
    mutationFn: (opt: number) => api.post(`/posts/${local.id}/vote?option=${opt}`),
    onSuccess: (data) => setLocal(data),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.del(`/posts/${local.id}`),
    onSuccess: () => { toast.show("Post deleted", "success"); invalidate(); },
  });

  const hideMut = useMutation({
    mutationFn: () => api.post(`/posts/${local.id}/hide`),
    onSuccess: () => { toast.show("Post hidden", "success"); invalidate(); },
  });

  function pickReaction(key: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setShowPicker(false);
    reactMut.mutate(local.my_reaction === key ? null : key);
  }

  function toggleLike() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    reactMut.mutate(local.my_reaction ? null : "like");
  }

  async function sharePost() {
    try {
      await Share.share({ message: `Check out this post by @${local.author.username} on Glint! glint.app/${local.author.username}` });
    } catch {}
  }

  async function report() {
    setMenuOpen(false);
    await api.post("/report", { target_type: "post", target_id: local.id, reason: "Inappropriate content" });
    toast.show("Reported. Thank you.", "success");
  }

  const myReactionObj = REACTIONS.find((r) => r.key === local.my_reaction);

  return (
    <View style={styles.card} testID={`post-${local.id}`}>
      {/* header */}
      <View style={styles.header}>
        <Pressable style={styles.authorRow} onPress={() => router.push(`/user/${local.author.username}`)}>
          <Avatar uri={local.author.avatar} name={local.author.full_name} size={44} />
          <View style={{ flex: 1 }}>
            <UserName name={local.author.full_name} verified={local.author.verified} size={15} />
            <Text style={styles.meta}>@{local.author.username} · {timeAgo(local.created_at)}</Text>
          </View>
        </Pressable>
        <Pressable onPress={() => setMenuOpen((m) => !m)} testID={`post-menu-${local.id}`} style={styles.iconBtn}>
          <Icon name="ellipsis-horizontal" size={22} color={colors.muted} />
        </Pressable>
      </View>

      {menuOpen && (
        <View style={styles.menu}>
          <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); saveMut.mutate(); }} testID={`post-save-${local.id}`}>
            <Icon name={local.saved ? "bookmark" : "bookmark-outline"} size={18} color={colors.onSurface} />
            <Text style={styles.menuText}>{local.saved ? "Unsave" : "Save post"}</Text>
          </Pressable>
          {!local.is_mine && (
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); hideMut.mutate(); }} testID={`post-hide-${local.id}`}>
              <Icon name="eye-off-outline" size={18} color={colors.onSurface} />
              <Text style={styles.menuText}>Hide post</Text>
            </Pressable>
          )}
          {!local.is_mine && (
            <Pressable style={styles.menuItem} onPress={report} testID={`post-report-${local.id}`}>
              <Icon name="flag-outline" size={18} color={colors.error} />
              <Text style={[styles.menuText, { color: colors.error }]}>Report</Text>
            </Pressable>
          )}
          {local.is_mine && (
            <Pressable style={styles.menuItem} onPress={() => { setMenuOpen(false); deleteMut.mutate(); }} testID={`post-delete-${local.id}`}>
              <Icon name="trash-outline" size={18} color={colors.error} />
              <Text style={[styles.menuText, { color: colors.error }]}>Delete post</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* body */}
      {!!local.text && <Text style={styles.text}>{local.text}</Text>}

      {local.type === "photo" && local.image && (
        <Image source={{ uri: fileUrl(local.image) }} style={styles.image} contentFit="cover" transition={200} />
      )}

      {local.type === "poll" && local.poll && (
        <View style={styles.poll}>
          {local.poll.options.map((opt: string, i: number) => {
            const total = local.poll.total_votes || 0;
            const votes = local.poll.tally[i] || 0;
            const pct = total ? Math.round((votes / total) * 100) : 0;
            const mine = local.poll.my_vote === i;
            return (
              <Pressable key={i} style={styles.pollOpt} onPress={() => voteMut.mutate(i)} testID={`poll-option-${local.id}-${i}`}>
                <View style={[styles.pollFill, { width: `${pct}%`, backgroundColor: mine ? colors.brandTertiary : colors.surfaceTertiary }]} />
                <View style={styles.pollRow}>
                  <Text style={[styles.pollText, mine && { fontFamily: fonts.semibold }]}>{opt}</Text>
                  <Text style={styles.pollPct}>{pct}%</Text>
                </View>
              </Pressable>
            );
          })}
          <Text style={styles.pollTotal}>{local.poll.total_votes} votes</Text>
        </View>
      )}

      {/* reaction summary bar */}
      {(local.total_reactions > 0 || local.comment_count > 0) && (
        <View style={styles.summary}>
          <View style={styles.summaryLeft}>
            <ReactionSummary counts={local.reaction_counts} />
            {local.total_reactions > 0 && <Text style={styles.summaryText}>{local.total_reactions}</Text>}
          </View>
          {local.comment_count > 0 && <Text style={styles.summaryText}>{local.comment_count} comments</Text>}
        </View>
      )}

      {/* actions */}
      <View style={styles.actions}>
        {showPicker && (
          <View style={styles.picker}>
            {REACTIONS.map((r) => (
              <Pressable key={r.key} onPress={() => pickReaction(r.key)} style={styles.pickerItem} testID={`react-${r.key}-${local.id}`}>
                <Text style={{ fontSize: 26 }}>{r.emoji}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Pressable style={styles.action} onPress={toggleLike} onLongPress={() => setShowPicker(true)} testID={`post-like-${local.id}`}>
          {myReactionObj ? (
            <Text style={{ fontSize: 20 }}>{myReactionObj.emoji}</Text>
          ) : (
            <Icon name="heart-outline" size={22} color={colors.onSurfaceTertiary} />
          )}
          <Text style={[styles.actionText, myReactionObj && { color: myReactionObj.color }]}>{myReactionObj?.label || "React"}</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => router.push(`/post/${local.id}`)} testID={`post-comment-${local.id}`}>
          <Icon name="chatbubble-outline" size={21} color={colors.onSurfaceTertiary} />
          <Text style={styles.actionText}>Comment</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={sharePost} testID={`post-share-${local.id}`}>
          <Icon name="arrow-redo-outline" size={21} color={colors.onSurfaceTertiary} />
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => saveMut.mutate()} testID={`post-bookmark-${local.id}`}>
          <Icon name={local.saved ? "bookmark" : "bookmark-outline"} size={21} color={local.saved ? colors.brandSecondary : colors.onSurfaceTertiary} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center" },
  authorRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  meta: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 2 },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  menu: { position: "absolute", right: spacing.lg, top: 56, zIndex: 20, backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingVertical: spacing.xs, minWidth: 170, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  menuItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  menuText: { color: c.onSurface, fontFamily: fonts.medium, fontSize: 15 },
  text: { color: c.onSurface, fontFamily: fonts.text, fontSize: 15, lineHeight: 22 },
  image: { width: "100%", aspectRatio: 1, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  poll: { gap: spacing.sm },
  pollOpt: { height: 46, borderRadius: radius.sm, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, overflow: "hidden", justifyContent: "center" },
  pollFill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  pollRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.md },
  pollText: { color: c.onSurface, fontFamily: fonts.medium, fontSize: 14 },
  pollPct: { color: c.onSurfaceSecondary, fontFamily: fonts.semibold, fontSize: 14 },
  pollTotal: { color: c.muted, fontFamily: fonts.text, fontSize: 12 },
  summary: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: spacing.xs },
  summaryLeft: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  summaryText: { color: c.muted, fontFamily: fonts.text, fontSize: 13 },
  actions: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingVertical: spacing.xs },
  actionText: { color: c.onSurfaceTertiary, fontFamily: fonts.medium, fontSize: 13 },
  picker: { position: "absolute", bottom: 48, left: spacing.sm, flexDirection: "row", backgroundColor: c.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xs, zIndex: 30, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  pickerItem: { padding: spacing.xs },
}));
