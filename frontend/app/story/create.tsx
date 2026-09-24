import { useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius, STORY_BG_COLORS } from "@/src/theme";
import { Button } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { api, fileUrl } from "@/src/api/client";
import { pickAndUploadImage } from "@/src/lib/media";

export default function CreateStory() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"text" | "photo">("text");
  const [text, setText] = useState("");
  const [bg, setBg] = useState(STORY_BG_COLORS[0]);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pickImage() {
    setBusy(true);
    try {
      const r = await pickAndUploadImage({ quality: 0.6, aspect: [9, 16] });
      if (r?.denied) toast.show("Photo permission needed", "error");
      else if (r?.url) { setImage(r.url); setMode("photo"); }
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (mode === "text" && !text.trim()) return toast.show("Write something for your story", "error");
    if (mode === "photo" && !image) return toast.show("Add a photo", "error");
    setBusy(true);
    try {
      await api.post("/stories", {
        type: mode,
        text: mode === "text" ? text.trim() : null,
        bg_color: mode === "text" ? bg : null,
        image: mode === "photo" ? image : null,
      });
      qc.invalidateQueries({ queryKey: ["stories"] });
      toast.show("Story shared!", "success");
      router.back();
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={[styles.preview, mode === "text" && { backgroundColor: bg }]}>
        {mode === "photo" && image && <Image source={{ uri: fileUrl(image) }} style={styles.previewImg} contentFit="cover" />}
        {mode === "text" ? (
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Type your story..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            style={styles.storyInput}
            multiline
            maxLength={200}
            testID="story-text-input"
          />
        ) : (
          !image && (
            <Pressable style={styles.pickPhoto} onPress={pickImage} testID="story-pick-photo">
              <Icon name="image" size={44} color="#FFFFFF" />
              <Text style={styles.pickText}>Tap to choose a photo</Text>
            </Pressable>
          )
        )}

        <View style={[styles.topBar, { top: insets.top + spacing.sm }]}>
          <Pressable onPress={() => router.back()} style={styles.topBtn} testID="story-create-close">
            <Icon name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.modeRow}>
          <Pressable style={[styles.modeBtn, mode === "text" && { backgroundColor: colors.brandPrimary }]} onPress={() => setMode("text")} testID="story-mode-text">
            <Icon name="text" size={18} color={mode === "text" ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
            <Text style={[styles.modeText, { color: mode === "text" ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>Text</Text>
          </Pressable>
          <Pressable style={[styles.modeBtn, mode === "photo" && { backgroundColor: colors.brandPrimary }]} onPress={() => { setMode("photo"); if (!image) pickImage(); }} testID="story-mode-photo">
            <Icon name="image" size={18} color={mode === "photo" ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
            <Text style={[styles.modeText, { color: mode === "photo" ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>Photo</Text>
          </Pressable>
        </View>

        {mode === "text" && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorRow}>
            {STORY_BG_COLORS.map((color) => (
              <Pressable key={color} onPress={() => setBg(color)} style={[styles.colorDot, { backgroundColor: color }, bg === color && styles.colorSelected]} testID={`story-color-${color}`} />
            ))}
          </ScrollView>
        )}

        <Button title="Share to story" onPress={share} loading={busy} testID="story-share" />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  preview: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  previewImg: { ...({ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 } as any) },
  storyInput: { color: "#FFFFFF", fontFamily: fonts.displayBold, fontSize: 30, textAlign: "center", paddingHorizontal: spacing.xl, maxHeight: 300, minWidth: "80%" },
  pickPhoto: { alignItems: "center", gap: spacing.md },
  pickText: { color: "#FFFFFF", fontFamily: fonts.medium, fontSize: 16 },
  topBar: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row" },
  topBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  controls: { padding: spacing.lg, gap: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
  modeRow: { flexDirection: "row", gap: spacing.sm, alignSelf: "center", backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 4 },
  modeBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.sm },
  modeText: { fontFamily: fonts.semibold, fontSize: 14 },
  colorRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  colorDot: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: "transparent" },
  colorSelected: { borderColor: c.onSurface, transform: [{ scale: 1.1 }] },
}));
