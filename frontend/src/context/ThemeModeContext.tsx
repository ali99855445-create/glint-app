import React, { createContext, useContext } from "react";
import { ColorScheme, useThemeScheme, setThemeScheme } from "@/src/theme";
type Ctx = { mode: ColorScheme; setMode: (m: ColorScheme) => void; toggle: () => void };
const ThemeModeCtx = createContext<Ctx>(null as any);
export function ThemeModeProvider({children}: {children: React.ReactNode}) {
 const mode=useThemeScheme();
 return <ThemeModeCtx.Provider value={{mode,setMode:setThemeScheme,toggle:()=>setThemeScheme(mode==="dark"?"light":"dark")}}>{children}</ThemeModeCtx.Provider>;
}
export const useThemeMode=()=>useContext(ThemeModeCtx);
