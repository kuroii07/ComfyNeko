import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  HardDrive,
  Info,
  LoaderCircle
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { translate, type Locale } from "../../i18n/translate";
import {
  tauriEnvironmentApi,
  type EnvironmentApi,
  type EnvironmentPathDiscovery,
  type EnvironmentProfile,
  type EnvironmentRoots,
  type ProbeDiagnostic,
  type ProbeResult
} from "./environmentApi";
import type { RequestState, WizardStep } from "./environmentWizardTypes";
import {
  tauriPathActionApi,
  type PathActionApi
} from "./pathActionApi";

type RootKey = keyof EnvironmentRoots;
type EnvironmentSettingsTab =
  | "general"
  | "acceleration"
  | "model-paths"
  | "variables";
type EditablePathKey = "python_executable" | RootKey;
type DiscoveryState =
  | { status: "idle"; count: 0 }
  | { status: "loading"; count: 0 }
  | { status: "success"; count: number }
  | { status: "empty"; count: 0 }
  | { status: "error"; count: 0 };
type PathActionError = {
  actionKey: string;
  message: string;
};

type EnvironmentWizardProps = {
  api?: EnvironmentApi;
  initialProbe?: ProbeResult;
  initialProfile?: EnvironmentProfile;
  initialStep?: WizardStep;
  locale?: Locale;
  onSaved?(profile: EnvironmentProfile): void | Promise<void>;
  pathApi?: PathActionApi;
};

const rootFields: RootKey[] = [
  "models",
  "input",
  "output",
  "workflows",
  "custom_nodes"
];

const settingsTabs = [
  { id: "general", labelKey: "environment.tabs.general" },
  { id: "acceleration", labelKey: "environment.tabs.acceleration" },
  { id: "model-paths", labelKey: "environment.tabs.modelPaths" },
  { id: "variables", labelKey: "environment.tabs.variables" }
] as const;

