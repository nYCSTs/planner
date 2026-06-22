"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Lightweight theme controller. The actual <html class="dark"> toggle is also
 * pre-applied by an inline script in layout to avoid a flash; this keeps it in
 * sync with React state and the user's settings.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  const apply = (t: Theme) => {
    const isDark = t === "dark" || (t === "system" && systemPrefersDark());
    document.documentElement.classList.toggle("dark", isDark);
    setResolved(isDark ? "dark" : "light");
  };

  useEffect(() => {
    // Syncing React state to external systems (DOM class + matchMedia).
    /* eslint-disable react-hooks/set-state-in-effect */
    apply(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => apply("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
