import { useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ColorScheme = "light" | "dark";
const gold = "#1877F2";

const light = {
  surface: "#FFFFFF", onSurface: "#111111", surfaceSecondary: "#F5F6F7", onSurfaceSecondary: "#30343B",
  surfaceTertiary: "#EEF2F6", onSurfaceTertiary: "#65676B", surfaceInverse: "#0B0B0B", onSurfaceInverse: "#FFFFFF",
  muted: "#65676B", brand: "#1877F2", onBrand: "#FFFFFF", brandPrimary: gold, onBrandPrimary: "#FFFFFF",
  brandSecondary: "#166FE5", onBrandSecondary: "#FFFFFF", brandTertiary: "#E7F3FF", onBrandTertiary: "#135DB8",
  success: "#24915A", onSuccess: "#FFFFFF", warning: "#D99A16", onWarning: "#111111", error: "#D74747",
  onError: "#FFFFFF", info: "#3B82F6", onInfo: "#FFFFFF", border: "#DADDE1", borderStrong: "#BEC3C9", divider: "#E4E6EB",
};

const dark: typeof light = {
  surface: "#18191A", onSurface: "#E4E6EB", surfaceSecondary: "#242526", onSurfaceSecondary: "#E4E6EB",
  surfaceTertiary: "#3A3B3C", onSurfaceTertiary: "#B0B3B8", surfaceInverse: "#F7F3E8", onSurfaceInverse: "#090909",
  muted: "#B0B3B8", brand: gold, onBrand: "#090909", brandPrimary: gold, onBrandPrimary: "#FFFFFF",
  brandSecondary: "#4599FF", onBrandSecondary: "#090909", brandTertiary: "#203C59", onBrandTertiary: "#B5D9FF",
  success: "#3DBA78", onSuccess: "#07140D", warning: "#E6B33F", onWarning: "#111111", error: "#F06464",
  onError: "#190606", info: "#60A5FA", onInfo: "#07101C", border: "#3E4042", borderStrong: "#5B5D60", divider: "#3E4042",
};

export type ThemeColors = typeof light;
export const defaultScheme: ColorScheme = "light";
export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };
const THEME_KEY = "glint.theme.scheme.v19";
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
export const fonts = { display: "sans-serif-medium", displayBold: "sans-serif-medium", displayRegular: "sans-serif", text: "sans-serif", medium: "sans-serif-medium", semibold: "sans-serif-medium" };

export const REACTIONS: { key: string; emoji: string; label: string; color: string }[] = [
  { key: "like", emoji: "👍", label: "Like", color: "#EAB308" }, { key: "love", emoji: "❤️", label: "Love", color: "#EF4444" },
  { key: "haha", emoji: "😂", label: "Haha", color: "#F5B942" }, { key: "wow", emoji: "😮", label: "Wow", color: "#F59E0B" },
  { key: "sad", emoji: "😢", label: "Sad", color: "#60A5FA" }, { key: "angry", emoji: "😡", label: "Angry", color: "#DC2626" },
];
export const STORY_BG_COLORS = [gold, "#166FE5", "#000000", "#EF4444", "#8B5CF6", "#EC4899", "#F97316", "#1A1A1A", "#059669", "#DB2777"];

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
