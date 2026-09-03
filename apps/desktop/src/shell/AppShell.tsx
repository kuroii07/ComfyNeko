import {
  Database,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Tooltip } from "../components/Tooltip";
import { translate, type Locale } from "../i18n/translate";
import {
  type AppPreferences,
  readPreferences,
  writePreferences
} from "../preferences/preferences";

export type AppPage = "environments" | "settings";

export type AppShellRenderContext = {
  locale: Locale;
  page: AppPage;
  preferences: AppPreferences;
  updatePreferences(patch: Partial<AppPreferences>): void;
};

type AppShellProps = {
  children: ReactNode | ((context: AppShellRenderContext) => ReactNode);
  initialPreferences?: AppPreferences;
};

export function AppShell({ children, initialPreferences }: AppShellProps) {
  const [page, setPage] = useState<AppPage>("environments");
  const [preferences, setPreferences] = useState<AppPreferences>(
    () => initialPreferences ?? readPreferences(window.localStorage)
  );
  const locale = preferences.locale;
  const collapsed = preferences.sidebarCollapsed;
  const resolvedTheme = resolveTheme(preferences.theme);
  const collapseLabel = translate(
    locale,
    collapsed ? "navigation.expand" : "navigation.collapse"
  );
  const themeLabel = translate(
    locale,
    resolvedTheme === "light" ? "shell.theme.switchDark" : "shell.theme.switchLight"
  );

  function updatePreferences(patch: Partial<AppPreferences>) {
    setPreferences((current) => ({ ...current, ...patch }));
  }

  const content =
    typeof children === "function"
      ? children({ locale, page, preferences, updatePreferences })
      : children;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.lang = locale;
    writePreferences(window.localStorage, preferences);
  }, [locale, preferences, resolvedTheme]);

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
          <SidebarAction
            active={page === "environments"}
            collapsed={collapsed}
            icon={<Database aria-hidden="true" />}
            label={translate(locale, "navigation.environment")}
            onClick={() => setPage("environments")}
          />
          <SidebarAction
            active={page === "settings"}
            collapsed={collapsed}
            icon={<Settings aria-hidden="true" />}
            label={translate(locale, "navigation.settings")}
            onClick={() => setPage("settings")}
          />
        </nav>

        <div className="app-shell__footer" data-testid="sidebar-footer">
          <Tooltip label={themeLabel}>
            <button
              aria-label={themeLabel}
              className="app-shell__footer-action"
              type="button"
              onClick={() =>
                updatePreferences({
                  theme: resolvedTheme === "light" ? "dark" : "light"
                })
              }
            >
              {resolvedTheme === "light" ? (
                <Sun aria-hidden="true" />
              ) : (
                <Moon aria-hidden="true" />
              )}
              {collapsed ? null : (
                <span>{translate(locale, `shell.theme.${resolvedTheme}`)}</span>
              )}
            </button>
          </Tooltip>

          <Tooltip label={collapseLabel}>
            <button
              aria-label={collapseLabel}
              className="app-shell__footer-action"
              type="button"
              onClick={() =>
                updatePreferences({ sidebarCollapsed: !preferences.sidebarCollapsed })
              }
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden="true" />
              ) : (
                <PanelLeftClose aria-hidden="true" />
              )}
              {collapsed ? null : <span>{collapseLabel}</span>}
            </button>
          </Tooltip>
        </div>
      </aside>
      <main className="app-shell__content">{content}</main>
    </div>
  );
}

function SidebarAction({
  active,
  collapsed,
  icon,
  label,
  onClick
}: {
  active: boolean;
  collapsed: boolean;
  icon: ReactNode;
  label: string;
  onClick(): void;
}) {
  return (
    <Tooltip label={label}>
      <button
        aria-current={active ? "page" : undefined}
        aria-label={label}
        className="app-shell__nav-action"
        type="button"
        onClick={onClick}
      >
        {icon}
        {collapsed ? null : <span>{label}</span>}
      </button>
    </Tooltip>
  );
}

function resolveTheme(theme: AppPreferences["theme"]): "light" | "dark" {
  if (theme !== "system") {
    return theme;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
