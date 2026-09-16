"use client";

import { useEffect } from "react";
import { subscribeTheme, syncThemeColor } from "@/lib/theme";

/**
 * Keeps the theme-color meta tags in step with a forced theme on every page,
 * not just Settings. Renders nothing.
 */
export function ThemeColorSync() {
  useEffect(() => {
    syncThemeColor();
    return subscribeTheme(() => syncThemeColor());
  }, []);
  return null;
}
