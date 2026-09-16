/**
 * Client-side theme store. localStorage "theme" is the source of truth;
 * data-theme on <html> and the theme-color meta tags mirror it.
 * app/layout.tsx applies the saved value before first paint.
 */

export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "theme";

/** Must match --canvas in globals.css and viewport.themeColor in app/layout.tsx. */
export const THEME_COLORS = { light: "#faf7f3", dark: "#131110" } as const;

const listeners = new Set<() => void>();

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function setAttribute(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/**
 * Point the browser chrome (address bar, PWA title bar) at the right canvas
 * color. The meta tags are media-scoped for the OS preference; a forced theme
 * overrides both so whichever tag the browser picks agrees with the page.
 */
export function syncThemeColor(theme: Theme = readTheme()) {
  const tags = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  tags.forEach((tag) => {
    const media = tag.getAttribute("media") ?? "";
    const side = theme === "system" ? (media.includes("light") ? "light" : "dark") : theme;
    tag.content = THEME_COLORS[side];
  });
}

export function subscribeTheme(cb: () => void) {
  // Another tab changed it: mirror the attribute here too, then notify.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== THEME_KEY) return;
    setAttribute(readTheme());
    cb();
  };
  listeners.add(cb);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function applyTheme(next: Theme) {
  setAttribute(next);
  try {
    if (next === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch {
    // Storage unavailable (private mode etc.); still applies for this page.
  }
  syncThemeColor(next);
  listeners.forEach((l) => l());
}
