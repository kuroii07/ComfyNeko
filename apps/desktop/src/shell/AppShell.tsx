import {
  Blocks,
  BrainCircuit,
  Database,
  House,
  Images,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  TextQuote,
  Workflow,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Tooltip } from "../components/Tooltip";
import {
  translate,
  type Locale,
  type MessageKey
} from "../i18n/translate";
import {
  type AppPreferences,
  readPreferences,
  writePreferences
} from "../preferences/preferences";

export type AppPage =
  | "home"
  | "models"
  | "assets"
  | "workflows"
  | "prompts"
  | "nodes"
  | "environments"
  | "settings";

type NavigationItem = {
  icon: LucideIcon;
  labelKey: MessageKey;
  page: AppPage;
};

const primaryNavigationItems: NavigationItem[] = [
  { icon: House, labelKey: "navigation.home", page: "home" },
  { icon: BrainCircuit, labelKey: "navigation.models", page: "models" },
  { icon: Images, labelKey: "navigation.assets", page: "assets" },
  { icon: Workflow, labelKey: "navigation.workflows", page: "workflows" },
  { icon: TextQuote, labelKey: "navigation.prompts", page: "prompts" },
  { icon: Blocks, labelKey: "navigation.nodes", page: "nodes" }
];

const utilityNavigationItems: NavigationItem[] = [
  {
    icon: Database,
    labelKey: "navigation.environment",
    page: "environments"
  },
  { icon: Settings, labelKey: "navigation.settings", page: "settings" }
];

export type AppShellRenderContext = {
  locale: Locale;
  page: AppPage;
  preferences: AppPreferences;
  navigateTo(page: AppPage): void;
  updatePreferences(patch: Partial<AppPreferences>): void;
};

type AppShellProps = {
  children: ReactNode | ((context: AppShellRenderContext) => ReactNode);
  hasUnsavedChanges?: boolean;
  initialPreferences?: AppPreferences;
  onDiscardUnsavedChanges?(): void;
};

export function AppShell({
  children,
  hasUnsavedChanges = false,
  initialPreferences,
  onDiscardUnsavedChanges
}: AppShellProps) {
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

  function navigateTo(nextPage: AppPage) {
    if (nextPage === page) {
      return;
    }

    if (
      hasUnsavedChanges &&
      !window.confirm(translate(locale, "navigation.discardChanges"))
    ) {
      return;
    }

    if (hasUnsavedChanges) {
      onDiscardUnsavedChanges?.();
    }
    setPage(nextPage);
  }

  const content =
    typeof children === "function"
      ? children({
          locale,
          navigateTo,
          page,
          preferences,
          updatePreferences
        })
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
          className="app-shell__primary-nav"
          data-collapsed={collapsed}
        >
          {primaryNavigationItems.map((item) => (
            <SidebarAction
              active={page === item.page}
              collapsed={collapsed}
              icon={item.icon}
              key={item.page}
              label={translate(locale, item.labelKey)}
              onClick={() => navigateTo(item.page)}
            />
          ))}
        </nav>

        <div className="app-shell__footer" data-testid="sidebar-footer">
          <nav
            aria-label={translate(locale, "navigation.utility")}
            className="app-shell__utility-nav"
            data-collapsed={collapsed}
          >
            {utilityNavigationItems.map((item) => (
              <SidebarAction
                active={page === item.page}
                collapsed={collapsed}
                icon={item.icon}
                key={item.page}
                label={translate(locale, item.labelKey)}
                onClick={() => navigateTo(item.page)}
              />
            ))}
          </nav>

          <div className="app-shell__footer-controls">
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
                className="app-shell__footer-action app-shell__collapse-action"
                type="button"
                onClick={() =>
                  updatePreferences({
                    sidebarCollapsed: !preferences.sidebarCollapsed
                  })
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
  icon: LucideIcon;
  label: string;
  onClick(): void;
}) {
  const Icon = icon;

  return (
    <Tooltip label={label}>
      <button
        aria-current={active ? "page" : undefined}
        aria-label={label}
        className="app-shell__nav-action"
        type="button"
        onClick={onClick}
      >
        <Icon aria-hidden="true" />
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
