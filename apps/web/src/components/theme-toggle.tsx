"use client";

import { useEffect, useState } from "react";

type ThemePreference = "light" | "dark";

const storageKey = "moonshot-theme";
const preferences: ThemePreference[] = ["light", "dark"];

function cookiePreference(): ThemePreference | undefined {
  const value = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${storageKey}=`))
    ?.split("=")[1];
  return preferences.includes(value as ThemePreference) ? (value as ThemePreference) : undefined;
}

function persistPreference(preference: ThemePreference) {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${storageKey}=${preference}; path=/; max-age=${maxAge}; samesite=lax`;
  window.localStorage.setItem(storageKey, preference);
}

function systemTheme(): ThemePreference {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemePreference, preference: ThemePreference | "system" = theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = theme;
}

function storedPreference(): ThemePreference | undefined {
  try {
    const stored = window.localStorage.getItem(storageKey) ?? cookiePreference();
    return preferences.includes(stored as ThemePreference) ? (stored as ThemePreference) : undefined;
  } catch {
    return cookiePreference();
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemePreference>("light");

  useEffect(() => {
    const stored = storedPreference();
    const initialTheme = stored ?? systemTheme();
    setTheme(initialTheme);
    applyTheme(initialTheme, stored ?? "system");

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!storedPreference()) {
        const nextTheme = systemTheme();
        setTheme(nextTheme);
        applyTheme(nextTheme, "system");
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const chooseTheme = (nextTheme: ThemePreference) => {
    try {
      persistPreference(nextTheme);
    } catch {
      document.cookie = `${storageKey}=${nextTheme}; path=/; max-age=31536000; samesite=lax`;
    }
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <button
      aria-label="Toggle light and dark mode"
      aria-pressed={theme === "dark"}
      className="theme-switch"
      onClick={() => chooseTheme(theme === "dark" ? "light" : "dark")}
      suppressHydrationWarning
      type="button"
    >
      <span className="theme-switch-thumb" />
      <span className="theme-switch-label theme-switch-label-light">Light</span>
      <span className="theme-switch-label theme-switch-label-dark">Dark</span>
    </button>
  );
}
