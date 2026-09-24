import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, TextInput, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
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

  const groups = useQuery({ queryKey: ["stories"], queryFn: () => api.get("/stories/feed") });
  const group = (groups.data || []).find((g: any) => g.author.id === userId);
  const stories = group?.stories || [];
  const current = stories[index];

  useEffect(() => {
    if (!current) return;
    api.post(`/stories/${current.id}/view`).catch(() => {});
    progress.setValue(0);
    const anim = Animated.timing(progress, { toValue: 1, duration: DURATION, useNativeDriver: false });
    anim.start(({ finished }) => { if (finished) next(); });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id]);

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

  return (
    <View style={styles.root} testID="story-viewer">
      {isText ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: current.bg_color || "#EAB308", alignItems: "center", justifyContent: "center", padding: spacing.xl }]}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  empty: { color: "#fff", fontFamily: fonts.medium, fontSize: 16 },
  emptyLink: { color: "#EAB308", fontFamily: fonts.semibold, fontSize: 16 },
  storyText: { color: "#FFFFFF", fontFamily: fonts.displayBold, fontSize: 30, textAlign: "center", lineHeight: 40 },
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
});
