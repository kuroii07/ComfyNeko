import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  HardDrive,
  Info,
  LoaderCircle,
  Save
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { translate, type Locale } from "../../i18n/translate";
import {
  tauriEnvironmentApi,
  type EnvironmentApi,
  type EnvironmentPathDiscovery,
  type EnvironmentProfile,
  type EnvironmentRoots,
  type ProbeResult
} from "./environmentApi";
import {
  EnvironmentSettingsPage,
  type EnvironmentPageStatus
} from "./EnvironmentSettingsPage";
import type { EnvironmentSettingsTab } from "./EnvironmentSettingsTabs";
import { AccelerationSettings } from "./AccelerationSettings";
import { EnvironmentVariablesSettings } from "./EnvironmentVariablesSettings";
import { GeneralEnvironmentSettings } from "./GeneralEnvironmentSettings";
import { ModelPathSettings } from "./ModelPathSettings";
import {
  createEnvironmentSettingsDraft,
  parseEnvironmentVariableDraft,
  type ModelPathCategory
} from "./environmentSettingsDraft";
import type { RequestState, WizardStep } from "./environmentWizardTypes";
import {
  tauriPathActionApi,
  type PathActionApi
} from "./pathActionApi";

type RootKey = keyof EnvironmentRoots;
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
  onDirtyChange?(hasUnsavedChanges: boolean): void;
  onSaved?(
    profile: EnvironmentProfile
  ):
    | EnvironmentProfile
    | null
    | void
    | Promise<EnvironmentProfile | null | void>;
  pathApi?: PathActionApi;
  profileLibrary?: ReactNode;
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
  locale = "zh-CN",
  onDirtyChange,
  onSaved,
  pathApi = tauriPathActionApi,
  profileLibrary
}: EnvironmentWizardProps) {
  const [profile, setProfile] = useState<EnvironmentProfile>(
    () => initialProfile ?? createEmptyProfile()
  );
  const [probe, setProbe] = useState<ProbeResult | null>(initialProbe ?? null);
  const [activeSettingsTab, setActiveSettingsTab] =
    useState<EnvironmentSettingsTab>("general");
  const [settingsDraft, setSettingsDraft] = useState(
    createEnvironmentSettingsDraft
  );
  const [hasProfileChanges, setHasProfileChanges] = useState(false);
  const [hasSessionDraftChanges, setHasSessionDraftChanges] = useState(false);
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
  const hasInvalidSessionDraft =
    parseEnvironmentVariableDraft(settingsDraft.variables).errors.length > 0;
  const busy = requestState === "probing" || requestState === "saving";
  const hasUnsavedChanges = hasProfileChanges || hasSessionDraftChanges;
  const pageStatus = getPageStatus(
    profile,
    probe,
    requestState,
    hasSessionDraftChanges,
    hasInvalidSessionDraft
  );

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  function updateProfile(patch: Partial<EnvironmentProfile>) {
    setProfile((current) => ({
      ...current,
      ...patch,
      last_validated_at: null
    }));
    setHasProfileChanges(true);
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
      last_validated_at: null,
      roots: { ...current.roots, [rootKey]: values }
    }));
    setHasProfileChanges(true);
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
          last_validated_at: null,
          python_executable:
            !manuallyEditedPaths.current.has("python_executable") &&
            discovery.python_executable
              ? discovery.python_executable
              : current.python_executable,
          roots
        };
      });
      setHasProfileChanges(true);
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
      const persistedProfile = await onSaved?.(profile);
      if (persistedProfile) {
        setProfile(persistedProfile);
      }
      setHasProfileChanges(false);
    } catch (error) {
      setRequestError(String(error));
      setRequestState("error");
    }
  }

  return (
    <EnvironmentSettingsPage
      actions={
        <>
          <button
            className="button-secondary"
            disabled={busy}
            type="button"
            onClick={() => void runProbe()}
          >
            {requestState === "probing" ? (
              <LoaderCircle aria-hidden="true" className="spin" />
            ) : (
              <CheckCircle2 aria-hidden="true" />
            )}
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
            ) : (
              <Save aria-hidden="true" />
            )}
            {translate(
              locale,
              requestState === "saving" ? "environment.saving" : "environment.save"
            )}
          </button>
        </>
      }
      activeTab={activeSettingsTab}
      locale={locale}
      onTabChange={setActiveSettingsTab}
      profile={profile}
      status={pageStatus}
    >
      {requestState === "saved" && hasSessionDraftChanges ? (
        <div className="environment-feedback environment-feedback--success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <span>{translate(locale, "environment.savedWithSessionDraft")}</span>
        </div>
      ) : null}

      {profileLibrary}

      {activeSettingsTab === "general" ? (
        <GeneralEnvironmentSettings locale={locale}>
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
        <DiagnosticResults
          hasSessionDraftChanges={hasSessionDraftChanges}
          locale={locale}
          probe={probe}
          requestError={requestError}
          requestState={requestState}
        />
      </SettingsBlock>
        </GeneralEnvironmentSettings>
      ) : null}

      {activeSettingsTab === "acceleration" ? (
        <AccelerationSettings
          acceleration={settingsDraft.acceleration}
          locale={locale}
          onChange={(acceleration) => {
            setSettingsDraft((current) => ({ ...current, acceleration }));
            setHasSessionDraftChanges(true);
          }}
        />
      ) : null}

      {activeSettingsTab === "model-paths" ? (
        <ModelPathSettings
          categories={settingsDraft.modelPaths.categories}
          locale={locale}
          onCategoryChange={(category: ModelPathCategory, path: string) => {
            setSettingsDraft((current) => ({
              ...current,
              modelPaths: {
                ...current.modelPaths,
                categories: { ...current.modelPaths.categories, [category]: path }
              }
            }));
            setHasSessionDraftChanges(true);
          }}
        >
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
        </ModelPathSettings>
      ) : null}

      {activeSettingsTab === "variables" ? (
        <EnvironmentVariablesSettings
          locale={locale}
          value={settingsDraft.variables}
          onChange={(variables) => {
            setSettingsDraft((current) => ({ ...current, variables }));
            setHasSessionDraftChanges(true);
          }}
        />
      ) : null}
    </EnvironmentSettingsPage>
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
  hasSessionDraftChanges,
  locale,
  probe,
  requestError,
  requestState
}: {
  hasSessionDraftChanges: boolean;
  locale: Locale;
  probe: ProbeResult | null;
  requestError: string;
  requestState: RequestState;
}) {
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

  if (!probe) {
    return (
      <div className="environment-feedback">
        <Info aria-hidden="true" />
        <span>{translate(locale, "environment.diagnostics.pending")}</span>
      </div>
    );
  }

  if (requestState === "saved") {
    if (hasSessionDraftChanges) {
      return null;
    }

    return (
      <div className="environment-feedback environment-feedback--success" role="status">
        <CheckCircle2 aria-hidden="true" />
        <span>{translate(locale, "environment.saved")}</span>
      </div>
    );
  }

  if (probe.diagnostics.length === 0) {
    return (
      <div
        className="environment-feedback environment-feedback--success"
        role="status"
      >
        <CheckCircle2 aria-hidden="true" />
        <span>{translate(locale, "environment.diagnostics.clear")}</span>
      </div>
    );
  }

  return (
    <ul className="diagnostic-list">
      {probe.diagnostics.map((diagnostic) => (
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

function getPageStatus(
  profile: EnvironmentProfile,
  probe: ProbeResult | null,
  requestState: RequestState,
  hasSessionDraftChanges: boolean,
  hasInvalidSessionDraft: boolean
): EnvironmentPageStatus {
  if (requestState === "probing" || requestState === "saving") {
    return requestState;
  }

  if (requestState === "error") {
    return "error";
  }

  if (probe?.diagnostics.some((diagnostic) => diagnostic.severity === "blocking")) {
    return "blocked";
  }

  if (hasInvalidSessionDraft) {
    return "draft-error";
  }

  if (hasSessionDraftChanges) {
    return "session-draft";
  }

  if (requestState === "saved") {
    return "saved";
  }

  if (probe) {
    return "ready";
  }

  return profile.last_validated_at ? "saved" : "pending";
}
