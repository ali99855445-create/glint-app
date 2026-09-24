import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTheme, fonts, radius } from "@/src/theme";
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

export function GoldenTick({ size = 15 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      testID="golden-tick"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.brandSecondary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="checkmark" size={size * 0.72} color={colors.onBrandSecondary} />
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
      {verified && <GoldenTick size={size} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
});
