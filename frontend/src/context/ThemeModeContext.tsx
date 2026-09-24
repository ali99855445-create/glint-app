import React, { createContext, useContext } from "react";

// Theme is locked to the signature Black & Golden look (see src/theme.ts).
// The provider is kept as a stable API so screens don't change.
type Mode = "dark";
type Ctx = { mode: Mode; setMode: (m: Mode) => void; toggle: () => void };

const ThemeModeCtx = createContext<Ctx>(null as any);

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeModeCtx.Provider value={{ mode: "dark", setMode: () => {}, toggle: () => {} }}>
      {children}
    </ThemeModeCtx.Provider>
  );
}

export const useThemeMode = () => useContext(ThemeModeCtx);
