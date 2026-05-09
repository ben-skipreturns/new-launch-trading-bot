"use client";

import { useEffect, useState } from "react";

type ThemePreference = "system" | "light" | "dark";

const storageKey = "moonshot-theme";
const preferences: ThemePreference[] = ["system", "light", "dark"];

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

function resolvedTheme(preference: ThemePreference) {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(preference: ThemePreference) {
  const resolved = resolvedTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
}

function storedPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(storageKey) ?? cookiePreference();
    return preferences.includes(stored as ThemePreference) ? (stored as ThemePreference) : "system";
  } catch {
    return cookiePreference() ?? "system";
  }
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const initialPreference = storedPreference();
    setPreference(initialPreference);
    applyTheme(initialPreference);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (storedPreference() === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const choosePreference = (nextPreference: ThemePreference) => {
    try {
      persistPreference(nextPreference);
    } catch {
      document.cookie = `${storageKey}=${nextPreference}; path=/; max-age=31536000; samesite=lax`;
    }
    setPreference(nextPreference);
    applyTheme(nextPreference);
  };

  return (
    <div className="theme-control inline-flex rounded-lg p-1" aria-label="Theme preference">
      {preferences.map((option) => (
        <button
          aria-pressed={preference === option}
          className={`theme-option ${preference === option ? "theme-option-active" : ""}`}
          key={option}
          onClick={() => choosePreference(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
