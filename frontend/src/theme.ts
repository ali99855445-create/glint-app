import { useEffect, useMemo, useState } from "react";
import { StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

// Glint: STRICT Black & Golden theme. Both schemes resolve to the same
// black-and-gold palette so no white background can ever appear.
const glint = {
  surface: "#000000", // pure black canvas
  onSurface: "#FFFFFF",
  surfaceSecondary: "#0F0F0F", // near-black cards
  onSurfaceSecondary: "#E5E7EB",
  surfaceTertiary: "#1A1A1A", // inputs, chips, deepest nesting
  onSurfaceTertiary: "#9CA3AF",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#000000",
  muted: "#9CA3AF",
  brand: "#EAB308",
  onBrand: "#000000",
  brandPrimary: "#EAB308", // golden yellow — primary CTA, FAB, active nav, story rings
  onBrandPrimary: "#000000",
  brandSecondary: "#D97706", // deep gold — golden tick, banners
  onBrandSecondary: "#000000",
  brandTertiary: "#2A2308", // gold-tinted fill on black
  onBrandTertiary: "#FDE68A",
  success: "#22C55E",
  onSuccess: "#000000",
  warning: "#F59E0B",
  onWarning: "#000000",
  error: "#EF4444",
  onError: "#000000",
  info: "#9CA3AF",
  onInfo: "#000000",
  border: "#262626",
  borderStrong: "#3A3A3A",
  divider: "#1F1F1F",
};

export type ThemeColors = typeof glint;

export const defaultScheme = "dark" satisfies ColorScheme;

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

// Theme is locked: Glint ships one signature black & gold look.
export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  return { scheme: "dark", colors: glint };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    return useMemo(() => StyleSheet.create(factory(glint)), []);
  };
}
