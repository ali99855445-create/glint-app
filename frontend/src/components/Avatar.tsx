import React from "react";
import { View, Text, StyleSheet } from "react-native";
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

// Facebook-style verification seal: blue rosette with a crisp white check.
// It is Glint's own implementation and does not use Meta/Facebook artwork.
export function BlueTick({ size = 15 }: { size?: number }) {
  const blue = "#1877F2";
  const petal = {
    position: "absolute" as const,
    width: size * 0.76,
    height: size * 0.76,
    borderRadius: Math.max(2, size * 0.12),
    backgroundColor: blue,
  };

  return (
    <View testID="blue-tick" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={[petal, { transform: [{ rotate: "0deg" }] }]} />
      <View style={[petal, { transform: [{ rotate: "45deg" }] }]} />
      <View
        style={{
          width: size * 0.8,
          height: size * 0.8,
          borderRadius: size,
          backgroundColor: blue,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="checkmark" size={size * 0.62} color="#FFFFFF" />
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
