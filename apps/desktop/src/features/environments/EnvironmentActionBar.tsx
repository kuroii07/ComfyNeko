import { translate, type Locale } from "../../i18n/translate";
import type { RequestState, WizardStep } from "./environmentWizardTypes";

type EnvironmentActionBarProps = {
  busy: boolean;
  canAdvance: boolean;
  canSave: boolean;
  locale: Locale;
  requestState: RequestState;
  step: WizardStep;
  onBack(): void;
  onNext(): void;
  onProbe(): void;
  onSave(): void;
};

export function EnvironmentActionBar({
  busy,
  canAdvance,
  canSave,
  locale,
  requestState,
  step,
  onBack,
  onNext,
  onProbe,
  onSave
}: EnvironmentActionBarProps) {
  return (
    <footer className="environment-action-bar">
      <button
        className="button-secondary"
        disabled={step === 1 || busy}
        type="button"
        onClick={onBack}
      >
        {translate(locale, "common.back")}
      </button>
      <div>
        {step === 4 ? (
          <>
            <button
              className="button-secondary"
              disabled={busy}
              type="button"
              onClick={onProbe}
            >
              {requestState === "probing"
                ? translate(locale, "environment.probing")
                : translate(locale, "environment.probe")}
            </button>
            <button
              disabled={!canSave || busy}
              type="button"
              onClick={onSave}
            >
              {requestState === "saving"
                ? translate(locale, "environment.saving")
                : translate(locale, "environment.save")}
            </button>
          </>
        ) : (
          <button
            disabled={!canAdvance || busy}
            type="button"
            onClick={onNext}
          >
            {translate(locale, "common.next")}
          </button>
        )}
      </div>
    </footer>
  );
}
