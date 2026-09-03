import { PageHeader } from "./components/PageHeader";
import { EnvironmentManager } from "./features/environments/EnvironmentManager";
import { PlannedFeaturePage } from "./features/planned/PlannedFeaturePage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { translate, type MessageKey } from "./i18n/translate";
import { AppShell, type AppPage } from "./shell/AppShell";

type PlannedPage = Exclude<AppPage, "environments" | "settings">;

const plannedPageTitleKeys: Record<PlannedPage, MessageKey> = {
  assets: "navigation.assets",
  home: "navigation.home",
  models: "navigation.models",
  nodes: "navigation.nodes",
  prompts: "navigation.prompts",
  workflows: "navigation.workflows"
};

export function App() {
  return (
    <AppShell>
      {({ locale, page, preferences, updatePreferences }) => {
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
            <section className="settings-page environment-page">
              <PageHeader
                description={translate(locale, "environment.description")}
                help={translate(locale, "environment.pageHelp")}
                keyboardHelp={translate(locale, "environment.keyboardHelp")}
                locale={locale}
                title={translate(locale, "environment.settingsTitle")}
              />
              <EnvironmentManager locale={locale} />
            </section>
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
