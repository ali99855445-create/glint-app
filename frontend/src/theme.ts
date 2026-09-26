import { useEffect, useMemo, useState } from "react";
import { StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

// Glint: clean white theme with balanced medium-green accents.
const glint = {
  surface: "#FFFFFF",
  onSurface: "#111827",
  surfaceSecondary: "#F8FBF9",
  onSurfaceSecondary: "#374151",
  surfaceTertiary: "#EEF8F1",
  onSurfaceTertiary: "#5F6B64",
  surfaceInverse: "#111827",
  onSurfaceInverse: "#FFFFFF",
  muted: "#6B7280",
  brand: "#45A866",
  onBrand: "#12331D",
  brandPrimary: "#4CAF70",
  onBrandPrimary: "#12331D",
  brandSecondary: "#3E9E5F",
  onBrandSecondary: "#12331D",
  brandTertiary: "#EAF5ED",
  onBrandTertiary: "#25633A",
  success: "#22A35A",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#111827",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#3B82F6",
  onInfo: "#FFFFFF",
  border: "#DDE7E0",
  borderStrong: "#C7D6CC",
  divider: "#E8EEE9",
}

export type ThemeColors = typeof glint;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: glint, dark: glint };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 8, md: 16, lg: 24, pill: 999 };
export const fonts = {
  display: "Outfit-SemiBold",
  displayBold: "Outfit-Bold",
  displayRegular: "Outfit-Regular",
  text: "Figtree-Regular",
  medium: "Figtree-Medium",
  semibold: "Figtree-SemiBold",
};

export const REACTIONS: { key: string; emoji: string; label: string; color: string }[] = [
  { key: "like", emoji: "👍", label: "Like", color: "#EAB308" },
  { key: "love", emoji: "❤️", label: "Love", color: "#EF4444" },
  { key: "haha", emoji: "😂", label: "Haha", color: "#F5B942" },
  { key: "wow", emoji: "😮", label: "Wow", color: "#F59E0B" },
  { key: "sad", emoji: "😢", label: "Sad", color: "#60A5FA" },
  { key: "angry", emoji: "😡", label: "Angry", color: "#DC2626" },
];

export const STORY_BG_COLORS = [
  "#EAB308", "#D97706", "#000000", "#EF4444", "#8B5CF6",
  "#EC4899", "#F97316", "#1A1A1A", "#059669", "#DB2777",
];

// Theme is locked to Glint's white + balanced green visual system.
export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  return { scheme: "light", colors: glint };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    return useMemo(() => StyleSheet.create(factory(glint)), []);
  };
}
