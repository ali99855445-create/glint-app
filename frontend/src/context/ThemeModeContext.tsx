import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Appearance } from "react-native";
import { storage } from "@/src/utils/storage";
import { setColorScheme, type ColorScheme } from "@/src/theme";

type Mode = "light" | "dark" | "system";
type Ctx = { mode: Mode; setMode: (m: Mode) => void; toggle: () => void };

const ThemeModeCtx = createContext<Ctx>(null as any);
const KEY = "glint_theme_mode";

function apply(mode: Mode) {
  if (mode === "system") setColorScheme(null);
  else setColorScheme(mode as ColorScheme);
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>("light");

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<Mode>(KEY, "light");
      const m = (saved as Mode) || "light";
      setModeState(m);
      apply(m);
    })();
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    apply(m);
    storage.setItem(KEY, m);
  }, []);

  const toggle = useCallback(() => {
    const current = Appearance.getColorScheme();
    const next: Mode = current === "dark" ? "light" : "dark";
    setMode(next);
  }, [setMode]);

  return (
    <ThemeModeCtx.Provider value={{ mode, setMode, toggle }}>{children}</ThemeModeCtx.Provider>
  );
}

export const useThemeMode = () => useContext(ThemeModeCtx);
