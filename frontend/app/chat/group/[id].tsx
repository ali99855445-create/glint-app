import React, { useState } from "react";
import { View, Text, FlatList, Pressable, TextInput, ActivityIndicator } from "react-native";
import { KeyboardStickyView, KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api, fileUrl } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { VoiceMessage } from "@/src/components/VoiceMessage";
import { useToast } from "@/src/components/Toast";
import { pickAndUploadImage } from "@/src/lib/media";

export default function GroupChat() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [membersOpen, setMembersOpen] = useState(false);

  const chat = useQuery({ queryKey: ["group", id], queryFn: () => api.get(`/chat/group/${id}`), refetchInterval: 4000 });

  useFocusEffect(React.useCallback(() => { api.post("/chat/heartbeat").catch(() => {}); }, []));

  const sendMut = useMutation({
    mutationFn: (body: any) => api.post("/chat/send", { conversation_id: id, ...body }),
    onSuccess: () => { chat.refetch(); qc.invalidateQueries({ queryKey: ["conversations"] }); },
  });

  function sendText() {
    if (!text.trim()) return;
    sendMut.mutate({ type: "text", text: text.trim() });
    setText("");
  }
  async function sendPhoto() {
    try {
      const r = await pickAndUploadImage({ quality: 0.6 });
      if (r?.denied) return toast.show("Photo permission needed", "error");
      if (r?.url) sendMut.mutate({ type: "photo", media: r.url });
    } catch (e: any) {
      toast.show(e.message || "Upload failed", "error");
    }
  }

  const data = chat.data;
  const messages = [...(data?.messages || [])].reverse();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="group-chat-back">
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Pressable style={styles.headerCenter} onPress={() => setMembersOpen((m) => !m)} testID="group-header">
          <View style={styles.groupAvatar}><Icon name="people" size={22} color={colors.onBrandPrimary} /></View>
          <View>
            <Text style={styles.groupName} numberOfLines={1}>{data?.name}</Text>
            <Text style={styles.members}>{data?.member_count} members</Text>
          </View>
        </Pressable>
        <View style={{ width: 40 }} />
      </View>

      {membersOpen && (
        <View style={styles.membersBar}>
          {(data?.members || []).map((m: any) => (
            <View key={m.id} style={styles.memberChip}>
              <Avatar uri={m.avatar} name={m.full_name} size={22} />
              <Text style={styles.memberChipText}>{m.full_name?.split(" ")[0]}</Text>
            </View>
          ))}
        </View>
      )}

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {chat.isLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
        ) : (
          <FlatList
            data={messages}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
            renderItem={({ item }) => (
              <View style={[styles.bubbleRow, item.mine ? styles.rowMine : styles.rowTheirs]}>
                {!item.mine && <Avatar uri={item.sender_avatar} name={item.sender_name} size={30} />}
                <View style={[styles.bubble, item.mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!item.mine && <Text style={styles.senderName}>{item.sender_name?.split(" ")[0]}</Text>}
                  {item.type === "text" && <Text style={[styles.msgText, { color: item.mine ? colors.onBrandPrimary : colors.onSurface }]}>{item.text}</Text>}
                  {item.type === "photo" && item.media && <Image source={{ uri: fileUrl(item.media) }} style={styles.msgImage} contentFit="cover" />}
                  {item.type === "voice" && item.media && <VoiceMessage uri={item.media} duration={item.duration} mine={item.mine} tint={colors.brandPrimary} />}
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={[styles.empty, { transform: [{ scaleY: -1 }] }]}>
                <Icon name="people-circle-outline" size={48} color={colors.muted} />
                <Text style={styles.emptyText}>Say hello to the group! 👋</Text>
              </View>
            }
          />
        )}

        <KeyboardStickyView>
          <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
            <Pressable onPress={sendPhoto} style={styles.mediaBtn} testID="group-photo"><Icon name="image-outline" size={24} color={colors.brand} /></Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Message the group..."
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="group-input"
              multiline
            />
            <Pressable onPress={sendText} style={[styles.sendBtn, { opacity: text.trim() ? 1 : 0.4 }]} testID="group-send">
              <Icon name="arrow-up" size={20} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
        </KeyboardStickyView>
      </KeyboardAvoidingView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  groupName: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 15 },
  members: { color: c.muted, fontFamily: fonts.text, fontSize: 12, marginTop: 1 },
  membersBar: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  memberChip: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: c.surfaceTertiary, borderRadius: radius.pill, paddingRight: spacing.md, paddingLeft: 3, paddingVertical: 3 },
  memberChipText: { color: c.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bubbleRow: { flexDirection: "row", gap: spacing.xs, alignItems: "flex-end" },
  rowMine: { justifyContent: "flex-end" },
  rowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "76%", borderRadius: radius.lg, padding: spacing.md },
  bubbleMine: { backgroundColor: c.brandPrimary, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderBottomLeftRadius: 4 },
  senderName: { color: c.brandSecondary, fontFamily: fonts.semibold, fontSize: 12, marginBottom: 2 },
  msgText: { fontFamily: fonts.text, fontSize: 15, lineHeight: 21 },
  msgImage: { width: 200, height: 200, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary },
  empty: { alignItems: "center", gap: spacing.sm, paddingTop: spacing["3xl"] },
  emptyText: { color: c.muted, fontFamily: fonts.text, fontSize: 15 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
  mediaBtn: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, maxHeight: 120, backgroundColor: c.surfaceTertiary, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: c.onSurface, fontFamily: fonts.text, fontSize: 15 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
