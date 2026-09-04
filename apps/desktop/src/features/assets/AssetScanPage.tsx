import {
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileImage,
  FileJson,
  Folder,
  FolderInput,
  FolderOutput,
  FolderSearch,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Square,
  Video
} from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState } from "react";

import { translate, type Locale, type MessageKey } from "../../i18n/translate";
import {
  tauriEnvironmentApi,
  type EnvironmentApi,
  type EnvironmentProfile
} from "../environments/environmentApi";
import {
  tauriAssetQueryApi,
  type AssetAvailability,
  type AssetKind,
  type AssetListItem,
  type AssetPage,
  type AssetQueryApi,
  type AssetRootKind,
  type AssetSort
} from "./assetQueryApi";
import { AssetThumbnail } from "./AssetThumbnail";
import {
  tauriAssetScanApi,
  type AssetScanApi,
  type AssetScanIssue,
  type AssetScanStatus,
  type AssetScanTask
} from "./assetScanApi";
import {
  tauriAssetThumbnailApi,
  type AssetThumbnailApi
} from "./assetThumbnailApi";

type AssetScanPageProps = {
  assetQueryApi?: AssetQueryApi;
  environmentApi?: EnvironmentApi;
  locale?: Locale;
  onOpenEnvironments?(): void;
  scanApi?: AssetScanApi;
  thumbnailApi?: AssetThumbnailApi;
};

type LoadState = "loading" | "ready" | "error";
type AssetLoadState = "idle" | "loading" | "ready" | "error";
type ActionKind = "start" | "cancel" | "resume" | null;
type RequestScope = "environments" | "tasks" | "poll" | "issues" | ActionKind;

type RequestError = {
  detail: string;
  scope: Exclude<RequestScope, null>;
};

const POLL_INTERVAL_MS = 800;
const ASSET_PAGE_SIZE = 50;

const kindFilters: Array<{ value: AssetKind | null; label: MessageKey }> = [
  { value: null, label: "assets.filter.all" },
  { value: "image", label: "assets.filter.images" },
  { value: "video", label: "assets.filter.videos" },
  { value: "audio", label: "assets.filter.audio" }
];

const rootFilters: Array<{
  icon: typeof Folder;
  value: AssetRootKind | null;
  label: MessageKey;
}> = [
  { icon: FolderSearch, value: null, label: "assets.category.all" },
  { icon: FolderInput, value: "input", label: "assets.category.input" },
  { icon: FolderOutput, value: "output", label: "assets.category.output" }
];

