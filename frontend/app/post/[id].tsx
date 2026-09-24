import React, { useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { KeyboardAvoidingView, KeyboardStickyView } from "react-native-keyboard-controller";
import { Platform, TextInput } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { api } from "@/src/api/client";
import { PostCard } from "@/src/components/PostCard";
import { Avatar, UserName } from "@/src/components/Avatar";
import { Icon } from "@/src/components/Icon";
import { timeAgo } from "@/src/lib/time";

export default function PostDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [text, setText] = useState("");

  const post = useQuery({ queryKey: ["post", id], queryFn: () => api.get(`/posts/${id}`) });
  const comments = useQuery({ queryKey: ["comments", id], queryFn: () => api.get(`/posts/${id}/comments`) });

  const addComment = useMutation({
    mutationFn: () => api.post(`/posts/${id}/comments`, { text: text.trim() }),
    onSuccess: () => {
      setText("");
      comments.refetch();
      qc.invalidateQueries({ queryKey: ["feed"] });
    },
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="post-detail-back">
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Post</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
        {post.isLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>
        ) : (
          <FlatList
            data={comments.data || []}
            keyExtractor={(c) => c.id}
            ListHeaderComponent={
              <View style={{ padding: spacing.lg, gap: spacing.md }}>
                {post.data && <PostCard post={post.data} onChanged={() => post.refetch()} />}
                <Text style={styles.commentsTitle}>Comments</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.comment}>
                <Avatar uri={item.author.avatar} name={item.author.full_name} size={38} />
                <View style={styles.commentBubble}>
                  <View style={styles.commentTop}>
                    <UserName name={item.author.full_name} verified={item.author.verified} size={14} />
                    <Text style={styles.commentTime}>{timeAgo(item.created_at)}</Text>
                  </View>
                  <Text style={styles.commentText}>{item.text}</Text>
                </View>
              </View>
            )}
            contentContainerStyle={{ paddingBottom: spacing.xl }}
            ListEmptyComponent={<Text style={styles.noComments}>No comments yet. Be the first!</Text>}
          />
        )}

        <KeyboardStickyView>
          <View style={[styles.inputBar, { paddingBottom: insets.bottom + spacing.sm }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Add a comment..."
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="comment-input"
            />
            <Pressable
              onPress={() => text.trim() && addComment.mutate()}
              style={[styles.sendBtn, { opacity: text.trim() ? 1 : 0.4 }]}
              testID="comment-send"
            >
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
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 18 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  commentsTitle: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 16 },
  comment: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  commentBubble: { flex: 1, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border },
  commentTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  commentTime: { color: c.muted, fontFamily: fonts.text, fontSize: 12 },
  commentText: { color: c.onSurfaceSecondary, fontFamily: fonts.text, fontSize: 14, lineHeight: 20 },
  noComments: { color: c.muted, fontFamily: fonts.text, fontSize: 14, textAlign: "center", paddingVertical: spacing.xl },
  inputBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
  input: { flex: 1, backgroundColor: c.surfaceTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: c.onSurface, fontFamily: fonts.text, fontSize: 15 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
}));
