import { EnvironmentWizard } from "./features/environments/EnvironmentWizard";
import { translate } from "./i18n/translate";
import { AppShell } from "./shell/AppShell";

export function App() {
  return (
    <AppShell>
      {(locale) => (
        <section className="environment-page">
          <header
            className="environment-command-bar"
            data-testid="environment-command-bar"
            id="environment-command-bar"
          >
            <div className="environment-command-bar__title">
              <span>{translate(locale, "environment.command.eyebrow")}</span>
              <h1>{translate(locale, "environment.title")}</h1>
              <p>{translate(locale, "environment.description")}</p>
            </div>
            <div className="environment-command-bar__status">
              <span>{translate(locale, "environment.command.localFirst")}</span>
              <span>{translate(locale, "environment.command.readOnly")}</span>
              <span>{translate(locale, "environment.command.apiOptional")}</span>
            </div>
            <div className="environment-command-bar__actions">
              <button
                type="button"
                onClick={() => focusTarget("environment-wizard-start")}
              >
                {translate(locale, "environment.command.start")}
              </button>
              <button
                className="button-secondary"
                type="button"
                onClick={() => focusTarget("environment-diagnostics")}
              >
                {translate(locale, "environment.command.diagnostics")}
              </button>
            </div>
          </header>
          <EnvironmentWizard locale={locale} />
        </section>
      )}
    </AppShell>
  );
}

function focusTarget(id: string) {
  const target = document.getElementById(id);
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  target?.focus({ preventScroll: true });
}
