import { useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from "expo-audio";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { makeStyles, useTheme, fonts, spacing, radius, STORY_BG_COLORS } from "@/src/theme";
import { Button } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";
import { api, fileUrl, uploadFile } from "@/src/api/client";
import { pickAndUploadImage } from "@/src/lib/media";

export default function CreateStory() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"text" | "photo" | "voice">("text");
  const [text, setText] = useState("");
  const [bg, setBg] = useState(STORY_BG_COLORS[0]);
  const [image, setImage] = useState<string | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const [audioDur, setAudioDur] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recStart, setRecStart] = useState(0);
  const [audience, setAudience] = useState<"friends" | "inner">("friends");
  const [busy, setBusy] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  async function toggleRecord() {
    if (!recording) {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) return toast.show("Microphone permission needed", "error");
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecStart(Date.now());
        setRecording(true);
        setAudio(null);
      } catch {
        toast.show("Could not start recording", "error");
      }
    } else {
      try {
        await recorder.stop();
        setRecording(false);
        const uri = recorder.uri;
        const dur = (Date.now() - recStart) / 1000;
        if (!uri || dur < 1) return toast.show("Hold longer to record", "info");
        setBusy(true);
        const url = await uploadFile(uri, `story_${Date.now()}.m4a`, "audio/m4a");
        setAudio(url);
        setAudioDur(dur);
        toast.show("Voice recorded ✓", "success");
      } catch (e: any) {
        toast.show(e.message || "Voice upload failed", "error");
      } finally {
        setBusy(false);
      }
    }
  }

  async function pickImage() {
    setBusy(true);
    try {
      const r = await pickAndUploadImage({ quality: 0.6, aspect: [9, 16] });
      if (r?.denied) toast.show("Photo permission needed", "error");
      else if (r?.url) { setImage(r.url); setMode("photo"); }
    } catch (e: any) {
      toast.show(e.message || "Upload failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (mode === "text" && !text.trim()) return toast.show("Write something for your story", "error");
    if (mode === "photo" && !image) return toast.show("Add a photo", "error");
    if (mode === "voice" && !audio) return toast.show("Record a voice note first", "error");
    setBusy(true);
    try {
      await api.post("/stories", {
        type: mode,
        text: mode !== "photo" ? text.trim() || null : null,
        bg_color: mode !== "photo" ? bg : null,
        image: mode === "photo" ? image : null,
        media: mode === "voice" ? audio : null,
        duration: mode === "voice" ? audioDur : null,
        audience,
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
      <View style={[styles.preview, mode !== "photo" && { backgroundColor: bg }]}>
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
        ) : mode === "voice" ? (
          <View style={styles.voiceWrap}>
            <Pressable style={[styles.recBtn, recording && { backgroundColor: "#EF4444" }]} onPress={toggleRecord} testID="story-record">
              <Icon name={recording ? "stop" : audio ? "checkmark" : "mic"} size={40} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.voiceLabel}>
              {recording ? "Recording... tap to stop" : audio ? `Voice ready · ${Math.round(audioDur)}s` : "Tap to record a voice drop"}
            </Text>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Add a caption (optional)"
              placeholderTextColor="rgba(255,255,255,0.6)"
              style={styles.voiceCaption}
              maxLength={120}
              testID="story-voice-caption"
            />
          </View>
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
          <Pressable onPress={() => setAudience(audience === "friends" ? "inner" : "friends")} style={styles.audToggle} testID="story-audience">
            <Icon name={audience === "inner" ? "star" : "people"} size={16} color="#FFFFFF" />
            <Text style={styles.audToggleText}>{audience === "inner" ? "Inner Circle" : "Friends"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.modeRow}>
          {([
            { k: "text", icon: "text", label: "Text" },
            { k: "photo", icon: "image", label: "Photo" },
            { k: "voice", icon: "mic", label: "Voice" },
          ] as const).map((m) => (
            <Pressable key={m.k} style={[styles.modeBtn, mode === m.k && { backgroundColor: colors.brandPrimary }]} onPress={() => { setMode(m.k); if (m.k === "photo" && !image) pickImage(); }} testID={`story-mode-${m.k}`}>
              <Icon name={m.icon as any} size={18} color={mode === m.k ? colors.onBrandPrimary : colors.onSurfaceTertiary} />
              <Text style={[styles.modeText, { color: mode === m.k ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        {mode !== "photo" && (
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
  topBar: { position: "absolute", left: spacing.lg, right: spacing.lg, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  topBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  audToggle: { flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  audToggleText: { color: "#FFFFFF", fontFamily: fonts.semibold, fontSize: 13 },
  voiceWrap: { alignItems: "center", gap: spacing.lg, paddingHorizontal: spacing.xl },
  recBtn: { width: 96, height: 96, borderRadius: 48, backgroundColor: "rgba(255,255,255,0.25)", borderWidth: 3, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  voiceLabel: { color: "#FFFFFF", fontFamily: fonts.semibold, fontSize: 16 },
  voiceCaption: { color: "#FFFFFF", fontFamily: fonts.medium, fontSize: 16, textAlign: "center", borderBottomWidth: 1, borderColor: "rgba(255,255,255,0.4)", minWidth: 200, paddingVertical: spacing.xs },
  controls: { padding: spacing.lg, gap: spacing.md, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
  modeRow: { flexDirection: "row", gap: spacing.sm, alignSelf: "center", backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 4 },
  modeBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.sm },
  modeText: { fontFamily: fonts.semibold, fontSize: 14 },
  colorRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  colorDot: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: "transparent" },
  colorSelected: { borderColor: c.onSurface, transform: [{ scale: 1.1 }] },
}));
