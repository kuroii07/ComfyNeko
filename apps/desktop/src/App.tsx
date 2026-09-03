import { PageHeader } from "./components/PageHeader";
import { EnvironmentManager } from "./features/environments/EnvironmentManager";
import { SettingsPage } from "./features/settings/SettingsPage";
import { translate } from "./i18n/translate";
import { AppShell } from "./shell/AppShell";

export function App() {
  return (
    <AppShell>
      {({ locale, page, preferences, updatePreferences }) =>
        page === "settings" ? (
          <SettingsPage
            locale={locale}
            preferences={preferences}
            onPreferencesChange={updatePreferences}
          />
        ) : (
          <section className="settings-page environment-page">
            <PageHeader
              description={translate(locale, "environment.description")}
              help={translate(locale, "environment.pageHelp")}
              keyboardHelp={translate(locale, "environment.keyboardHelp")}
              locale={locale}
              title={translate(locale, "environment.title")}
            />
            <EnvironmentManager locale={locale} />
          </section>
        )
      }
    </AppShell>
  );
}
