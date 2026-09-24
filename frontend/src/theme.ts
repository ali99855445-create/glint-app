import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F7F7F4",
  onSurface: "#171715",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#383835",
  surfaceTertiary: "#EBEBE6",
  onSurfaceTertiary: "#5C5C59",
  surfaceInverse: "#1C1C1A",
  onSurfaceInverse: "#F7F7F4",
  muted: "#82827D",
  brand: "#059669",
  onBrand: "#FFFFFF",
  brandPrimary: "#0FA968",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#F5B942",
  onBrandSecondary: "#1A1500",
  brandTertiary: "#E0F4EA",
  onBrandTertiary: "#064027",
  success: "#22C55E",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#737373",
  onInfo: "#FFFFFF",
  border: "#E3E3DE",
  borderStrong: "#C2C2BB",
  divider: "#E3E3DE",
};

const dark: typeof light = {
  surface: "#121211",
  onSurface: "#F0F0EB",
  surfaceSecondary: "#1C1C1A",
  onSurfaceSecondary: "#D6D6D2",
  surfaceTertiary: "#262624",
  onSurfaceTertiary: "#A3A39E",
  surfaceInverse: "#F0F0EB",
  onSurfaceInverse: "#121211",
  muted: "#7A7A75",
  brand: "#059669",
  onBrand: "#FFFFFF",
  brandPrimary: "#15D182",
  onBrandPrimary: "#0A3F25",
  brandSecondary: "#F5B942",
  onBrandSecondary: "#3D2E00",
  brandTertiary: "#1B3B2B",
  onBrandTertiary: "#A8F0CE",
  success: "#22C55E",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#A3A39E",
  onInfo: "#121211",
  border: "#2E2E2B",
  borderStrong: "#4A4A45",
  divider: "#2E2E2B",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

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
  { key: "like", emoji: "👍", label: "Like", color: "#0FA968" },
  { key: "love", emoji: "❤️", label: "Love", color: "#EF4444" },
  { key: "haha", emoji: "😂", label: "Haha", color: "#F5B942" },
  { key: "wow", emoji: "😮", label: "Wow", color: "#F59E0B" },
  { key: "sad", emoji: "😢", label: "Sad", color: "#3B82F6" },
  { key: "angry", emoji: "😡", label: "Angry", color: "#DC2626" },
];

export const STORY_BG_COLORS = [
  "#0FA968", "#F5B942", "#EF4444", "#8B5CF6", "#0EA5E9",
  "#EC4899", "#F97316", "#171715", "#059669", "#DB2777",
];

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