export function EnvironmentWizard({
  api = tauriEnvironmentApi,
  initialProbe,
  initialProfile,
  locale = "zh-CN",
  onSaved,
  pathApi = tauriPathActionApi
}: EnvironmentWizardProps) {
  const [profile, setProfile] = useState<EnvironmentProfile>(
    () => initialProfile ?? createEmptyProfile()
  );
  const [probe, setProbe] = useState<ProbeResult | null>(initialProbe ?? null);
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<EnvironmentSettingsTab>("general");
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [requestError, setRequestError] = useState("");
  const [discoveryState, setDiscoveryState] = useState<DiscoveryState>({
    status: "idle",
    count: 0
  });
  const [activePathAction, setActivePathAction] = useState<string | null>(null);
  const [pathActionError, setPathActionError] =
    useState<PathActionError | null>(null);
  const manuallyEditedPaths = useRef<Set<EditablePathKey>>(
    new Set([
      ...(initialProfile?.python_executable ? ["python_executable" as const] : []),
      ...rootFields.filter((rootKey) => initialProfile?.roots[rootKey].length)
    ])
  );
  const discoveryRequestId = useRef(0);
  const activePathActionRef = useRef<string | null>(null);

  const hasBlockingDiagnostic =
    probe?.diagnostics.some((diagnostic) => diagnostic.severity === "blocking") ?? true;
  const busy = requestState === "probing" || requestState === "saving";

  function updateProfile(patch: Partial<EnvironmentProfile>) {
    setProfile((current) => ({ ...current, ...patch }));
    setProbe(null);
    setRequestState("idle");
  }

  function updateRoot(rootKey: RootKey, value: string) {
    manuallyEditedPaths.current.add(rootKey);
    const values = value
      .split(/[;\r\n]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    setProfile((current) => ({
      ...current,
      roots: { ...current.roots, [rootKey]: values }
    }));
    setProbe(null);
    setRequestState("idle");
  }

  async function discoverPaths(rootOverride?: string) {
    const comfyRoot = (rootOverride ?? profile.comfy_root).trim();
    if (!comfyRoot) {
      setDiscoveryState({ status: "idle", count: 0 });
      return;
    }

    const requestId = ++discoveryRequestId.current;
    setDiscoveryState({ status: "loading", count: 0 });

    try {
      const discovery = await api.discoverEnvironmentPaths(comfyRoot);
      if (requestId !== discoveryRequestId.current) {
        return;
      }

      setProfile((current) => {
        if (current.comfy_root.trim() !== comfyRoot) {
          return current;
        }

        const roots = { ...current.roots };
        for (const rootKey of rootFields) {
          if (
            !manuallyEditedPaths.current.has(rootKey) &&
            discovery.roots[rootKey].length > 0
          ) {
            roots[rootKey] = discovery.roots[rootKey];
          }
        }

        return {
          ...current,
          python_executable:
            !manuallyEditedPaths.current.has("python_executable") &&
            discovery.python_executable
              ? discovery.python_executable
              : current.python_executable,
          roots
        };
      });
      setProbe(null);
      setRequestState("idle");

      const count = countDiscoveredPaths(discovery);
      setDiscoveryState(
        count > 0 ? { status: "success", count } : { status: "empty", count: 0 }
      );
    } catch {
      if (requestId === discoveryRequestId.current) {
        setDiscoveryState({ status: "error", count: 0 });
      }
    }
  }

  async function runPathAction(
    actionId: string,
    operation: () => Promise<void>
  ) {
    if (activePathActionRef.current) {
      return;
    }

    activePathActionRef.current = actionId;
    setActivePathAction(actionId);
    setPathActionError(null);
    await waitForNextPaint();

    try {
      await operation();
    } catch (error) {
      setPathActionError({
        actionKey: actionId.slice(0, actionId.lastIndexOf(":")),
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      activePathActionRef.current = null;
      setActivePathAction(null);
    }
  }

  async function selectComfyRoot() {
    await runPathAction("comfy_root:select", async () => {
      const selected = await pathApi.selectDirectory(profile.comfy_root);
      if (!selected) {
        return;
      }

      discoveryRequestId.current += 1;
      setDiscoveryState({ status: "idle", count: 0 });
      updateProfile({ comfy_root: selected });
      void discoverPaths(selected);
    });
  }

  async function selectPythonExecutable() {
    await runPathAction("python_executable:select", async () => {
      const selected = await pathApi.selectPythonExecutable(
        profile.python_executable ?? undefined
      );
      if (!selected) {
        return;
      }

      manuallyEditedPaths.current.add("python_executable");
      updateProfile({ python_executable: selected });
    });
  }

  async function selectRoot(rootKey: RootKey) {
    await runPathAction(`${rootKey}:select`, async () => {
      const selected = await pathApi.selectDirectory(
        profile.roots[rootKey][0] ?? profile.comfy_root
      );
      if (selected) {
        updateRoot(rootKey, selected);
      }
    });
  }

  async function openConfiguredPath(actionKey: string, path: string) {
    await runPathAction(`${actionKey}:open`, async () => {
      await pathApi.openPath(path);
    });
  }

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

  return (
    <section
      aria-label={translate(locale, "environment.title")}
      className="environment-wizard"
    >
      <EnvironmentSettingsTabs
        activeTab={activeSettingsTab}
        locale={locale}
        onTabChange={setActiveSettingsTab}
      />
      {activeSettingsTab === "general" ? (
        <div
          aria-labelledby="environment-settings-tab-general"
          id="environment-settings-panel-general"
          role="tabpanel"
        >
        <SettingsBlock title={translate(locale, "environment.section.basics")}>
        <SettingsField
          description={translate(locale, "environment.nameHelp")}
          label={translate(locale, "environment.name")}
        >
          <input
            aria-label={translate(locale, "environment.name")}
            placeholder={translate(locale, "environment.placeholder.name")}
            required
            value={profile.name}
            onChange={(event) => updateProfile({ name: event.target.value })}
          />
        </SettingsField>
        <SettingsField
          description={translate(locale, "environment.comfyRootHelp")}
          label={translate(locale, "environment.comfyRoot")}
        >
          <PathControl
            actionKey="comfy_root"
            activeAction={activePathAction}
            footer={<DiscoveryMessage locale={locale} state={discoveryState} />}
            label={translate(locale, "environment.comfyRoot")}
            locale={locale}
            error={
              pathActionError?.actionKey === "comfy_root"
                ? pathActionError.message
                : null
            }
            openDisabled={!profile.comfy_root.trim()}
            onOpen={() =>
              void openConfiguredPath("comfy_root", profile.comfy_root.trim())
            }
            onSelect={() => void selectComfyRoot()}
          >
            <input
              aria-label={translate(locale, "environment.comfyRoot")}
              placeholder={translate(locale, "environment.placeholder.comfyRoot")}
              required
              value={profile.comfy_root}
              onBlur={() => void discoverPaths()}
              onChange={(event) => {
                discoveryRequestId.current += 1;
                setDiscoveryState({ status: "idle", count: 0 });
                updateProfile({ comfy_root: event.target.value });
              }}
            />
          </PathControl>
        </SettingsField>
      </SettingsBlock>

      <SettingsBlock title={translate(locale, "environment.section.runtime")}>
        <SettingsField
          description={translate(locale, "environment.pythonHelp")}
          label={translate(locale, "environment.python")}
        >
          <PathControl
            actionKey="python_executable"
            activeAction={activePathAction}
            label={translate(locale, "environment.python")}
            locale={locale}
            error={
              pathActionError?.actionKey === "python_executable"
                ? pathActionError.message
                : null
            }
            openDisabled={!profile.python_executable}
            onOpen={() =>
              void openConfiguredPath(
                "python_executable",
                profile.python_executable ?? ""
              )
            }
            onSelect={() => void selectPythonExecutable()}
          >
            <input
              aria-label={translate(locale, "environment.python")}
              placeholder={translate(locale, "environment.placeholder.python")}
              value={profile.python_executable ?? ""}
              onChange={(event) => {
                manuallyEditedPaths.current.add("python_executable");
                updateProfile({ python_executable: event.target.value || null });
              }}
            />
          </PathControl>
        </SettingsField>
        <SettingsField
          description={translate(locale, "environment.apiHelp")}
          label={translate(locale, "environment.apiPort")}
        >
          <input
            aria-label={translate(locale, "environment.apiPort")}
            inputMode="numeric"
            max="65535"
            min="1"
            placeholder={translate(locale, "environment.placeholder.apiPort")}
            type="number"
            value={profile.api?.port ?? ""}
            onChange={(event) => {
              const port = Number(event.target.value);
              updateProfile({
                api:
                  Number.isInteger(port) && port > 0 && port <= 65535
                    ? { host: "127.0.0.1", port }
                    : null
              });
            }}
          />
        </SettingsField>
      </SettingsBlock>

      <SettingsBlock title={translate(locale, "environment.section.actions")}>
        <div className="settings-row settings-row--diagnostics">
          <div className="settings-row__main">
            <strong>{translate(locale, "environment.diagnostics.title")}</strong>
            <small>
              {probe
                ? translate(locale, "environment.diagnostics.complete")
                : translate(locale, "environment.diagnostics.pending")}
            </small>
          </div>
          <div className="environment-actions">
            <button
              className="button-secondary"
              disabled={busy}
              type="button"
              onClick={() => void runProbe()}
            >
              {requestState === "probing" ? (
                <LoaderCircle aria-hidden="true" className="spin" />
              ) : null}
              {translate(
                locale,
                requestState === "probing" ? "environment.probing" : "environment.probe"
              )}
            </button>
            <button
              disabled={busy || hasBlockingDiagnostic}
              type="button"
              onClick={() => void saveEnvironment()}
            >
              {requestState === "saving" ? (
                <LoaderCircle aria-hidden="true" className="spin" />
              ) : null}
              {translate(
                locale,
                requestState === "saving" ? "environment.saving" : "environment.save"
              )}
            </button>
          </div>
        </div>

        <DiagnosticResults
          diagnostics={probe?.diagnostics ?? []}
          locale={locale}
          requestError={requestError}
          requestState={requestState}
        />
      </SettingsBlock>
        </div>
      ) : null}

      {activeSettingsTab === "acceleration" ? (
        <RuntimeAccelerationPanel locale={locale} probe={probe} />
      ) : null}

      {activeSettingsTab === "model-paths" ? (
        <div
          aria-labelledby="environment-settings-tab-model-paths"
          id="environment-settings-panel-model-paths"
          role="tabpanel"
        >
      <EnvironmentTabIntro
        description={translate(locale, "environment.modelPaths.description")}
        title={translate(locale, "environment.modelPaths.title")}
      />
      <SettingsBlock title={translate(locale, "environment.section.assets")}>
        {rootFields.map((rootKey) => (
          <SettingsField
            description={translate(locale, `environment.rootHelp.${rootKey}`)}
            key={rootKey}
            label={translate(locale, `environment.root.${rootKey}`)}
          >
            <PathControl
              actionKey={rootKey}
              activeAction={activePathAction}
              label={translate(locale, `environment.root.${rootKey}`)}
              locale={locale}
              error={
                pathActionError?.actionKey === rootKey
                  ? pathActionError.message
                  : null
              }
              openDisabled={profile.roots[rootKey].length === 0}
              onOpen={() =>
                void openConfiguredPath(
                  rootKey,
                  profile.roots[rootKey][0] ?? ""
                )
              }
              onSelect={() => void selectRoot(rootKey)}
            >
              <input
                aria-label={translate(locale, `environment.root.${rootKey}`)}
                value={profile.roots[rootKey].join("; ")}
                onChange={(event) => updateRoot(rootKey, event.target.value)}
              />
            </PathControl>
          </SettingsField>
        ))}
      </SettingsBlock>
        </div>
      ) : null}

      {activeSettingsTab === "variables" ? (
        <EnvironmentVariablesPanel locale={locale} />
      ) : null}
    </section>
  );
}

function EnvironmentSettingsTabs({
  activeTab,
  locale,
  onTabChange
}: {
  activeTab: EnvironmentSettingsTab;
  locale: Locale;
  onTabChange(tab: EnvironmentSettingsTab): void;
}) {
  function moveFocus(currentTab: EnvironmentSettingsTab, direction: 1 | -1) {
    const currentIndex = settingsTabs.findIndex((tab) => tab.id === currentTab);
    const nextIndex = (currentIndex + direction + settingsTabs.length) % settingsTabs.length;
    onTabChange(settingsTabs[nextIndex].id);
    requestAnimationFrame(() => {
      document.getElementById(`environment-settings-tab-${settingsTabs[nextIndex].id}`)?.focus();
    });
  }

  return (
    <div
      aria-label={translate(locale, "environment.title")}
      className="environment-settings-tabs"
      role="tablist"
    >
      {settingsTabs.map((tab) => (
        <button
          aria-controls={`environment-settings-panel-${tab.id}`}
          aria-selected={activeTab === tab.id}
          id={`environment-settings-tab-${tab.id}`}
          key={tab.id}
          role="tab"
          tabIndex={activeTab === tab.id ? 0 : -1}
          type="button"
          onClick={() => onTabChange(tab.id)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              moveFocus(tab.id, 1);
            }
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              moveFocus(tab.id, -1);
            }
          }}
        >
          {translate(locale, tab.labelKey)}
        </button>
      ))}
    </div>
  );
}

