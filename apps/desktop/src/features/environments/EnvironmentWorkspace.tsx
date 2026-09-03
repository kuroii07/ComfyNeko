import type { ReactNode } from "react";

import type { RequestState, WizardStep } from "./environmentWizardTypes";

type EnvironmentWorkspaceProps = {
  form: ReactNode;
  requestState: RequestState;
  status: ReactNode;
  step: WizardStep;
};

export function EnvironmentWorkspace({
  form,
  requestState,
  status,
  step
}: EnvironmentWorkspaceProps) {
  return (
    <section
      className="environment-workspace"
      data-request-state={requestState}
      data-step={step}
      data-testid="environment-workspace"
      id="environment-workspace"
    >
      <div
        className="environment-form-panel"
        data-testid="environment-form-panel"
        id="environment-wizard-start"
        tabIndex={-1}
      >
        {form}
      </div>
      {status}
    </section>
  );
}
