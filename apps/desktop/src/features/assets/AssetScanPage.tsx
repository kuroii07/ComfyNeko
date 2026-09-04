import {
  AlertTriangle,
  CheckCircle2,
  FolderSearch,
  LoaderCircle,
  Pause,
  Play,
  RefreshCw,
  Square
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { translate, type Locale, type MessageKey } from "../../i18n/translate";
import {
  tauriEnvironmentApi,
  type EnvironmentApi,
  type EnvironmentProfile
} from "../environments/environmentApi";
import {
  tauriAssetScanApi,
  type AssetScanApi,
  type AssetScanIssue,
  type AssetScanStatus,
  type AssetScanTask
} from "./assetScanApi";

type AssetScanPageProps = {
  environmentApi?: EnvironmentApi;
  locale?: Locale;
  onOpenEnvironments?(): void;
  scanApi?: AssetScanApi;
};

type LoadState = "loading" | "ready" | "error";
type ActionKind = "start" | "cancel" | "resume" | null;
type RequestScope = "environments" | "tasks" | "poll" | "issues" | ActionKind;

type RequestError = {
  detail: string;
  scope: Exclude<RequestScope, null>;
};

const POLL_INTERVAL_MS = 800;

export function AssetScanPage({
  environmentApi = tauriEnvironmentApi,
  locale = "zh-CN",
  onOpenEnvironments,
  scanApi = tauriAssetScanApi
}: AssetScanPageProps) {
  const [environments, setEnvironments] = useState<EnvironmentProfile[]>([]);
  const [environmentLoadState, setEnvironmentLoadState] =
    useState<LoadState>("loading");
  const [environmentLoadRevision, setEnvironmentLoadRevision] = useState(0);
  const [taskLoadRevision, setTaskLoadRevision] = useState(0);
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState("");
  const [task, setTask] = useState<AssetScanTask | null>(null);
  const [issues, setIssues] = useState<AssetScanIssue[]>([]);
  const [actionKind, setActionKind] = useState<ActionKind>(null);
  const [requestError, setRequestError] = useState<RequestError | null>(null);
  const selectionGenerationRef = useRef(0);
  const pollGenerationRef = useRef(0);

  useEffect(() => {
    let active = true;
    setEnvironmentLoadState("loading");
    setRequestError((current) =>
      current?.scope === "environments" ? null : current
    );

    void environmentApi
      .listEnvironments()
      .then((profiles) => {
        if (!active) {
          return;
        }
        setEnvironments(profiles);
        setSelectedEnvironmentId("");
        setTask(null);
        setIssues([]);
        setEnvironmentLoadState("ready");
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setEnvironmentLoadState("error");
        setRequestError({
          detail: toErrorMessage(error),
          scope: "environments"
        });
      });

    return () => {
      active = false;
    };
  }, [environmentApi, environmentLoadRevision]);

  useEffect(() => {
    const generation = ++selectionGenerationRef.current;
    pollGenerationRef.current += 1;
    setTask(null);
    setIssues([]);
    setRequestError((current) =>
      current?.scope === "tasks" ||
      current?.scope === "poll" ||
      current?.scope === "issues"
        ? null
        : current
    );

    if (!selectedEnvironmentId) {
      return;
    }

    void scanApi
      .list(selectedEnvironmentId)
      .then((tasks) => {
        if (generation !== selectionGenerationRef.current) {
          return;
        }
        setTask(tasks[0] ?? null);
      })
      .catch((error) => {
        if (generation !== selectionGenerationRef.current) {
          return;
        }
        setRequestError({
          detail: toErrorMessage(error),
          scope: "tasks"
        });
      });

    return () => {
      if (generation === selectionGenerationRef.current) {
        selectionGenerationRef.current += 1;
      }
    };
  }, [scanApi, selectedEnvironmentId, taskLoadRevision]);

  const shouldPoll = task ? isPollingStatus(task.status) : false;

  useEffect(() => {
    if (!task || !shouldPoll) {
      return;
    }

    const taskId = task.id;
    const generation = ++pollGenerationRef.current;
    let timeoutId: number | undefined;

    const poll = async () => {
      try {
        const nextTask = await scanApi.get(taskId);
        if (generation !== pollGenerationRef.current) {
          return;
        }
        setRequestError((current) =>
          current?.scope === "poll" ? null : current
        );
        setTask(nextTask);
        if (isPollingStatus(nextTask.status)) {
          timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (generation !== pollGenerationRef.current) {
          return;
        }
        setRequestError({
          detail: toErrorMessage(error),
          scope: "poll"
        });
      }
    };

    timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      pollGenerationRef.current += 1;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [scanApi, shouldPoll, task?.id]);

  useEffect(() => {
    let active = true;

    if (!task || task.issue_count === 0) {
      setIssues([]);
      return;
    }

    void scanApi
      .listIssues(task.id)
      .then((nextIssues) => {
        if (!active) {
          return;
        }
        setIssues(nextIssues);
        setRequestError((current) =>
          current?.scope === "issues" ? null : current
        );
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setRequestError({
          detail: toErrorMessage(error),
          scope: "issues"
        });
      });

    return () => {
      active = false;
    };
  }, [scanApi, task?.id, task?.issue_count]);

  async function runAction(
    kind: Exclude<ActionKind, null>,
    request: () => Promise<AssetScanTask>
  ) {
    if (actionKind) {
      return;
    }

    setActionKind(kind);
    setRequestError(null);
    try {
      const nextTask = await request();
      if (nextTask.environment_id === selectedEnvironmentId) {
        setTask(nextTask);
      }
    } catch (error) {
      setRequestError({
        detail: toErrorMessage(error),
        scope: kind
      });
    } finally {
      setActionKind(null);
    }
  }

  function retryRequest() {
    if (!requestError) {
      return;
    }

    const { scope } = requestError;
    setRequestError(null);

    if (scope === "environments") {
      setEnvironmentLoadRevision((current) => current + 1);
      return;
    }
    if (scope === "tasks" || scope === "poll" || scope === "issues") {
      setTaskLoadRevision((current) => current + 1);
      return;
    }
    if (scope === "start" && selectedEnvironmentId) {
      void runAction("start", () => scanApi.start(selectedEnvironmentId));
      return;
    }
    if (scope === "cancel" && task) {
      void runAction("cancel", () => scanApi.cancel(task.id));
      return;
    }
    if (scope === "resume" && task) {
      void runAction("resume", () => scanApi.resume(task.id));
    }
  }

  if (environmentLoadState === "loading") {
    return (
      <section className="asset-scan-page">
        <AssetScanHeader locale={locale} task={null} />
        <div
          aria-live="polite"
          className="asset-scan__message"
          role="status"
        >
          <LoaderCircle aria-hidden="true" className="spin" />
          <div>
            <strong>{translate(locale, "assets.environment.loading")}</strong>
            <p>{translate(locale, "assets.environment.loadingHelp")}</p>
          </div>
        </div>
      </section>
    );
  }

  if (environmentLoadState === "error") {
    return (
      <section className="asset-scan-page">
        <AssetScanHeader locale={locale} task={null} />
        <RequestErrorMessage
          error={requestError}
          locale={locale}
          onRetry={retryRequest}
        />
      </section>
    );
  }

  if (environments.length === 0) {
    return (
      <section className="asset-scan-page">
        <AssetScanHeader locale={locale} task={null} />
        <div className="asset-scan__message asset-scan__message--empty">
          <FolderSearch aria-hidden="true" />
          <div>
            <strong>{translate(locale, "assets.environment.emptyTitle")}</strong>
            <p>{translate(locale, "assets.environment.emptyDescription")}</p>
          </div>
          <button
            className="button-compact"
            type="button"
            onClick={onOpenEnvironments}
          >
            {translate(locale, "assets.environment.open")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="asset-scan-page">
      <AssetScanHeader locale={locale} task={task} />

      <div className="asset-scan__controls">
        <label className="asset-scan__environment-field">
          <span>{translate(locale, "assets.environment.label")}</span>
          <select
            aria-label={translate(locale, "assets.environment.label")}
            disabled={actionKind !== null}
            required
            value={selectedEnvironmentId}
            onChange={(event) => setSelectedEnvironmentId(event.target.value)}
          >
            <option disabled value="">
              {translate(locale, "assets.environment.placeholder")}
            </option>
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
          <small>{translate(locale, "assets.environment.help")}</small>
        </label>

        <div className="asset-scan__actions">
          <TaskAction
            actionKind={actionKind}
            locale={locale}
            selectedEnvironmentId={selectedEnvironmentId}
            task={task}
            onCancel={() => {
              if (task) {
                void runAction("cancel", () => scanApi.cancel(task.id));
              }
            }}
            onResume={() => {
              if (task) {
                void runAction("resume", () => scanApi.resume(task.id));
              }
            }}
            onStart={() =>
              void runAction("start", () =>
                scanApi.start(selectedEnvironmentId)
              )
            }
          />
        </div>
      </div>

      {requestError ? (
        <RequestErrorMessage
          error={requestError}
          locale={locale}
          onRetry={retryRequest}
        />
      ) : null}

      <div aria-live="polite" className="asset-scan__status-region">
        {!selectedEnvironmentId ? (
          <div className="asset-scan__message asset-scan__message--idle">
            <FolderSearch aria-hidden="true" />
            <div>
              <strong>{translate(locale, "assets.status.chooseEnvironment")}</strong>
              <p>{translate(locale, "assets.status.chooseEnvironmentHelp")}</p>
            </div>
          </div>
        ) : task ? (
          <TaskDetails locale={locale} task={task} />
        ) : (
          <div className="asset-scan__message asset-scan__message--idle">
            <FolderSearch aria-hidden="true" />
            <div>
              <strong>{translate(locale, "assets.status.noTask")}</strong>
              <p>{translate(locale, "assets.status.noTaskHelp")}</p>
            </div>
          </div>
        )}
      </div>

      {issues.length > 0 ? (
        <section
          aria-labelledby="asset-scan-issues-title"
          className="asset-scan__issues"
        >
          <div className="asset-scan__section-heading">
            <AlertTriangle aria-hidden="true" />
            <div>
              <h2 id="asset-scan-issues-title">
                {translate(locale, "assets.issues.title")}
              </h2>
              <p>
                {translate(locale, "assets.issues.description").replace(
                  "{count}",
                  String(task?.issue_count ?? issues.length)
                )}
              </p>
            </div>
          </div>
          <ul>
            {issues.map((issue) => (
              <li key={issue.id}>
                <strong>{issue.message}</strong>
                <span title={issue.path}>{issue.path}</span>
                <small>{issue.code}</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function AssetScanHeader({
  locale,
  task
}: {
  locale: Locale;
  task: AssetScanTask | null;
}) {
  const status = task?.status ?? "idle";
  const statusKey = `assets.status.${status}` as MessageKey;

  return (
    <header className="asset-scan__header">
      <div className="asset-scan__heading">
        <h1>{translate(locale, "assets.title")}</h1>
        <p>{translate(locale, "assets.description")}</p>
      </div>
      <span className="asset-scan__status" data-status={status}>
        <span aria-hidden="true" />
        {translate(locale, statusKey)}
      </span>
    </header>
  );
}

function TaskAction({
  actionKind,
  locale,
  onCancel,
  onResume,
  onStart,
  selectedEnvironmentId,
  task
}: {
  actionKind: ActionKind;
  locale: Locale;
  onCancel(): void;
  onResume(): void;
  onStart(): void;
  selectedEnvironmentId: string;
  task: AssetScanTask | null;
}) {
  if (task?.can_cancel) {
    const stopping = actionKind === "cancel" || task.status === "cancelling";
    return (
      <button
        className="button-compact button-secondary"
        disabled={stopping}
        type="button"
        onClick={onCancel}
      >
        {stopping ? (
          <LoaderCircle aria-hidden="true" className="spin" />
        ) : (
          <Square aria-hidden="true" />
        )}
        {translate(
          locale,
          stopping ? "assets.action.cancelling" : "assets.action.cancel"
        )}
      </button>
    );
  }

  if (task?.can_resume) {
    const resuming = actionKind === "resume";
    return (
      <button
        className="button-compact"
        disabled={resuming}
        type="button"
        onClick={onResume}
      >
        {resuming ? (
          <LoaderCircle aria-hidden="true" className="spin" />
        ) : (
          <RefreshCw aria-hidden="true" />
        )}
        {translate(
          locale,
          resuming ? "assets.action.resuming" : "assets.action.resume"
        )}
      </button>
    );
  }

  const starting = actionKind === "start";
  return (
    <button
      className="button-compact"
      disabled={!selectedEnvironmentId || starting}
      type="button"
      onClick={onStart}
    >
      {starting ? (
        <LoaderCircle aria-hidden="true" className="spin" />
      ) : (
        <Play aria-hidden="true" />
      )}
      {translate(
        locale,
        starting ? "assets.action.starting" : "assets.action.start"
      )}
    </button>
  );
}

function TaskDetails({
  locale,
  task
}: {
  locale: Locale;
  task: AssetScanTask;
}) {
  const isActive = isPollingStatus(task.status);
  const isComplete =
    task.status === "completed" || task.status === "completed_with_issues";
  const StatusIcon =
    task.status === "completed"
      ? CheckCircle2
      : task.status === "paused" || task.status === "interrupted"
        ? Pause
        : task.status === "failed" || task.status === "completed_with_issues"
          ? AlertTriangle
          : LoaderCircle;
  const statusKey = `assets.status.${task.status}` as MessageKey;

  return (
    <section className="asset-scan__task" data-status={task.status}>
      <div className="asset-scan__task-heading">
        <StatusIcon
          aria-hidden="true"
          className={isActive ? "spin" : undefined}
        />
        <div>
          <h2>{translate(locale, statusKey)}</h2>
          <p>{taskStatusDescription(locale, task.status)}</p>
        </div>
      </div>

      {isActive ? (
        <div
          aria-label={translate(locale, "assets.progress.aria")}
          className="asset-scan__activity"
          role="progressbar"
        >
          <span />
        </div>
      ) : null}

      <dl className="asset-scan__metrics">
        <Metric
          label={translate(locale, "assets.progress.processed")}
          value={task.processed_directories}
        />
        <Metric
          label={translate(locale, "assets.progress.pending")}
          value={task.pending_directories}
        />
        <Metric
          label={translate(locale, "assets.progress.discovered")}
          value={task.discovered_assets}
        />
      </dl>

      {task.current_path ? (
        <div className="asset-scan__current-path">
          <span>{translate(locale, "assets.progress.currentPath")}</span>
          <code title={task.current_path}>{task.current_path}</code>
        </div>
      ) : null}

      {isComplete ? (
        <div className="asset-scan__results">
          <span>
            {translate(locale, "assets.result.inserted")} {task.inserted_count}
          </span>
          <span>
            {translate(locale, "assets.result.updated")} {task.updated_count}
          </span>
          <span>
            {translate(locale, "assets.result.unchanged")}{" "}
            {task.unchanged_count}
          </span>
          <span>
            {translate(locale, "assets.result.invalidated")}{" "}
            {task.invalidated_count}
          </span>
        </div>
      ) : null}

      {task.status === "completed_with_issues" ? (
        <p className="asset-scan__warning">
          <AlertTriangle aria-hidden="true" />
          {translate(locale, "assets.issues.missingSkipped")}
        </p>
      ) : null}

      {task.error ? (
        <p className="asset-scan__task-error" role="alert">
          <AlertTriangle aria-hidden="true" />
          <span>
            <strong>{task.error.message}</strong>
            <small>{task.error.code}</small>
          </span>
        </p>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function RequestErrorMessage({
  error,
  locale,
  onRetry
}: {
  error: RequestError | null;
  locale: Locale;
  onRetry(): void;
}) {
  return (
    <div className="asset-scan__request-error" role="alert">
      <AlertTriangle aria-hidden="true" />
      <div>
        <strong>
          {translate(
            locale,
            error?.scope === "environments"
              ? "assets.environment.error"
              : "assets.request.error"
          )}
        </strong>
        {error?.detail ? <small title={error.detail}>{error.detail}</small> : null}
      </div>
      <button
        className="button-compact button-secondary"
        type="button"
        onClick={onRetry}
      >
        <RefreshCw aria-hidden="true" />
        {translate(locale, "assets.action.retry")}
      </button>
    </div>
  );
}

function isPollingStatus(status: AssetScanStatus): boolean {
  return status === "queued" || status === "running" || status === "cancelling";
}

function taskStatusDescription(
  locale: Locale,
  status: AssetScanStatus
): string {
  return translate(locale, `assets.statusDescription.${status}` as MessageKey);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error);
}
