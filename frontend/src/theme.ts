import { useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ColorScheme = "light" | "dark";
const gold = "#D4AF37";

const light = {
  surface: "#FFFFFF", onSurface: "#111111", surfaceSecondary: "#F8F6F0", onSurfaceSecondary: "#35312A",
  surfaceTertiary: "#F3EBD2", onSurfaceTertiary: "#6A5520", surfaceInverse: "#0B0B0B", onSurfaceInverse: "#FFFFFF",
  muted: "#746F65", brand: "#C89B2C", onBrand: "#111111", brandPrimary: gold, onBrandPrimary: "#111111",
  brandSecondary: "#B88918", onBrandSecondary: "#111111", brandTertiary: "#F6EDCF", onBrandTertiary: "#6B5010",
  success: "#24915A", onSuccess: "#FFFFFF", warning: "#D99A16", onWarning: "#111111", error: "#D74747",
  onError: "#FFFFFF", info: "#3B82F6", onInfo: "#FFFFFF", border: "#E5DDC8", borderStrong: "#CFC2A1", divider: "#EEE8D9",
};

const dark: typeof light = {
  surface: "#050505", onSurface: "#F7F3E8", surfaceSecondary: "#10100F", onSurfaceSecondary: "#DED7C7",
  surfaceTertiary: "#1C1911", onSurfaceTertiary: "#D9C27B", surfaceInverse: "#F7F3E8", onSurfaceInverse: "#090909",
  muted: "#AAA18D", brand: gold, onBrand: "#090909", brandPrimary: gold, onBrandPrimary: "#090909",
  brandSecondary: "#E0BE55", onBrandSecondary: "#090909", brandTertiary: "#29220F", onBrandTertiary: "#F0D77E",
  success: "#3DBA78", onSuccess: "#07140D", warning: "#E6B33F", onWarning: "#111111", error: "#F06464",
  onError: "#190606", info: "#60A5FA", onInfo: "#07101C", border: "#302A1B", borderStrong: "#574923", divider: "#242017",
};

export type ThemeColors = typeof light;
export const defaultScheme: ColorScheme = "dark";
export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };
const THEME_KEY = "glint.theme.scheme";
let activeScheme: ColorScheme = defaultScheme;
const listeners = new Set<(scheme: ColorScheme) => void>();
let loaded = false;

async function loadThemeOnce() {
  if (loaded) return;
  loaded = true;
  try {
    const saved = await AsyncStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") {
      activeScheme = saved;
      listeners.forEach((listener) => listener(activeScheme));
    }
  } catch {}
}

export async function setThemeScheme(scheme: ColorScheme) {
  activeScheme = scheme;
  listeners.forEach((listener) => listener(scheme));
  try { await AsyncStorage.setItem(THEME_KEY, scheme); } catch {}
}

export function useThemeScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(activeScheme);
  useEffect(() => {
    listeners.add(setScheme);
    loadThemeOnce();
    return () => { listeners.delete(setScheme); };
  }, []);
  return scheme;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 8, md: 16, lg: 24, pill: 999 };
export const fonts = { display: "Outfit-SemiBold", displayBold: "Outfit-Bold", displayRegular: "Outfit-Regular", text: "Figtree-Regular", medium: "Figtree-Medium", semibold: "Figtree-SemiBold" };

export const REACTIONS: { key: string; emoji: string; label: string; color: string }[] = [
  { key: "like", emoji: "👍", label: "Like", color: "#EAB308" }, { key: "love", emoji: "❤️", label: "Love", color: "#EF4444" },
  { key: "haha", emoji: "😂", label: "Haha", color: "#F5B942" }, { key: "wow", emoji: "😮", label: "Wow", color: "#F59E0B" },
  { key: "sad", emoji: "😢", label: "Sad", color: "#60A5FA" }, { key: "angry", emoji: "😡", label: "Angry", color: "#DC2626" },
];
export const STORY_BG_COLORS = [gold, "#B88918", "#000000", "#EF4444", "#8B5CF6", "#EC4899", "#F97316", "#1A1A1A", "#059669", "#DB2777"];

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const scheme = useThemeScheme();
  return { scheme, colors: themes[scheme] };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>): () => T {
  return function useStyles(): T {
    const scheme = useThemeScheme();
    return useMemo(() => StyleSheet.create(factory(themes[scheme])), [scheme]);
  };
}
