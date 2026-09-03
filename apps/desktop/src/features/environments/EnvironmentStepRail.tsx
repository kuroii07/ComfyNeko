import { Check } from "lucide-react";

import { translate, type Locale } from "../../i18n/translate";
import type { WizardStep } from "./environmentWizardTypes";

export function EnvironmentStepRail({
  currentStep,
  locale
}: {
  currentStep: WizardStep;
  locale: Locale;
}) {
  return (
    <ol aria-label={translate(locale, "environment.steps")} className="wizard-steps">
      {([1, 2, 3, 4] as const).map((step) => {
        const state =
          step < currentStep
            ? "complete"
            : step === currentStep
              ? "current"
              : "upcoming";

        return (
          <li
            aria-current={state === "current" ? "step" : undefined}
            data-state={state}
            key={step}
          >
            <span aria-hidden="true">
              {state === "complete" ? <Check size={14} /> : step}
            </span>
            <strong>{translate(locale, `environment.step.${step}`)}</strong>
          </li>
        );
      })}
    </ol>
  );
}
