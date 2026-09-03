import { EnvironmentWizard } from "./features/environments/EnvironmentWizard";
import { translate } from "./i18n/translate";
import { AppShell } from "./shell/AppShell";

export function App() {
  return (
    <AppShell>
      {(locale) => (
        <section className="environment-page">
          <header className="page-guidance" data-sticky="true">
            <h1>{translate(locale, "environment.title")}</h1>
            <p>{translate(locale, "environment.description")}</p>
          </header>
          <EnvironmentWizard
            initialProbe={{
              diagnostics: [
                {
                  code: "PYTHON_NOT_CONFIGURED",
                  message: translate(locale, "environment.pythonNotConfigured"),
                  severity: "blocking"
                }
              ]
            }}
            locale={locale}
          />
        </section>
      )}
    </AppShell>
  );
}