export function AssetScanPage({
  assetQueryApi = tauriAssetQueryApi,
  environmentApi = tauriEnvironmentApi,
  locale = "zh-CN",
  onOpenEnvironments,
  scanApi = tauriAssetScanApi,
  thumbnailApi = tauriAssetThumbnailApi
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
  const [assetPage, setAssetPage] = useState<AssetPage>(() =>
    createEmptyAssetPage()
  );
  const [assetLoadState, setAssetLoadState] =
    useState<AssetLoadState>("idle");
  const [assetRequestError, setAssetRequestError] = useState<string | null>(
    null
  );
  const [assetQueryRevision, setAssetQueryRevision] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<AssetKind | null>(null);
  const [rootFilter, setRootFilter] = useState<AssetRootKind | null>(null);
  const [availabilityFilter, setAvailabilityFilter] =
    useState<AssetAvailability | null>("present");
  const [assetSort, setAssetSort] = useState<AssetSort>("modified_desc");
  const [assetPageNumber, setAssetPageNumber] = useState(1);
  const [scanDetailsOpen, setScanDetailsOpen] = useState(false);
  const selectionGenerationRef = useRef(0);
  const pollGenerationRef = useRef(0);
  const deferredSearchQuery = useDeferredValue(searchQuery);

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
        } else {
          setAssetQueryRevision((current) => current + 1);
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

  useEffect(() => {
    setAssetPageNumber(1);
    setScanDetailsOpen(false);
  }, [selectedEnvironmentId]);

  useEffect(() => {
    let active = true;

    if (!selectedEnvironmentId) {
      setAssetPage(createEmptyAssetPage());
      setAssetLoadState("idle");
      setAssetRequestError(null);
      return;
    }

    setAssetLoadState("loading");
    setAssetRequestError(null);
    void assetQueryApi
      .query({
        environment_id: selectedEnvironmentId,
        kind: kindFilter,
        root_kind: rootFilter,
        directory: null,
        availability: availabilityFilter,
        search: deferredSearchQuery,
        media_only: true,
        sort: assetSort,
        page: assetPageNumber,
        page_size: ASSET_PAGE_SIZE
      })
      .then((nextPage) => {
        if (!active) {
          return;
        }
        setAssetPage(nextPage);
        setAssetLoadState("ready");
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setAssetLoadState("error");
        setAssetRequestError(toErrorMessage(error));
      });

    return () => {
      active = false;
    };
  }, [
    assetPageNumber,
    assetQueryApi,
    assetQueryRevision,
    availabilityFilter,
    assetSort,
    deferredSearchQuery,
    kindFilter,
    rootFilter,
    selectedEnvironmentId
  ]);

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
      <section
        aria-label={translate(locale, "assets.title")}
        className="asset-library-page"
      >
        <h1 className="visually-hidden">{translate(locale, "assets.title")}</h1>
        <div aria-live="polite" className="asset-library__notice" role="status">
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
      <section
        aria-label={translate(locale, "assets.title")}
        className="asset-library-page"
      >
        <h1 className="visually-hidden">{translate(locale, "assets.title")}</h1>
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
      <section
        aria-label={translate(locale, "assets.title")}
        className="asset-library-page"
      >
        <h1 className="visually-hidden">{translate(locale, "assets.title")}</h1>
        <div className="asset-library__notice">
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

  const status = task?.status ?? "idle";
  const statusKey = `assets.status.${status}` as MessageKey;
  const scanDetailsVisible =
    task !== null && (scanDetailsOpen || isPollingStatus(task.status));

  return (
    <section
      aria-label={translate(locale, "assets.title")}
      className="asset-library-page"
    >
      <h1 className="visually-hidden">{translate(locale, "assets.title")}</h1>

      <header
        aria-label={translate(locale, "assets.toolbar")}
        className="asset-library__toolbar"
        role="toolbar"
      >
        <label className="asset-library__search">
          <Search aria-hidden="true" />
          <input
            aria-label={translate(locale, "assets.search.label")}
            placeholder={translate(locale, "assets.search.placeholder")}
            type="search"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setAssetPageNumber(1);
            }}
          />
        </label>

        <div
          aria-label={translate(locale, "assets.scanControls")}
          className="asset-library__scan-controls"
          role="group"
        >
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
          {task ? (
            <button
              aria-expanded={scanDetailsVisible}
              aria-label={`${translate(locale, statusKey)}，${translate(
                locale,
                scanDetailsVisible
                  ? "assets.scanDetails.close"
                  : "assets.scanDetails.open"
              )}`}
              className="asset-library__scan-status"
              data-status={status}
              type="button"
              onClick={() => setScanDetailsOpen((current) => !current)}
            >
              <span aria-hidden="true" />
              <span>{translate(locale, statusKey)}</span>
              <ChevronDown aria-hidden="true" />
            </button>
          ) : (
            <span className="asset-library__scan-status" data-status="idle">
              <span aria-hidden="true" />
              {translate(locale, statusKey)}
            </span>
          )}
        </div>

        <div className="asset-library__query-controls">
          <label className="asset-library__sort">
            <span className="visually-hidden">
              {translate(locale, "assets.sort.label")}
            </span>
            <select
              aria-label={translate(locale, "assets.sort.label")}
              value={assetSort}
              onChange={(event) => {
                setAssetSort(event.target.value as AssetSort);
                setAssetPageNumber(1);
              }}
            >
              <option value="modified_desc">
                {translate(locale, "assets.sort.modifiedDesc")}
              </option>
              <option value="modified_asc">
                {translate(locale, "assets.sort.modifiedAsc")}
              </option>
              <option value="path_asc">
                {translate(locale, "assets.sort.pathAsc")}
              </option>
              <option value="path_desc">
                {translate(locale, "assets.sort.pathDesc")}
              </option>
              <option value="size_desc">
                {translate(locale, "assets.sort.sizeDesc")}
              </option>
              <option value="size_asc">
                {translate(locale, "assets.sort.sizeAsc")}
              </option>
            </select>
          </label>

          <label className="asset-library__availability">
            <span className="visually-hidden">
              {translate(locale, "assets.availability.label")}
            </span>
            <select
              aria-label={translate(locale, "assets.availability.label")}
              value={availabilityFilter ?? "all"}
              onChange={(event) => {
                setAvailabilityFilter(
                  event.target.value === "all"
                    ? null
                    : (event.target.value as AssetAvailability)
                );
                setAssetPageNumber(1);
              }}
            >
              <option value="all">
                {translate(locale, "assets.availability.all")}
              </option>
              <option value="present">
                {translate(locale, "assets.availability.present")}
              </option>
              <option value="missing">
                {translate(locale, "assets.availability.missing")}
              </option>
            </select>
          </label>
        </div>
      </header>

      <div className="asset-library__quickbar">
        <div
          aria-label={translate(locale, "assets.filter.label")}
          className="asset-library__kind-filters"
          role="group"
        >
          {kindFilters.map((filter) => (
            <button
              aria-pressed={kindFilter === filter.value}
              key={filter.value ?? "all"}
              type="button"
              onClick={() => {
                setKindFilter(filter.value);
                setAssetPageNumber(1);
              }}
            >
              {translate(locale, filter.label)}
            </button>
          ))}
        </div>
        <span aria-live="polite" className="asset-library__total">
          {translate(locale, "assets.total").replace(
            "{count}",
            String(assetPage.total_items)
          )}
        </span>
      </div>

      {requestError || (scanDetailsVisible && task) ? (
        <div className="asset-library__overlay-stack">
          {requestError ? (
            <RequestErrorMessage
              error={requestError}
              locale={locale}
              onRetry={retryRequest}
            />
          ) : null}
          {scanDetailsVisible && task ? (
            <div className="asset-library__scan-details">
              <TaskDetails locale={locale} task={task} />
              {issues.length > 0 ? (
                <ScanIssues issues={issues} locale={locale} task={task} />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="asset-library__body">
        <nav
          aria-label={translate(locale, "assets.category.label")}
          className="asset-library__categories"
        >
          {rootFilters.map(({ icon: Icon, label, value }) => (
            <button
              aria-current={rootFilter === value ? "page" : undefined}
              key={value ?? "all"}
              type="button"
              onClick={() => {
                setRootFilter(value);
                setAssetPageNumber(1);
              }}
            >
              <Icon aria-hidden="true" />
              <span>{translate(locale, label)}</span>
              {rootFilter === value ? <small>{assetPage.total_items}</small> : null}
            </button>
          ))}
        </nav>

        <section
          aria-label={translate(locale, "assets.collection")}
          className="asset-library__collection"
        >
          <AssetCollection
            assetPage={assetPage}
            error={assetRequestError}
            loadState={assetLoadState}
            locale={locale}
            selectedEnvironmentId={selectedEnvironmentId}
            thumbnailApi={thumbnailApi}
            onNext={() =>
              setAssetPageNumber((current) =>
                Math.min(current + 1, assetPage.total_pages || 1)
              )
            }
            onPrevious={() =>
              setAssetPageNumber((current) => Math.max(1, current - 1))
            }
            onRetry={() => setAssetQueryRevision((current) => current + 1)}
          />
        </section>
      </div>
    </section>
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

function ScanIssues({
  issues,
  locale,
  task
}: {
  issues: AssetScanIssue[];
  locale: Locale;
  task: AssetScanTask;
}) {
  return (
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
              String(task.issue_count || issues.length)
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
  );
}

function AssetCollection({
  assetPage,
  error,
  loadState,
  locale,
  onNext,
  onPrevious,
  onRetry,
  selectedEnvironmentId,
  thumbnailApi
}: {
  assetPage: AssetPage;
  error: string | null;
  loadState: AssetLoadState;
  locale: Locale;
  onNext(): void;
  onPrevious(): void;
  onRetry(): void;
  selectedEnvironmentId: string;
  thumbnailApi: AssetThumbnailApi;
}) {
  if (!selectedEnvironmentId) {
    return (
      <div className="asset-library__empty">
        <FolderSearch aria-hidden="true" />
        <strong>{translate(locale, "assets.status.chooseEnvironment")}</strong>
        <span>{translate(locale, "assets.status.chooseEnvironmentHelp")}</span>
      </div>
    );
  }

  if (loadState === "loading") {
    return (
      <div
        aria-label={translate(locale, "assets.collection.loading")}
        className="asset-library__grid"
        role="status"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <div className="asset-card asset-card--loading" key={index}>
            <span />
            <span />
          </div>
        ))}
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="asset-library__empty" role="alert">
        <AlertTriangle aria-hidden="true" />
        <strong>{translate(locale, "assets.collection.error")}</strong>
        {error ? <span title={error}>{error}</span> : null}
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

  if (assetPage.items.length === 0) {
    return (
      <div className="asset-library__empty">
        <Folder aria-hidden="true" />
        <strong>{translate(locale, "assets.collection.empty")}</strong>
        <span>{translate(locale, "assets.collection.emptyHelp")}</span>
      </div>
    );
  }

  return (
    <>
      <div className="asset-library__grid" role="list">
        {assetPage.items.map((asset) => (
          <AssetCard
            asset={asset}
            key={asset.id}
            locale={locale}
            thumbnailApi={thumbnailApi}
          />
        ))}
      </div>
      {assetPage.total_pages > 1 ? (
        <nav
          aria-label={translate(locale, "assets.pagination.label")}
          className="asset-library__pagination"
        >
          <button
            aria-label={translate(locale, "assets.pagination.previous")}
            disabled={assetPage.page <= 1}
            type="button"
            onClick={onPrevious}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <span>
            {translate(locale, "assets.pagination.summary")
              .replace("{page}", String(assetPage.page))
              .replace("{pages}", String(assetPage.total_pages))}
          </span>
          <button
            aria-label={translate(locale, "assets.pagination.next")}
            disabled={assetPage.page >= assetPage.total_pages}
            type="button"
            onClick={onNext}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </>
  );
}

function AssetCard({
  asset,
  locale,
  thumbnailApi
}: {
  asset: AssetListItem;
  locale: Locale;
  thumbnailApi: AssetThumbnailApi;
}) {
  const Icon =
    asset.kind === "image"
      ? FileImage
      : asset.kind === "video"
        ? Video
        : asset.kind === "audio"
          ? Music2
          : asset.kind === "workflow"
            ? FileJson
            : Box;

  return (
    <article
      className="asset-card"
      data-availability={asset.availability}
      role="listitem"
    >
      <div className="asset-card__preview">
        <AssetThumbnail
          api={thumbnailApi}
          asset={asset}
          fallback={
            <>
              <Icon aria-hidden="true" />
              <span>
                {translate(locale, assetKindLabelKey(asset.kind))}
              </span>
            </>
          }
        />
      </div>
      <div className="asset-card__body">
        <strong title={asset.name}>{asset.name}</strong>
        <span title={asset.directory}>
          {formatBytes(asset.size_bytes)} ·{" "}
          {translate(locale, rootKindLabelKey(asset.root_kind))}
        </span>
      </div>
      {asset.availability === "missing" ? (
        <small>{translate(locale, "assets.availability.missing")}</small>
      ) : null}
    </article>
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

function createEmptyAssetPage(): AssetPage {
  return {
    items: [],
    page: 1,
    page_size: ASSET_PAGE_SIZE,
    total_items: 0,
    total_pages: 0
  };
}

function assetKindLabelKey(kind: AssetKind): MessageKey {
  const keys: Record<AssetKind, MessageKey> = {
    audio: "assets.filter.audio",
    image: "assets.filter.images",
    model: "assets.filter.models",
    video: "assets.filter.videos",
    workflow: "assets.filter.workflows"
  };
  return keys[kind];
}

function rootKindLabelKey(rootKind: AssetRootKind): MessageKey {
  return `assets.category.${rootKind}` as MessageKey;
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