function EnvironmentTabIntro({
  description,
  title
}: {
  description: string;
  title: string;
}) {
  return (
    <header className="environment-tab-intro">
      <strong>{title}</strong>
      <p>{description}</p>
    </header>
  );
}

function RuntimeAccelerationPanel({
  locale,
  probe
}: {
  locale: Locale;
  probe: ProbeResult | null;
}) {
  const pending = translate(locale, "environment.acceleration.pending");

  return (
    <div
      aria-labelledby="environment-settings-tab-acceleration"
      id="environment-settings-panel-acceleration"
      role="tabpanel"
    >
      <EnvironmentTabIntro
        description={translate(locale, "environment.acceleration.description")}
        title={translate(locale, "environment.acceleration.title")}
      />
      <SettingsBlock title={translate(locale, "environment.acceleration.title")}>
        <ReadOnlySetting
          label={translate(locale, "environment.acceleration.python")}
          value={probe?.python?.version ?? pending}
        />
        <ReadOnlySetting
          label={translate(locale, "environment.acceleration.api")}
          value={probe?.api?.comfy_version ?? pending}
        />
      </SettingsBlock>
      <div className="environment-safety-notice" role="status">
        {translate(locale, "environment.acceleration.safety")}
      </div>
    </div>
  );
}

function EnvironmentVariablesPanel({ locale }: { locale: Locale }) {
  return (
    <div
      aria-labelledby="environment-settings-tab-variables"
      id="environment-settings-panel-variables"
      role="tabpanel"
    >
      <EnvironmentTabIntro
        description={translate(locale, "environment.variables.description")}
        title={translate(locale, "environment.variables.title")}
      />
      <article className="settings-group environment-variables-panel">
        <div className="settings-row environment-variables-panel__notice" role="status">
          <div className="settings-row__main">
            <strong>{translate(locale, "environment.variables.protected")}</strong>
            <small>{translate(locale, "environment.variables.help")}</small>
          </div>
        </div>
        <label className="environment-variables-panel__editor">
          <span>{translate(locale, "environment.variables.input")}</span>
          <textarea
            aria-label={translate(locale, "environment.variables.input")}
            disabled
            placeholder={translate(locale, "environment.variables.placeholder")}
            value=""
          />
        </label>
      </article>
    </div>
  );
}

