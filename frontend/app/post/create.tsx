import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius } from "@/src/theme";
import { Field, Button } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { Avatar } from "@/src/components/Avatar";
import { useToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { api, fileUrl } from "@/src/api/client";
import { pickAndUploadImage } from "@/src/lib/media";

type Mode = "text" | "photo" | "poll";

export default function CreatePost() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);

  async function pickImage() {
    setUploading(true);
    try {
      const r = await pickAndUploadImage({ quality: 0.6 });
      if (r?.denied) toast.show("Photo permission needed", "error");
      else if (r?.url) { setImage(r.url); setMode("photo"); }
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (mode === "text" && !text.trim()) return toast.show("Write something first", "error");
    if (mode === "photo" && !image) return toast.show("Add a photo", "error");
    if (mode === "poll") {
      const valid = options.filter((o) => o.trim());
      if (!text.trim()) return toast.show("Add a poll question", "error");
      if (valid.length < 2) return toast.show("Add at least 2 options", "error");
    }
    setPosting(true);
    try {
      await api.post("/posts", {
        type: mode,
        text: text.trim(),
        image: mode === "photo" ? image : null,
        poll_options: mode === "poll" ? options.filter((o) => o.trim()) : null,
      });
      qc.invalidateQueries({ queryKey: ["feed"] });
      toast.show("Posted!", "success");
      router.back();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setPosting(false);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="create-close">
          <Icon name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>New Post</Text>
        <Pressable onPress={submit} disabled={posting} testID="create-submit">
          {posting ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.post}>Post</Text>}
        </Pressable>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
        <View style={styles.authorRow}>
          <Avatar uri={user?.avatar} name={user?.full_name} size={44} />
          <Text style={styles.authorName}>{user?.full_name}</Text>
        </View>

        <Field
          value={text}
          onChangeText={setText}
          placeholder={mode === "poll" ? "Ask a question..." : "What's glinting?"}
          multiline
          testID="create-text"
          style={{ borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0 }}
        />

        {mode === "photo" && image && (
          <View style={styles.imageWrap}>
            <Image source={{ uri: fileUrl(image) }} style={styles.image} contentFit="cover" />
            <Pressable style={styles.removeImg} onPress={() => { setImage(null); setMode("text"); }} testID="create-remove-image">
              <Icon name="close" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        )}

        {mode === "poll" && (
          <View style={{ gap: spacing.sm }}>
            {options.map((opt, i) => (
              <Field key={i} value={opt} onChangeText={(t) => setOptions((o) => o.map((x, j) => (j === i ? t : x)))} placeholder={`Option ${i + 1}`} testID={`create-poll-option-${i}`} />
            ))}
            {options.length < 4 && (
              <Pressable style={styles.addOption} onPress={() => setOptions((o) => [...o, ""])} testID="create-add-option">
                <Icon name="add" size={18} color={colors.brand} />
                <Text style={styles.addOptionText}>Add option</Text>
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAwareScrollView>

      <View style={[styles.toolbar, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable style={styles.tool} onPress={pickImage} disabled={uploading} testID="create-tool-photo">
          {uploading ? <ActivityIndicator color={colors.brand} /> : <Icon name="image" size={24} color={colors.brand} />}
          <Text style={styles.toolText}>Photo</Text>
        </Pressable>
        <Pressable style={styles.tool} onPress={() => { setMode(mode === "poll" ? "text" : "poll"); }} testID="create-tool-poll">
          <Icon name="stats-chart" size={24} color={mode === "poll" ? colors.brandPrimary : colors.brand} />
          <Text style={styles.toolText}>Poll</Text>
        </Pressable>
        <View style={[styles.tool, { opacity: 0.4 }]}>
          <Icon name="videocam-off" size={24} color={colors.muted} />
          <Text style={[styles.toolText, { color: colors.muted }]}>Video (soon)</Text>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { color: c.onSurface, fontFamily: fonts.display, fontSize: 18 },
  post: { color: c.brand, fontFamily: fonts.displayBold, fontSize: 16 },
  scroll: { padding: spacing.lg, gap: spacing.md },
  authorRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  authorName: { color: c.onSurface, fontFamily: fonts.semibold, fontSize: 16 },
  imageWrap: { position: "relative" },
  image: { width: "100%", aspectRatio: 1, borderRadius: radius.md, backgroundColor: c.surfaceTertiary },
  removeImg: { position: "absolute", top: spacing.sm, right: spacing.sm, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  addOption: { flexDirection: "row", alignItems: "center", gap: spacing.xs, padding: spacing.sm },
  addOptionText: { color: c.brand, fontFamily: fonts.semibold, fontSize: 14 },
  toolbar: { flexDirection: "row", gap: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: c.border },
  tool: { alignItems: "center", gap: spacing.xs },
  toolText: { color: c.onSurfaceSecondary, fontFamily: fonts.medium, fontSize: 12 },
}));
