import { translate, type Locale } from "../../i18n/translate";

type ProbeDiagnostic = {
  code: string;
  message: string;
  severity: "blocking" | "warning";
};

type EnvironmentWizardProps = {
  initialProbe: {
    diagnostics: readonly ProbeDiagnostic[];
  };
  locale?: Locale;
};

export function EnvironmentWizard({
  initialProbe,
  locale = "zh-CN"
}: EnvironmentWizardProps) {
  const hasBlockingDiagnostic = initialProbe.diagnostics.some(
    (diagnostic) => diagnostic.severity === "blocking"
  );
  const saveBlockedMessage = translate(locale, "environment.saveBlocked");

  return (
    <section aria-labelledby="environment-wizard-title">
      <h1 id="environment-wizard-title">
        {translate(locale, "environment.title")}
      </h1>
      <p>{translate(locale, "environment.description")}</p>
      <button
        aria-describedby={hasBlockingDiagnostic ? "environment-save-status" : undefined}
        disabled={hasBlockingDiagnostic}
        type="button"
      >
        {translate(locale, "environment.save")}
      </button>
      {hasBlockingDiagnostic ? (
        <p id="environment-save-status" role="status">
          {saveBlockedMessage}
        </p>
      ) : null}
    </section>
  );
}