function ReadOnlySetting({ label, value }: { label: string; value: string }) {
  return (
    <div className="settings-row">
      <div className="settings-row__main">
        <strong>{label}</strong>
      </div>
      <output className="settings-value settings-value--mono">{value}</output>
    </div>
  );
}

function SettingsBlock({ children, title }: { children: ReactNode; title: string }) {
  return (
    <>
      <div className="settings-section-label">{title}</div>
      <article className="settings-group">{children}</article>
    </>
  );
}

function SettingsField({
  children,
  description,
  label
}: {
  children: ReactNode;
  description: string;
  label: string;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__main">
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  );
}

function PathControl({
  actionKey,
  activeAction,
  children,
  error,
  footer,
  label,
  locale,
  onOpen,
  onSelect,
  openDisabled
}: {
  actionKey: string;
  activeAction: string | null;
  children: ReactNode;
  error?: string | null;
  footer?: ReactNode;
  label: string;
  locale: Locale;
  onOpen(): void;
  onSelect(): void;
  openDisabled: boolean;
}) {
  const selectActionId = `${actionKey}:select`;
  const openActionId = `${actionKey}:open`;
  const selectBusy = activeAction === selectActionId;
  const openBusy = activeAction === openActionId;
  const pathActionPending = activeAction !== null;

  return (
    <div className="path-control">
      <div className="path-control__row">
        {children}
        <div className="path-control__actions">
          <button
            aria-label={`${
              selectBusy
                ? translate(locale, "common.selecting")
                : translate(locale, "common.selectPath")
            } ${label}`}
            className="path-control__button"
            disabled={pathActionPending}
            type="button"
            onClick={onSelect}
          >
            {selectBusy ? (
              <LoaderCircle aria-hidden="true" className="spin" />
            ) : (
              <FolderOpen aria-hidden="true" />
            )}
            {translate(
              locale,
              selectBusy ? "common.selecting" : "common.selectPath"
            )}
          </button>
          <button
            aria-label={`${
              openBusy
                ? translate(locale, "common.opening")
                : translate(locale, "common.open")
            } ${label}`}
            className="path-control__button"
            disabled={openDisabled || pathActionPending}
            type="button"
            onClick={onOpen}
          >
            {openBusy ? (
              <LoaderCircle aria-hidden="true" className="spin" />
            ) : (
              <HardDrive aria-hidden="true" />
            )}
            {translate(locale, openBusy ? "common.opening" : "common.open")}
          </button>
        </div>
      </div>
      {error ? (
        <small className="path-control__error" role="alert">
          {translate(locale, "environment.requestFailed")}: {error}
        </small>
      ) : null}
      {footer}
    </div>
  );
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function DiscoveryMessage({
  locale,
  state
}: {
  locale: Locale;
  state: DiscoveryState;
}) {
  if (state.status === "idle") {
    return null;
  }

  let message = translate(locale, `environment.discovery.${state.status}`);
  if (state.status === "success") {
    message = message.replace("{count}", String(state.count));
  }

  return (
    <small aria-live="polite" className="environment-discovery-note" role="status">
      {state.status === "loading" ? (
        <LoaderCircle aria-hidden="true" className="spin" />
      ) : null}
      {message}
    </small>
  );
}

function DiagnosticResults({
  diagnostics,
  locale,
  requestError,
  requestState
}: {
  diagnostics: ProbeDiagnostic[];
  locale: Locale;
  requestError: string;
  requestState: RequestState;
}) {
  if (requestState === "saved") {
    return (
      <div className="environment-feedback environment-feedback--success" role="status">
        <CheckCircle2 aria-hidden="true" />
        <span>{translate(locale, "environment.saved")}</span>
      </div>
    );
  }

  if (requestState === "error") {
    return (
      <div className="environment-feedback environment-feedback--error" role="alert">
        <AlertCircle aria-hidden="true" />
        <span>
          {translate(locale, "environment.requestFailed")}: {requestError}
        </span>
      </div>
    );
  }

  if (diagnostics.length === 0) {
    return (
      <div className="environment-feedback">
        <Info aria-hidden="true" />
        <span>{translate(locale, "environment.diagnostics.pending")}</span>
      </div>
    );
  }

  return (
    <ul className="diagnostic-list">
      {diagnostics.map((diagnostic) => (
        <li data-severity={diagnostic.severity} key={`${diagnostic.code}-${diagnostic.message}`}>
          {diagnostic.severity === "blocking" ? (
            <AlertCircle aria-hidden="true" />
          ) : (
            <CheckCircle2 aria-hidden="true" />
          )}
          <span>
            <strong>{diagnostic.message}</strong>
            {diagnostic.evidence ? <small>{diagnostic.evidence}</small> : null}
          </span>
        </li>
      ))}
    </ul>
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

function countDiscoveredPaths(discovery: EnvironmentPathDiscovery): number {
  return (
    (discovery.python_executable ? 1 : 0) +
    rootFields.reduce(
      (count, rootKey) => count + discovery.roots[rootKey].length,
      0
    )
  );
}
