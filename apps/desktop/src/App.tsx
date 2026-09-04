import { useState } from "react";

import { AssetScanPage } from "./features/assets/AssetScanPage";
import { EnvironmentManager } from "./features/environments/EnvironmentManager";
import { PlannedFeaturePage } from "./features/planned/PlannedFeaturePage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { translate, type MessageKey } from "./i18n/translate";
import { AppShell, type AppPage } from "./shell/AppShell";

type PlannedPage = Exclude<AppPage, "assets" | "environments" | "settings">;

const plannedPageTitleKeys: Record<PlannedPage, MessageKey> = {
  home: "navigation.home",
  models: "navigation.models",
  nodes: "navigation.nodes",
  prompts: "navigation.prompts",
  workflows: "navigation.workflows"
};

export function App() {
  const [hasUnsavedEnvironmentChanges, setHasUnsavedEnvironmentChanges] =
    useState(false);

  return (
    <AppShell
      hasUnsavedChanges={hasUnsavedEnvironmentChanges}
      onDiscardUnsavedChanges={() => setHasUnsavedEnvironmentChanges(false)}
    >
      {({ locale, navigateTo, page, preferences, updatePreferences }) => {
        if (page === "settings") {
          return (
            <SettingsPage
              locale={locale}
              preferences={preferences}
              onPreferencesChange={updatePreferences}
            />
          );
        }

        if (page === "environments") {
          return (
            <section className="environment-page">
              <EnvironmentManager
                locale={locale}
                onDirtyChange={setHasUnsavedEnvironmentChanges}
              />
            </section>
          );
        }

        if (page === "assets") {
          return (
            <AssetScanPage
              locale={locale}
              onOpenEnvironments={() => navigateTo("environments")}
            />
          );
        }

        return (
          <PlannedFeaturePage
            locale={locale}
            titleKey={plannedPageTitleKeys[page]}
          />
        );
      }}
    </AppShell>
  );
}
