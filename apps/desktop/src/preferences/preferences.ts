import type { Locale } from "../i18n/translate";

export type ThemePreference = "light" | "dark" | "system";

export type AppPreferences = {
  locale: Locale;
  sidebarCollapsed: boolean;
  theme: ThemePreference;
};

type PreferenceStorage = Pick<Storage, "getItem">;

const storageKey = "comfyneko.preferences.v1";

const defaults: AppPreferences = {
  locale: "zh-CN",
  sidebarCollapsed: false,
  theme: "system"
};

export function readPreferences(storage: PreferenceStorage): AppPreferences {
  const raw = storage.getItem(storageKey);

  if (!raw) {
    return defaults;
  }

  try {
    return sanitizePreferences(JSON.parse(raw));
  } catch {
    return defaults;
  }
}

function sanitizePreferences(value: unknown): AppPreferences {
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    locale: value.locale === "en-US" ? "en-US" : "zh-CN",
    sidebarCollapsed: value.sidebarCollapsed === true,
    theme: isThemePreference(value.theme) ? value.theme : "system"
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}
