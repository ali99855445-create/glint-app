import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { fonts, spacing } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { fileUrl } from "@/src/api/client";

export function VoiceMessage({ uri, duration, mine, tint }: { uri: string; duration?: number; mine: boolean; tint: string }) {
  const player = useAudioPlayer(fileUrl(uri));
  const status = useAudioPlayerStatus(player);

  const playing = status.playing;
  const total = duration || status.duration || 0;
  const current = status.currentTime || 0;
  const pct = total ? Math.min(100, (current / total) * 100) : 0;

  function toggle() {
    if (playing) {
      player.pause();
    } else {
      if (status.didJustFinish || current >= total) player.seekTo(0);
      player.play();
    }
  }

  return (
    <View style={styles.wrap}>
      <Pressable onPress={toggle} testID="voice-play-btn" style={[styles.playBtn, { backgroundColor: mine ? "rgba(255,255,255,0.25)" : tint }]}>
        <Icon name={playing ? "pause" : "play"} size={18} color="#FFFFFF" />
      </Pressable>
      <View style={styles.track}>
        <View style={[styles.trackBg, { backgroundColor: mine ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.15)" }]}>
          <View style={[styles.trackFill, { width: `${pct}%`, backgroundColor: mine ? "#FFFFFF" : tint }]} />
        </View>
        <Text style={[styles.time, { color: mine ? "rgba(255,255,255,0.85)" : tint }]}>
          {Math.max(0, Math.round(total - current))}s
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minWidth: 160 },
  playBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  track: { flex: 1, gap: 4 },
  trackBg: { height: 4, borderRadius: 2, overflow: "hidden" },
  trackFill: { height: 4, borderRadius: 2 },
  time: { fontFamily: fonts.text, fontSize: 11 },
});
