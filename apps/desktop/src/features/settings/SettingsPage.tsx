import { Monitor, Moon, Sun } from "lucide-react";

import { PageHeader } from "../../components/PageHeader";
import { translate, type Locale } from "../../i18n/translate";
import {
  type AppPreferences,
  type ThemePreference
} from "../../preferences/preferences";

type SettingsPageProps = {
  locale: Locale;
  preferences: AppPreferences;
  onPreferencesChange(patch: Partial<AppPreferences>): void;
};

const themeOptions: Array<{
  icon: typeof Sun;
  value: ThemePreference;
}> = [
  { icon: Sun, value: "light" },
  { icon: Moon, value: "dark" },
  { icon: Monitor, value: "system" }
];

export function SettingsPage({
  locale,
  preferences,
  onPreferencesChange
}: SettingsPageProps) {
  return (
    <section className="settings-page">
      <PageHeader
        description={translate(locale, "settings.description")}
        help={translate(locale, "settings.pageHelp")}
        keyboardHelp={translate(locale, "settings.keyboardHelp")}
        locale={locale}
        title={translate(locale, "settings.title")}
      />

      <div className="settings-section-label">
        {translate(locale, "settings.appearanceLanguage")}
      </div>
      <article className="settings-group">
        <div className="settings-row">
          <div className="settings-row__main">
            <strong>{translate(locale, "shell.theme")}</strong>
            <small>{translate(locale, "settings.themeHelp")}</small>
          </div>
          <div className="segmented-control" aria-label={translate(locale, "shell.theme")}>
            {themeOptions.map(({ icon: Icon, value }) => (
              <button
                aria-pressed={preferences.theme === value}
                key={value}
                type="button"
                onClick={() => onPreferencesChange({ theme: value })}
              >
                <Icon aria-hidden="true" />
                {translate(locale, `shell.theme.${value}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <div className="settings-row__main">
            <strong>{translate(locale, "shell.language")}</strong>
            <small>{translate(locale, "settings.languageHelp")}</small>
          </div>
          <div className="segmented-control" aria-label={translate(locale, "shell.language")}>
            <button
              aria-pressed={preferences.locale === "zh-CN"}
              type="button"
              onClick={() => onPreferencesChange({ locale: "zh-CN" })}
            >
              中文
            </button>
            <button
              aria-pressed={preferences.locale === "en-US"}
              type="button"
              onClick={() => onPreferencesChange({ locale: "en-US" })}
            >
              English
            </button>
          </div>
        </div>
      </article>

      <div className="settings-section-label">
        {translate(locale, "settings.interface")}
      </div>
      <article className="settings-group">
        <div className="settings-row">
          <div className="settings-row__main">
            <strong>{translate(locale, "settings.sidebar")}</strong>
            <small>{translate(locale, "settings.sidebarHelp")}</small>
          </div>
          <div className="segmented-control">
            <button
              aria-pressed={!preferences.sidebarCollapsed}
              type="button"
              onClick={() => onPreferencesChange({ sidebarCollapsed: false })}
            >
              {translate(locale, "settings.sidebarExpanded")}
            </button>
            <button
              aria-pressed={preferences.sidebarCollapsed}
              type="button"
              onClick={() => onPreferencesChange({ sidebarCollapsed: true })}
            >
              {translate(locale, "settings.sidebarCollapsed")}
            </button>
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row__main">
            <strong>{translate(locale, "settings.motion")}</strong>
            <small>{translate(locale, "settings.motionHelp")}</small>
          </div>
          <span className="settings-value">
            {translate(locale, "settings.motionSystem")}
          </span>
        </div>
      </article>

      <div className="settings-section-label">
        {translate(locale, "settings.appInfo")}
      </div>
      <article className="settings-group">
        <div className="settings-row">
          <div className="settings-row__main">
            <strong>{translate(locale, "settings.dataLocation")}</strong>
            <small>{translate(locale, "settings.dataLocationHelp")}</small>
          </div>
          <span className="settings-value">
            {translate(locale, "settings.localFirst")}
          </span>
        </div>
        <div className="settings-row">
          <div className="settings-row__main">
            <strong>{translate(locale, "settings.safety")}</strong>
            <small>{translate(locale, "settings.safetyHelp")}</small>
          </div>
          <span className="settings-value">
            {translate(locale, "settings.readOnly")}
          </span>
        </div>
        <div className="settings-row">
          <div className="settings-row__main">
            <strong>{translate(locale, "settings.version")}</strong>
            <small>{translate(locale, "settings.versionHelp")}</small>
          </div>
          <span className="settings-value settings-value--mono">0.1.0</span>
        </div>
      </article>
    </section>
  );
}
