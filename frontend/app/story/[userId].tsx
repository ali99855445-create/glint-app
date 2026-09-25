import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, TextInput, StyleSheet, ActivityIndicator, Modal, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useAudioPlayer } from "expo-audio";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fonts, spacing, radius } from "@/src/theme";
import { api, fileUrl } from "@/src/api/client";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { timeAgo } from "@/src/lib/time";

const DURATION = 5000;

export default function StoryViewer() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();
  const progress = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  const [reply, setReply] = useState("");
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);

  const groups = useQuery({ queryKey: ["stories"], queryFn: () => api.get("/stories/feed") });
  const group = (groups.data || []).find((g: any) => g.author.id === userId);
  const stories = group?.stories || [];
  const current = stories[index];
  const isVoiceCur = current?.type === "voice";
  const player = useAudioPlayer(isVoiceCur && current?.media ? fileUrl(current.media) : null);

  useEffect(() => {
    if (!current) return;
    if (viewersOpen) return; // pause auto-advance while viewers sheet is open
    api.post(`/stories/${current.id}/view`).catch(() => {});
    progress.setValue(0);
    const dur = isVoiceCur ? Math.max(2000, (current.duration || 5) * 1000) : DURATION;
    if (isVoiceCur && current.media) {
      try { player.seekTo(0); player.play(); } catch {}
    }
    const anim = Animated.timing(progress, { toValue: 1, duration: dur, useNativeDriver: false });
    anim.start(({ finished }) => { if (finished) next(); });
    return () => { anim.stop(); if (isVoiceCur) { try { player.pause(); } catch {} } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id, viewersOpen]);

  async function openViewers() {
    if (!current) return;
    setViewersOpen(true);
    try {
      const res = await api.get(`/stories/${current.id}/viewers`);
      setViewers(res.viewers || []);
    } catch {
      setViewers([]);
    }
  }

  function next() {
    if (index < stories.length - 1) setIndex((i) => i + 1);
    else close();
  }
  function prev() {
    if (index > 0) setIndex((i) => i - 1);
  }
  function close() {
    qc.invalidateQueries({ queryKey: ["stories"] });
    router.back();
  }

  async function sendReply() {
    if (!reply.trim()) return;
    try {
      await api.post("/chat/send", { to_user: userId, type: "text", text: `Replied to your story: ${reply.trim()}` });
      setReply("");
      toast.show("Reply sent", "success");
    } catch (e: any) {
      toast.show(e.message, "error");
    }
  }

  async function deleteStory() {
    await api.del(`/stories/${current.id}`);
    toast.show("Story deleted", "success");
    close();
  }

  if (groups.isLoading) {
    return <View style={styles.root}><ActivityIndicator color="#fff" style={{ flex: 1 }} /></View>;
  }
  if (!group || !current) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.empty}>No active stories</Text>
        <Pressable onPress={close} style={{ marginTop: 16 }} testID="story-empty-close"><Text style={styles.emptyLink}>Close</Text></Pressable>
      </View>
    );
  }

  const isText = current.type === "text";
  const isVoice = current.type === "voice";

  return (
    <View style={styles.root} testID="story-viewer">
      {isVoice ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: current.bg_color || "#67C587", alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.xl }]}>
          <View style={styles.voiceOrb}>
            <Icon name="musical-notes" size={54} color="#FFFFFF" />
          </View>
          <View style={styles.waveRow}>
            {Array.from({ length: 16 }).map((_, i) => (
              <View key={i} style={[styles.waveBar, { height: 8 + ((i * 7) % 34) }]} />
            ))}
          </View>
          {!!current.text && <Text style={styles.voiceCap}>{current.text}</Text>}
          <Text style={styles.voiceHint}>🎙️ Voice drop</Text>
        </View>
      ) : isText ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: current.bg_color || "#67C587", alignItems: "center", justifyContent: "center", padding: spacing.xl }]}>
          <Text style={styles.storyText}>{current.text}</Text>
        </View>
      ) : (
        <Image source={{ uri: fileUrl(current.image) }} style={StyleSheet.absoluteFill} contentFit="contain" />
      )}

      <LinearGradient colors={["rgba(0,0,0,0.6)", "transparent"]} style={[styles.topScrim, { pointerEvents: "none" }]} />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.6)"]} style={[styles.bottomScrim, { pointerEvents: "none" }]} />

      {/* progress bars */}
      <View style={[styles.progressRow, { top: insets.top + spacing.sm }]}>
        {stories.map((s: any, i: number) => (
          <View key={s.id} style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                { width: i < index ? "100%" : i === index ? progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) : "0%" },
              ]}
            />
          </View>
        ))}
      </View>

      {/* header */}
      <View style={[styles.header, { top: insets.top + spacing.lg }]}>
        <Avatar uri={group.author.avatar} name={group.author.full_name} size={38} />
        <View style={{ flex: 1 }}>
          <UserName name={group.author.full_name} verified={group.author.verified} size={14} color="#FFFFFF" />
          <Text style={styles.time}>{timeAgo(current.created_at)}</Text>
        </View>
        {group.is_mine && (
          <Pressable onPress={deleteStory} style={styles.headerBtn} testID="story-delete">
            <Icon name="trash-outline" size={22} color="#FFFFFF" />
          </Pressable>
        )}
        <Pressable onPress={close} style={styles.headerBtn} testID="story-close">
          <Icon name="close" size={26} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* tap zones */}
      <View style={styles.tapZones}>
        <Pressable style={{ flex: 3 }} onPress={prev} testID="story-tap-prev" />
        <Pressable style={{ flex: 7 }} onPress={next} testID="story-tap-next" />
      </View>

      {/* reply */}
      {!group.is_mine && (
        <View style={[styles.replyBar, { bottom: insets.bottom + spacing.md }]}>
          <TextInput
            value={reply}
            onChangeText={setReply}
            placeholder={`Reply to ${group.author.full_name?.split(" ")[0]}...`}
            placeholderTextColor="rgba(255,255,255,0.7)"
            style={styles.replyInput}
            testID="story-reply-input"
          />
          <Pressable onPress={sendReply} style={styles.replySend} testID="story-reply-send">
            <Icon name="arrow-up" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      )}

      {/* own story: viewers pill */}
      {group.is_mine && (
        <Pressable style={[styles.viewersPill, { bottom: insets.bottom + spacing.md }]} onPress={openViewers} testID="story-viewers-btn">
          <Icon name="eye" size={18} color="#FFFFFF" />
          <Text style={styles.viewersPillText}>{current.viewed ? "Viewers" : "Viewers"}</Text>
          <Icon name="chevron-up" size={16} color="rgba(255,255,255,0.8)" />
        </Pressable>
      )}

      <Modal visible={viewersOpen} transparent animationType="slide" onRequestClose={() => setViewersOpen(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setViewersOpen(false)} testID="story-viewers-overlay" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Viewed by {viewers.length}</Text>
          <ScrollView style={{ maxHeight: 360 }}>
            {viewers.length === 0 ? (
              <Text style={styles.noViewers}>No views yet. Share more to get seen! 👀</Text>
            ) : (
              viewers.map((v) => (
                <View key={v.id} style={styles.viewerRow}>
                  <Avatar uri={v.avatar} name={v.full_name} size={42} />
                  <View style={{ flex: 1 }}>
                    <UserName name={v.full_name} verified={v.verified} size={15} />
                    <Text style={styles.viewerHandle}>@{v.username}</Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  empty: { color: "#fff", fontFamily: fonts.medium, fontSize: 16 },
  emptyLink: { color: "#67C587", fontFamily: fonts.semibold, fontSize: 16 },
  storyText: { color: "#FFFFFF", fontFamily: fonts.displayBold, fontSize: 30, textAlign: "center", lineHeight: 40 },
  voiceOrb: { width: 130, height: 130, borderRadius: 65, backgroundColor: "rgba(255,255,255,0.25)", borderWidth: 3, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  waveRow: { flexDirection: "row", alignItems: "center", gap: 4, height: 40 },
  waveBar: { width: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.85)" },
  voiceCap: { color: "#FFFFFF", fontFamily: fonts.semibold, fontSize: 20, textAlign: "center" },
  voiceHint: { color: "rgba(255,255,255,0.85)", fontFamily: fonts.medium, fontSize: 14 },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 160 },
  bottomScrim: { position: "absolute", bottom: 0, left: 0, right: 0, height: 160 },
  progressRow: { position: "absolute", left: spacing.md, right: spacing.md, flexDirection: "row", gap: 4 },
  progressTrack: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)", overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: "#FFFFFF" },
  header: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  time: { color: "rgba(255,255,255,0.85)", fontFamily: fonts.text, fontSize: 12, marginTop: 1 },
  headerBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  tapZones: { ...StyleSheet.absoluteFillObject, flexDirection: "row", top: 120, bottom: 90 },
  replyBar: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  replyInput: { flex: 1, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)", borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: "#FFFFFF", fontFamily: fonts.text, fontSize: 15 },
  replySend: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  viewersPill: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill },
  viewersPillText: { color: "#FFFFFF", fontFamily: fonts.semibold, fontSize: 14 },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#0F0F0F", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, borderTopWidth: 1, borderColor: "#262626" },
  sheetHandle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#3A3A3A", marginBottom: spacing.md },
  sheetTitle: { color: "#FFFFFF", fontFamily: fonts.displayBold, fontSize: 18, marginBottom: spacing.md },
  noViewers: { color: "#9CA3AF", fontFamily: fonts.text, fontSize: 15, textAlign: "center", paddingVertical: spacing.xl },
  viewerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  viewerHandle: { color: "#9CA3AF", fontFamily: fonts.text, fontSize: 13, marginTop: 2 },
});
