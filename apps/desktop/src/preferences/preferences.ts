import type { Locale } from "../i18n/translate";

export type ThemePreference = "light" | "dark" | "system";

export type AppPreferences = {
  locale: Locale;
  sidebarCollapsed: boolean;
  theme: ThemePreference;
};

type PreferenceReader = Pick<Storage, "getItem">;
type PreferenceWriter = Pick<Storage, "setItem">;

const storageKey = "comfyneko.preferences.v1";

const defaults: AppPreferences = {
  locale: "zh-CN",
  sidebarCollapsed: false,
  theme: "system"
};

export function readPreferences(storage: PreferenceReader): AppPreferences {
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

export function writePreferences(storage: PreferenceWriter, preferences: AppPreferences): void {
  storage.setItem(storageKey, JSON.stringify(preferences));
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
