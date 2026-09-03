import { useState, type ReactNode } from "react";

import { translate, type Locale } from "../../i18n/translate";
import { EnvironmentActionBar } from "./EnvironmentActionBar";
import { EnvironmentStatusRail } from "./EnvironmentStatusRail";
import { EnvironmentStepRail } from "./EnvironmentStepRail";
import { EnvironmentWorkspace } from "./EnvironmentWorkspace";
import {
  tauriEnvironmentApi,
  type EnvironmentApi,
  type EnvironmentProfile,
  type EnvironmentRoots,
  type ProbeResult
} from "./environmentApi";
import type { RequestState, WizardStep } from "./environmentWizardTypes";

type RootKey = keyof EnvironmentRoots;

type EnvironmentWizardProps = {
  api?: EnvironmentApi;
  initialProbe?: ProbeResult;
  initialProfile?: EnvironmentProfile;
  initialStep?: WizardStep;
  locale?: Locale;
  onSaved?(profile: EnvironmentProfile): void | Promise<void>;
};

const rootFields: RootKey[] = [
  "models",
  "input",
  "output",
  "workflows",
  "custom_nodes"
];

export function EnvironmentWizard({
  api = tauriEnvironmentApi,
  initialProbe,
  initialProfile,
  initialStep = 1,
  locale = "zh-CN",
  onSaved
}: EnvironmentWizardProps) {
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [profile, setProfile] = useState<EnvironmentProfile>(
    () => initialProfile ?? createEmptyProfile()
  );
  const [probe, setProbe] = useState<ProbeResult | null>(initialProbe ?? null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [requestError, setRequestError] = useState("");

  const hasBlockingDiagnostic =
    probe?.diagnostics.some((diagnostic) => diagnostic.severity === "blocking") ?? true;
  const canContinueFromBasics =
    profile.name.trim().length > 0 && profile.comfy_root.trim().length > 0;
  const busy = requestState === "probing" || requestState === "saving";

  async function runProbe() {
    setRequestState("probing");
    setRequestError("");
    try {
      const result = await api.probeEnvironment(profile);
      setProbe(result);
      setRequestState("idle");
    } catch (error) {
      setRequestError(String(error));
      setRequestState("error");
    }
  }

  async function saveEnvironment() {
    setRequestState("saving");
    setRequestError("");
    try {
      const result = await api.saveEnvironment(profile);
      setProbe(result);
      setRequestState("saved");
      await onSaved?.(profile);
    } catch (error) {
      setRequestError(String(error));
      setRequestState("error");
    }
  }

  function renderCurrentStep() {
    if (step === 1) {
      return (
        <WizardPanel title={translate(locale, "environment.step.1")}>
          <label>
            <span>{translate(locale, "environment.name")}</span>
            <input
              value={profile.name}
              onChange={(event) => {
                setProfile((current) => ({ ...current, name: event.target.value }));
                setProbe(null);
              }}
            />
          </label>
          <label>
            <span>{translate(locale, "environment.comfyRoot")}</span>
            <input
              value={profile.comfy_root}
              onChange={(event) => {
                setProfile((current) => ({
                  ...current,
                  comfy_root: event.target.value
                }));
                setProbe(null);
              }}
            />
          </label>
        </WizardPanel>
      );
    }

    if (step === 2) {
      return (
        <WizardPanel title={translate(locale, "environment.step.2")}>
          <label>
            <span>{translate(locale, "environment.python")}</span>
            <input
              value={profile.python_executable ?? ""}
              onChange={(event) => {
                setProfile((current) => ({
                  ...current,
                  python_executable: event.target.value || null
                }));
                setProbe(null);
              }}
            />
          </label>
          <label>
            <span>{translate(locale, "environment.apiPort")}</span>
            <input
              inputMode="numeric"
              max="65535"
              min="1"
              type="number"
              value={profile.api?.port ?? ""}
              onChange={(event) => {
                const port = Number(event.target.value);
                setProfile((current) => ({
                  ...current,
                  api:
                    Number.isInteger(port) && port > 0 && port <= 65535
                      ? { host: "127.0.0.1", port }
                      : null
                }));
                setProbe(null);
              }}
            />
          </label>
          <p className="field-help">{translate(locale, "environment.apiHelp")}</p>
        </WizardPanel>
      );
    }

    if (step === 3) {
      return (
        <WizardPanel title={translate(locale, "environment.step.3")}>
          <p className="field-help">{translate(locale, "environment.rootsHelp")}</p>
          <div className="root-fields">
            {rootFields.map((rootKey) => (
              <label key={rootKey}>
                <span>{translate(locale, `environment.root.${rootKey}`)}</span>
                <textarea
                  rows={2}
                  value={profile.roots[rootKey].join("\n")}
                  onChange={(event) => {
                    const values = event.target.value
                      .split(/\r?\n/)
                      .map((value) => value.trim())
                      .filter(Boolean);
                    setProfile((current) => ({
                      ...current,
                      roots: { ...current.roots, [rootKey]: values }
                    }));
                    setProbe(null);
                  }}
                />
              </label>
            ))}
          </div>
        </WizardPanel>
      );
    }

    return (
      <WizardPanel title={translate(locale, "environment.step.4")}>
        <dl className="environment-summary">
          <div>
            <dt>{translate(locale, "environment.name")}</dt>
            <dd>{profile.name || "—"}</dd>
          </div>
          <div>
            <dt>{translate(locale, "environment.comfyRoot")}</dt>
            <dd>{profile.comfy_root || "—"}</dd>
          </div>
          <div>
            <dt>{translate(locale, "environment.python")}</dt>
            <dd>{profile.python_executable || "—"}</dd>
          </div>
        </dl>
        {hasBlockingDiagnostic ? (
          <p id="environment-save-status" className="wizard-notice">
            {probe
              ? translate(locale, "environment.saveBlocked")
              : translate(locale, "environment.probeFirst")}
          </p>
        ) : null}
        {requestState === "saved" ? (
          <p className="wizard-feedback wizard-feedback--success" role="status">
            {translate(locale, "environment.saved")}
          </p>
        ) : null}
        {requestState === "error" ? (
          <p className="wizard-feedback wizard-feedback--error" role="alert">
            {translate(locale, "environment.requestFailed")}: {requestError}
          </p>
        ) : null}
      </WizardPanel>
    );
  }

  return (
    <section
      aria-label={translate(locale, "environment.title")}
      className="environment-wizard"
    >
      <EnvironmentWorkspace
        form={
          <>
            <EnvironmentStepRail currentStep={step} locale={locale} />
            <div data-motion="step-enter" key={step}>
              {renderCurrentStep()}
            </div>
            <EnvironmentActionBar
              busy={busy}
              canAdvance={step !== 1 || canContinueFromBasics}
              canSave={!hasBlockingDiagnostic}
              locale={locale}
              requestState={requestState}
              step={step}
              onBack={() =>
                setStep((current) => Math.max(1, current - 1) as WizardStep)
              }
              onNext={() =>
                setStep((current) => Math.min(4, current + 1) as WizardStep)
              }
              onProbe={runProbe}
              onSave={saveEnvironment}
            />
          </>
        }
        requestState={requestState}
        status={
          <EnvironmentStatusRail
            locale={locale}
            probe={probe}
            profile={profile}
            requestState={requestState}
          />
        }
        step={step}
      />
    </section>
  );
}

function WizardPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="wizard-panel">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function createEmptyProfile(): EnvironmentProfile {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      "00000000-0000-4000-8000-000000000000",
    name: "",
    comfy_root: "",
    python_executable: null,
    api: null,
    roots: {
      models: [],
      input: [],
      output: [],
      workflows: [],
      custom_nodes: []
    },
    last_validated_at: null
  };
}
