import { Home, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Tooltip } from "../components/Tooltip";
import { translate, type Locale } from "../i18n/translate";
import {
  type AppPreferences,
  readPreferences,
  type ThemePreference,
  writePreferences
} from "../preferences/preferences";

type AppShellProps = {
  children: ReactNode | ((locale: Locale) => ReactNode);
  initialPreferences?: AppPreferences;
};

export function AppShell({ children, initialPreferences }: AppShellProps) {
  const [preferences, setPreferences] = useState<AppPreferences>(
    () => initialPreferences ?? readPreferences(window.localStorage)
  );
  const locale = preferences.locale;
  const collapsed = preferences.sidebarCollapsed;
  const collapsedLabel = translate(
    locale,
    collapsed ? "navigation.expand" : "navigation.collapse"
  );
  const content = typeof children === "function" ? children(locale) : children;

  useEffect(() => {
    document.documentElement.dataset.theme = resolveTheme(preferences.theme);
    document.documentElement.lang = locale;
    writePreferences(window.localStorage, preferences);
  }, [locale, preferences]);

  return (
    <div className="app-shell" data-sidebar-collapsed={collapsed}>
      <aside className="app-shell__sidebar" data-collapsed={collapsed}>
        <div className="app-shell__brand">
          <span aria-hidden="true" className="app-shell__brand-mark">
            <img alt="" className="app-shell__brand-icon-light" src="/icon-light.png" />
            <img alt="" className="app-shell__brand-icon-dark" src="/icon-dark.png" />
          </span>
          {collapsed ? null : (
            <span className="app-shell__brand-copy">
              <strong>{translate(locale, "app.title")}</strong>
              <small>{translate(locale, "app.subtitle")}</small>
            </span>
          )}
        </div>
        <nav
          aria-label={translate(locale, "navigation.primary")}
          data-collapsed={collapsed}
        >
          <Tooltip label={translate(locale, "navigation.home")}>
            <a aria-label={translate(locale, "navigation.home")} href="#home">
              <Home aria-hidden="true" />
              {collapsed ? null : <span>{translate(locale, "navigation.home")}</span>}
            </a>
          </Tooltip>
          <Tooltip label={translate(locale, "navigation.environment")}>
            <a
              aria-current="page"
              aria-label={translate(locale, "navigation.environment")}
              href="#environments"
            >
              <Settings aria-hidden="true" />
              {collapsed ? null : <span>{translate(locale, "navigation.environment")}</span>}
            </a>
          </Tooltip>
        </nav>
        <div className="app-shell__footer" data-testid="sidebar-footer">
          <div className="app-shell__preferences">
            <label>
              <span>{translate(locale, "shell.theme")}</span>
              <select
                aria-label={translate(locale, "shell.theme")}
                value={preferences.theme}
                onChange={(event) => {
                  setPreferences((current) => ({
                    ...current,
                    theme: event.target.value as ThemePreference
                  }));
                }}
              >
                <option value="light">{translate(locale, "shell.theme.light")}</option>
                <option value="dark">{translate(locale, "shell.theme.dark")}</option>
                <option value="system">{translate(locale, "shell.theme.system")}</option>
              </select>
            </label>
            <label>
              <span>{translate(locale, "shell.language")}</span>
              <select
                aria-label={translate(locale, "shell.language")}
                value={locale}
                onChange={(event) => {
                  setPreferences((current) => ({
                    ...current,
                    locale: event.target.value as AppPreferences["locale"]
                  }));
                }}
              >
                <option value="zh-CN">{translate(locale, "shell.language.chinese")}</option>
                <option value="en-US">{translate(locale, "shell.language.english")}</option>
              </select>
            </label>
          </div>
          <Tooltip label={collapsedLabel}>
            <button
              className="app-shell__collapse"
              aria-label={collapsedLabel}
              type="button"
              onClick={() => {
                setPreferences((current) => ({
                  ...current,
                  sidebarCollapsed: !current.sidebarCollapsed
                }));
              }}
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden="true" />
              ) : (
                <PanelLeftClose aria-hidden="true" />
              )}
            </button>
          </Tooltip>
        </div>
      </aside>
      <main className="app-shell__content">{content}</main>
    </div>
  );
}

function resolveTheme(theme: AppPreferences["theme"]): "light" | "dark" {
  if (theme !== "system") {
    return theme;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
