import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from "react-native-reanimated";
import { Image } from "expo-image";
import { useTheme, fonts } from "@/src/theme";
import { fileUrl } from "@/src/api/client";
import { Icon } from "./Icon";

export function Avatar({ uri, name, size = 44, ring }: { uri?: string | null; name?: string; size?: number; ring?: boolean }) {
  const { colors } = useTheme();
  const source = fileUrl(uri);
  const initials = (name || "?")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
        ring && { borderWidth: 2, borderColor: colors.brandPrimary },
      ]}
    >
      {source ? (
        <Image source={{ uri: source }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={200} />
      ) : (
        <Text style={{ color: colors.onBrandTertiary, fontFamily: fonts.displayBold, fontSize: size * 0.4 }}>{initials}</Text>
      )}
    </View>
  );
}

export function BlueTick({ size = 15 }: { size?: number }) {
  const { colors } = useTheme();
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.ease) })), -1, false);
  }, [glow]);
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + glow.value * 0.55,
    transform: [{ scale: 1 + glow.value * 0.25 }],
  }));

  return (
    <View testID="blue-tick" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={[
          { position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: "#1D9BF0" },
          glowStyle,
        ]}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#1D9BF0",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="checkmark" size={size * 0.72} color="#FFFFFF" />
      </View>
    </View>
  );
}

export function UserName({
  name,
  verified,
  size = 15,
  bold = true,
  color,
}: {
  name?: string;
  verified?: boolean;
  size?: number;
  bold?: boolean;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ color: color || colors.onSurface, fontFamily: bold ? fonts.semibold : fonts.text, fontSize: size }} numberOfLines={1}>
        {name}
      </Text>
      {verified && <BlueTick size={size} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
});
