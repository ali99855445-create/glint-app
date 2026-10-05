import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { fileUrl } from "@/src/api/client";

export function StoryVideo({ uri, active = true }: { uri: string; active?: boolean }) {
  const player = useVideoPlayer(fileUrl(uri), (p) => {
    p.loop = false;
    p.muted = false;
  });

  useEffect(() => {
    try {
      if (active) { player.currentTime = 0; player.play(); }
      else player.pause();
    } catch {}
    return () => { try { player.pause(); } catch {} };
  }, [active, player]);

  return <View style={StyleSheet.absoluteFill}><VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} /></View>;
}
