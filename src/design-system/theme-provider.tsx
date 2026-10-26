"use client";

import {createContext, useContext, useEffect, useSyncExternalStore, type ReactNode} from "react";
import {readThemePreference, saveThemePreference, subscribeThemePreference, type ThemePreference} from "./theme-preference";


type Theme = "dark" | "light";
type ThemeContextValue = {theme: Theme; themePreference: ThemePreference; setTheme: (theme: ThemePreference) => void};
const subscribeSystem = (changed: () => void) => {const media = window.matchMedia("(prefers-color-scheme: dark)"); media.addEventListener("change", changed); return () => media.removeEventListener("change", changed);};
const systemSnapshot = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
const serverSnapshot = () => "system" as const;
const ThemeContext = createContext<ThemeContextValue | null>(null);
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("Theme controls require ThemeProvider");
  return context;
}

/** Persist only the user's light/dark/system appearance preference. */
export default function ThemeProvider({children}: {children: ReactNode}) {
  const themePreference = useSyncExternalStore(subscribeThemePreference, readThemePreference, serverSnapshot);
  const systemDark = useSyncExternalStore(subscribeSystem, systemSnapshot, () => true);
  const theme: Theme = themePreference === "system" ? systemDark ? "dark" : "light" : themePreference;
  useEffect(() => {
    document.documentElement.dataset.bwTheme = readThemePreference();
  }, [themePreference]);
  return <ThemeContext.Provider value={{theme, themePreference, setTheme: saveThemePreference}}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const {theme, setTheme} = useTheme();
  return <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">{theme === "dark" ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></> : <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>}</svg></button>;
}
