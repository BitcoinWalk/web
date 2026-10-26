export type ThemePreference = "system" | "light" | "dark";
export const themeStorageKey = "bitcoinwalk.theme.v1";
export const themePreferenceEvent = "bitcoinwalk:theme-preference";
export const validThemePreference = (value: unknown): ThemePreference => value === "dark" || value === "light" ? value : "system";
let memoryPreference: ThemePreference = "system";

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try { return validThemePreference(localStorage.getItem(themeStorageKey)); }
  catch { return memoryPreference; }
}
export function saveThemePreference(value: ThemePreference) {
  memoryPreference = validThemePreference(value);
  try { localStorage.setItem(themeStorageKey, memoryPreference); } catch { /* Private/blocked storage: keep this tab usable. */ }
  document.documentElement.dataset.bwTheme = memoryPreference;
  window.dispatchEvent(new Event(themePreferenceEvent));
}
export function subscribeThemePreference(changed: () => void) {
  const storage = (event: StorageEvent) => { if (event.key === themeStorageKey || event.key === null) changed(); };
  window.addEventListener("storage", storage);
  window.addEventListener(themePreferenceEvent, changed);
  return () => {window.removeEventListener("storage", storage); window.removeEventListener(themePreferenceEvent, changed);};
}
// Static, first-paint bootstrap. Never interpolates content, keys or user input.
export const themeInitScript = `try{var t=localStorage.getItem("${themeStorageKey}");document.documentElement.dataset.bwTheme=t==="light"||t==="dark"?t:"system"}catch{}`;
