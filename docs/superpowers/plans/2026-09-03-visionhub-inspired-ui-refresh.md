# VisionHub-Inspired Desktop UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the ComfyNeko environment-binding screen into a polished VisionHub-inspired Windows desktop workspace while preserving all current Tauri, SQLite, validation, theme, locale, and safety behavior.

**Architecture:** Keep `AppShell` responsible for viewport, navigation, theme, locale, and sidebar state. Add a reusable page command bar in `App.tsx`, then split the environment wizard presentation into focused step, form, status, and action components while leaving profile state and Tauri API calls in `EnvironmentWizard`. Centralize all visual decisions in the existing token and global stylesheet files, with CSS-only purposeful motion and reduced-motion fallbacks.

**Tech Stack:** React 19, TypeScript, Vite 5, Vitest, Testing Library, Lucide React, Tauri 2, Rust, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-09-03-visionhub-inspired-ui-refresh-design.md`

## Global Constraints

- Preserve the existing `EnvironmentApi`, Tauri commands, SQLite repository, environment validation, and read-only safety behavior.
- Do not introduce a new UI framework, CSS-in-JS layer, animation library, image generator asset, fake environment data, or unavailable navigation action.
- Keep ComfyNeko brand assets and a purple-blue accent: Light `#6574E8`, Dark `#AAB4FF`.
- Buttons and cards must use solid, outlined, or lightly tinted surfaces; do not add decorative `linear-gradient` or `radial-gradient`.
- All new visible copy must be added to the `zh-CN` and `en-US` dictionaries with `en-US` fallback.
- All colors, shadows, radii, sizes, and motion durations must come from CSS custom properties.
- Keep Hover, Focus, Active, Selected, Disabled, Loading, Success, Warning, Error, Empty, and Read-only states distinguishable by more than color alone.
- `prefers-reduced-motion: reduce` must disable transform, scale, and looping motion.
- Verify 240px, 320px, 420px, and 1366px without horizontal overflow.
- Keep the existing feature branch and worktree; do not merge to `main` or create a release during this plan.

---

### Task 1: Establish the VisionHub-Inspired Shell and Page Command Bar

**Files:**
- Modify: `apps/desktop/src/shell/AppShell.tsx`
- Modify: `apps/desktop/src/shell/AppShell.test.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.test.tsx`
- Modify: `apps/desktop/src/i18n/translate.ts`
- Modify: `apps/desktop/src/styles/tokens.css`
- Modify: `apps/desktop/src/styles/index.css`

**Interfaces:**
- Consumes: existing `AppPreferences`, `Tooltip`, `translate(locale, key)`, and `EnvironmentWizard`.
- Produces: `AppShell` with `data-sidebar-collapsed`, `.app-shell__brand-copy`, `.app-shell__footer`, and stable `#environment-workspace` content target.
- Produces: page command bar with `#environment-command-bar`, `#environment-wizard-start`, and `#environment-diagnostics` navigation targets.

- [x] **Step 1: Write failing shell and command-bar tests**

Add to `apps/desktop/src/shell/AppShell.test.tsx`:

```tsx
it("keeps product identity and footer controls in the expanded desktop shell", () => {
  render(
    <AppShell
      initialPreferences={{
        locale: "zh-CN",
        sidebarCollapsed: false,
        theme: "light"
      }}
    >
      <p>内容</p>
    </AppShell>
  );

  expect(screen.getByText("ComfyNeko")).toBeInTheDocument();
  expect(screen.getByText("ComfyUI 资产中枢")).toBeInTheDocument();
  expect(screen.getByTestId("sidebar-footer")).toContainElement(
    screen.getByRole("combobox", { name: "外观主题" })
  );
});
```

Replace the `App.test.tsx` first-screen assertion with:

```tsx
it("renders the environment command bar with real safety context", () => {
  render(<App />);

  const commandBar = screen.getByTestId("environment-command-bar");
  expect(commandBar).toHaveTextContent("ENVIRONMENT CONTROL");
  expect(commandBar).toHaveTextContent("本地优先");
  expect(commandBar).toHaveTextContent("只读预检");
  expect(screen.getByRole("button", { name: "开始配置" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "查看诊断" })).toBeInTheDocument();
});
```

- [x] **Step 2: Run focused tests and verify RED**

Run:

```powershell
pnpm.cmd --dir apps/desktop test AppShell.test.tsx App.test.tsx
```

Expected: FAIL because `ComfyUI 资产中枢`, `sidebar-footer`, command-bar status copy, and command buttons do not exist.

- [x] **Step 3: Add exact locale keys for the shell and command bar**

Extend `MessageKey` and both message dictionaries in `apps/desktop/src/i18n/translate.ts` with:

```ts
| "app.subtitle"
| "environment.command.eyebrow"
| "environment.command.localFirst"
| "environment.command.readOnly"
| "environment.command.apiOptional"
| "environment.command.start"
| "environment.command.diagnostics"
```

Use these exact values:

```ts
"zh-CN": {
  "app.subtitle": "ComfyUI 资产中枢",
  "environment.command.eyebrow": "ENVIRONMENT CONTROL",
  "environment.command.localFirst": "本地优先",
  "environment.command.readOnly": "只读预检",
  "environment.command.apiOptional": "API 可选",
  "environment.command.start": "开始配置",
  "environment.command.diagnostics": "查看诊断"
},
"en-US": {
  "app.subtitle": "ComfyUI asset hub",
  "environment.command.eyebrow": "ENVIRONMENT CONTROL",
  "environment.command.localFirst": "Local first",
  "environment.command.readOnly": "Read-only checks",
  "environment.command.apiOptional": "Optional API",
  "environment.command.start": "Start setup",
  "environment.command.diagnostics": "View diagnostics"
}
```

- [x] **Step 4: Implement the shell hierarchy and command bar**

Update the `AppShell` brand block to:

```tsx
<div className="app-shell__brand">
  <span aria-hidden="true" className="app-shell__brand-mark">
    <img alt="" className="app-shell__brand-icon-light" src="/icon-light.png" />
    <img alt="" className="app-shell__brand-icon-dark" src="/icon-dark.png" />
  </span>
  {collapsed ? null : (
    <span className="app-shell__brand-copy">
      <strong>{translate(locale, "app.title")}</strong>
      <small>{translate(locale, "app.subtitle")}</small>
    </span>
  )}
</div>
```

Move the theme, language, and collapse controls into:

```tsx
<div className="app-shell__footer" data-testid="sidebar-footer">
  <div className="app-shell__preferences">{/* existing selects */}</div>
  <Tooltip label={collapsedLabel}>
    <button className="app-shell__collapse" aria-label={collapsedLabel} type="button">
      {/* existing icon and toggle handler */}
    </button>
  </Tooltip>
</div>
```

In `App.tsx`, replace the plain `.page-guidance` header with:

```tsx
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
    <button type="button" onClick={() => focusTarget("environment-wizard-start")}>
      {translate(locale, "environment.command.start")}
    </button>
    <button type="button" onClick={() => focusTarget("environment-diagnostics")}>
      {translate(locale, "environment.command.diagnostics")}
    </button>
  </div>
</header>
```

Add this file-local helper:

```ts
function focusTarget(id: string) {
  const target = document.getElementById(id);
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
  target?.focus({ preventScroll: true });
}
```

- [x] **Step 5: Replace the base shell tokens and shell layout**

In `tokens.css`, define these exact shared values:

```css
:root {
  --space-7: 2.5rem;
  --radius-panel: 1.25rem;
  --radius-control: 0.75rem;
  --shadow-panel: 0 1rem 2.75rem rgb(56 68 96 / 0.09);
  --shadow-hover: 0 1.1rem 3rem rgb(56 68 96 / 0.13);
  --sidebar-expanded: 12.25rem;
  --sidebar-collapsed: 4.25rem;
  --motion-fast: 160ms;
  --motion-base: 220ms;
  --motion-slow: 280ms;
}

:root[data-theme="light"] {
  --color-app: #f2f5f9;
  --color-panel: #ffffff;
  --color-panel-subtle: #f7f9fc;
  --color-elevated: #ffffff;
  --color-hover: #f1f4ff;
  --color-selected: #e8ecff;
  --color-text: #172033;
  --color-text-muted: #667086;
  --color-border: #dde3ec;
  --color-border-strong: #cbd4e2;
  --color-accent: #6574e8;
  --color-accent-hover: #5665d8;
  --color-accent-soft: #eef0ff;
}

:root[data-theme="dark"] {
  --color-app: #111621;
  --color-panel: #181f2c;
  --color-panel-subtle: #1e2635;
  --color-elevated: #222b3b;
  --color-hover: #29344a;
  --color-selected: #303c60;
  --color-text: #f4f6fb;
  --color-text-muted: #aeb9cc;
  --color-border: #334057;
  --color-border-strong: #46546e;
  --color-accent: #aab4ff;
  --color-accent-hover: #c4caff;
  --color-accent-soft: #30385e;
}
```

In `index.css`:

- set `.app-shell` to `height: 100dvh; overflow: hidden; transition: grid-template-columns var(--motion-base) ease;`;
- set `.app-shell__sidebar` to `height: 100dvh; overflow: hidden; padding: var(--space-4) var(--space-3);`;
- set `.app-shell__content` to `overflow: auto;`;
- style navigation rows at `min-height: 2.75rem`, `border-radius: var(--radius-control)`;
- style `.environment-command-bar` as a sticky three-column panel with `border-radius: var(--radius-panel)`, solid panel background, and no gradient;
- preserve the existing mobile sidebar collapse behavior.

- [x] **Step 6: Run focused and full frontend checks**

Run:

```powershell
pnpm.cmd --dir apps/desktop test AppShell.test.tsx App.test.tsx
pnpm.cmd --dir apps/desktop test
pnpm.cmd --dir apps/desktop build
```

Expected: all tests PASS and Vite build exits `0`.

- [x] **Step 7: Commit the shell checkpoint**

```powershell
git add apps/desktop/src/shell/AppShell.tsx apps/desktop/src/shell/AppShell.test.tsx apps/desktop/src/App.tsx apps/desktop/src/App.test.tsx apps/desktop/src/i18n/translate.ts apps/desktop/src/styles/tokens.css apps/desktop/src/styles/index.css
git commit -m "feat(ui): rebuild the ComfyNeko desktop shell"
```

---

### Task 2: Split the Environment Wizard into Stable Workspace Components

**Files:**
- Create: `apps/desktop/src/features/environments/environmentWizardTypes.ts`
- Create: `apps/desktop/src/features/environments/environmentTestFixtures.ts`
- Create: `apps/desktop/src/features/environments/EnvironmentWorkspace.tsx`
- Create: `apps/desktop/src/features/environments/EnvironmentStepRail.tsx`
- Create: `apps/desktop/src/features/environments/EnvironmentStatusRail.tsx`
- Create: `apps/desktop/src/features/environments/EnvironmentActionBar.tsx`
- Modify: `apps/desktop/src/features/environments/EnvironmentWizard.tsx`
- Modify: `apps/desktop/src/features/environments/EnvironmentWizard.test.tsx`
- Modify: `apps/desktop/src/i18n/translate.ts`

**Interfaces:**
- Consumes: `EnvironmentProfile`, `ProbeResult`, `Locale`, existing wizard step and request states.
- Produces:

```ts
export type WizardStep = 1 | 2 | 3 | 4;
export type RequestState = "idle" | "probing" | "saving" | "saved" | "error";

export function EnvironmentStepRail(props: {
  currentStep: WizardStep;
  locale: Locale;
}): JSX.Element;

export function EnvironmentStatusRail(props: {
  locale: Locale;
  profile: EnvironmentProfile;
  probe: ProbeResult | null;
  requestState: RequestState;
}): JSX.Element;

export function EnvironmentActionBar(props: {
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
}): JSX.Element;
```

- [x] **Step 1: Write failing workspace structure and step-state tests**

Add to `EnvironmentWizard.test.tsx`:

```tsx
it("renders a desktop workspace with a dedicated status rail", () => {
  render(<EnvironmentWizard initialProfile={readyProfile} />);

  expect(screen.getByTestId("environment-workspace")).toBeInTheDocument();
  expect(screen.getByTestId("environment-form-panel")).toBeInTheDocument();
  expect(screen.getByTestId("environment-status-rail")).toBeInTheDocument();
});

it("marks the active and completed steps without relying only on color", () => {
  render(<EnvironmentWizard initialProfile={readyProfile} initialStep={3} />);

  expect(screen.getByText("目录映射").closest("li")).toHaveAttribute(
    "aria-current",
    "step"
  );
  expect(screen.getByText("基础信息").closest("li")).toHaveAttribute(
    "data-state",
    "complete"
  );
  expect(screen.getByText("检查并保存").closest("li")).toHaveAttribute(
    "data-state",
    "upcoming"
  );
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm.cmd --dir apps/desktop test EnvironmentWizard.test.tsx
```

Expected: FAIL because the test IDs and `data-state` step attributes do not exist.

- [x] **Step 3: Create shared wizard types and test fixtures**

Create `environmentWizardTypes.ts`:

```ts
export type WizardStep = 1 | 2 | 3 | 4;
export type RequestState = "idle" | "probing" | "saving" | "saved" | "error";
```

Create `environmentTestFixtures.ts` and move the reusable literal fixtures
there:

```ts
import type { EnvironmentProfile, ProbeResult } from "./environmentApi";

export const readyProfile: EnvironmentProfile = {
  id: "6e6e8b4f-2f56-4ab6-98a6-8fefc82d61bd",
  name: "公司环境",
  comfy_root: "D:\\ComfyUI",
  python_executable: "D:\\ComfyUI\\.venv\\Scripts\\python.exe",
  api: { host: "127.0.0.1", port: 8188 },
  roots: {
    models: [],
    input: [],
    output: [],
    workflows: [],
    custom_nodes: []
  },
  last_validated_at: null
};

export const clearProbe: ProbeResult = {
  normalized_comfy_root: "D:\\ComfyUI",
  diagnostics: [],
  python: null,
  api: null
};

export const blockingProbe: ProbeResult = {
  normalized_comfy_root: null,
  diagnostics: [
    {
      code: "PYTHON_NOT_FOUND",
      message: "未找到 Python 解释器",
      severity: "blocking"
    }
  ],
  python: null,
  api: null
};
```

Import these fixtures from every wizard test added in Tasks 2–4 so
`clearProbe` remains a shared test value rather than an undeclared
task-local constant.

- [x] **Step 4: Use the shared wizard UI types**

Import the shared types into `EnvironmentWizard.tsx`:

```ts
import type { RequestState, WizardStep } from "./environmentWizardTypes";
```

Keep profile state, probe state, request state, `runProbe`, and `saveEnvironment` in this file.

- [x] **Step 5: Implement `EnvironmentStepRail`**

Create `EnvironmentStepRail.tsx`:

```tsx
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
          step < currentStep ? "complete" : step === currentStep ? "current" : "upcoming";
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
```

- [x] **Step 6: Implement `EnvironmentWorkspace` and form-panel boundary**

Create `EnvironmentWorkspace.tsx`:

```tsx
import type { ReactNode } from "react";

export function EnvironmentWorkspace({
  form,
  status
}: {
  form: ReactNode;
  status: ReactNode;
}) {
  return (
    <section
      className="environment-workspace"
      data-testid="environment-workspace"
      id="environment-workspace"
    >
      <div className="environment-form-panel" data-testid="environment-form-panel">
        {form}
      </div>
      {status}
    </section>
  );
}
```

Refactor `EnvironmentWizard` to render:

```tsx
<EnvironmentWorkspace
  form={
    <>
      <EnvironmentStepRail currentStep={step} locale={locale} />
      <div className="wizard-panel" key={step}>
        {renderCurrentStep()}
      </div>
      <EnvironmentActionBar {...actionProps} />
    </>
  }
  status={
    <EnvironmentStatusRail
      locale={locale}
      probe={probe}
      profile={profile}
      requestState={requestState}
    />
  }
/>
```

Add `id="environment-wizard-start"` and `tabIndex={-1}` to the form panel’s first focus target container.

- [x] **Step 7: Add exact status-rail locale keys**

Add to both dictionaries:

```ts
| "environment.status.eyebrow"
| "environment.status.title"
| "environment.status.readOnly"
| "environment.status.profile"
| "environment.status.python"
| "environment.status.api"
| "environment.status.pending"
| "environment.status.ready"
| "environment.status.blocked"
```

Chinese values:

```ts
"environment.status.eyebrow": "ENVIRONMENT STATUS",
"environment.status.title": "环境状态",
"environment.status.readOnly": "预检只读取路径、解释器和本机 API，不修改 ComfyUI。",
"environment.status.profile": "档案完整度",
"environment.status.python": "Python",
"environment.status.api": "本机 API",
"environment.status.pending": "待检查",
"environment.status.ready": "可以保存",
"environment.status.blocked": "存在阻塞项"
```

English values:

```ts
"environment.status.eyebrow": "ENVIRONMENT STATUS",
"environment.status.title": "Environment status",
"environment.status.readOnly": "Checks only read paths, the interpreter, and the local API.",
"environment.status.profile": "Profile readiness",
"environment.status.python": "Python",
"environment.status.api": "Local API",
"environment.status.pending": "Not checked",
"environment.status.ready": "Ready to save",
"environment.status.blocked": "Blocking issues"
```

- [x] **Step 8: Implement `EnvironmentStatusRail`**

Create `EnvironmentStatusRail.tsx` with:

```tsx
const hasBlocking =
  probe?.diagnostics.some((item) => item.severity === "blocking") ?? false;
const status = !probe ? "pending" : hasBlocking ? "blocked" : "ready";
const completeness = [
  profile.name.trim(),
  profile.comfy_root.trim(),
  profile.python_executable?.trim()
].filter(Boolean).length;
```

Render:

- eyebrow and title;
- a `role="status"` readiness pill with `data-state={status}`;
- three real summary cards: `${completeness}/3`, Python probe state, API state;
- the read-only note;
- `<DiagnosticList locale={locale} probe={probe} />`;
- `id="environment-diagnostics"`, `tabIndex={-1}`, and `data-testid="environment-status-rail"`.

- [x] **Step 9: Implement `EnvironmentActionBar`**

Create `EnvironmentActionBar.tsx` and move all Back/Next/Probe/Save buttons out of `EnvironmentWizard`. Keep exact current button labels and behavior. Use:

```tsx
<footer className="environment-action-bar">
  <button className="button-secondary" disabled={step === 1 || busy} onClick={onBack}>
    {translate(locale, "common.back")}
  </button>
  <div>
    {step === 4 ? (
      <>
        <button className="button-secondary" disabled={busy} onClick={onProbe}>
          {requestState === "probing"
            ? translate(locale, "environment.probing")
            : translate(locale, "environment.probe")}
        </button>
        <button disabled={!canSave || busy} onClick={onSave}>
          {requestState === "saving"
            ? translate(locale, "environment.saving")
            : translate(locale, "environment.save")}
        </button>
      </>
    ) : (
      <button disabled={!canAdvance || busy} onClick={onNext}>
        {translate(locale, "common.next")}
      </button>
    )}
  </div>
</footer>
```

Pass `canAdvance={step !== 1 || canContinueFromBasics}` from
`EnvironmentWizard`, so Step 1 keeps its existing name/root validation while
Steps 2 and 3 can advance unless a request is busy.

- [x] **Step 10: Run focused and full tests**

Run:

```powershell
pnpm.cmd --dir apps/desktop test EnvironmentWizard.test.tsx
pnpm.cmd --dir apps/desktop test
pnpm.cmd --dir apps/desktop build
```

Expected: all tests PASS; no TypeScript errors.

- [x] **Step 11: Commit the component-structure checkpoint**

```powershell
git add apps/desktop/src/features/environments apps/desktop/src/i18n/translate.ts
git commit -m "refactor(ui): split the environment workspace presentation"
```

---

### Task 3: Add Purposeful Motion and Complete Interactive States

**Files:**
- Modify: `apps/desktop/src/features/environments/EnvironmentWizard.tsx`
- Modify: `apps/desktop/src/features/environments/EnvironmentWizard.test.tsx`
- Modify: `apps/desktop/src/components/Tooltip.tsx`
- Modify: `apps/desktop/src/components/Tooltip.test.tsx`
- Modify: `apps/desktop/src/styles/index.css`

**Interfaces:**
- Consumes: `WizardStep`, `RequestState`, `Tooltip`.
- Produces: stable `data-step`, `data-request-state`, and `data-motion` attributes for CSS-driven motion.
- Produces: Tooltip content that remains available on mouse hover and keyboard focus.

- [x] **Step 1: Write failing loading and motion-state tests**

Add to `EnvironmentWizard.test.tsx`:

```tsx
it("locks duplicate actions while a probe is pending", async () => {
  let resolveProbe!: (value: ProbeResult) => void;
  const pendingProbe = new Promise<ProbeResult>((resolve) => {
    resolveProbe = resolve;
  });
  const api = {
    listEnvironments: vi.fn().mockResolvedValue([]),
    probeEnvironment: vi.fn().mockReturnValue(pendingProbe),
    saveEnvironment: vi.fn()
  };

  render(
    <EnvironmentWizard
      api={api}
      initialProfile={readyProfile}
      initialStep={4}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "检查环境" }));

  expect(screen.getByRole("button", { name: "检查中…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "保存环境" })).toBeDisabled();

  resolveProbe(clearProbe);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存环境" })).toBeEnabled()
  );
});

it("exposes the current step and request state for reduced-motion-safe styling", () => {
  render(<EnvironmentWizard initialProfile={readyProfile} initialStep={2} />);

  expect(screen.getByTestId("environment-workspace")).toHaveAttribute(
    "data-step",
    "2"
  );
  expect(screen.getByTestId("environment-workspace")).toHaveAttribute(
    "data-request-state",
    "idle"
  );
});
```

- [x] **Step 2: Run focused tests and verify RED**

Run:

```powershell
pnpm.cmd --dir apps/desktop test EnvironmentWizard.test.tsx
```

Expected: the loading behavior may pass, but `data-step` and `data-request-state` must FAIL before implementation.

- [x] **Step 3: Add stable state attributes**

Pass `step` and `requestState` into `EnvironmentWorkspace` and render:

```tsx
<section
  className="environment-workspace"
  data-request-state={requestState}
  data-step={step}
  data-testid="environment-workspace"
  id="environment-workspace"
>
```

Add `key={step}` and `data-motion="step-enter"` to the current `.wizard-panel`.

- [x] **Step 4: Implement the exact motion rules**

Add to `index.css`:

```css
@keyframes workspace-enter {
  from { opacity: 0; transform: translateY(0.375rem); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes step-enter {
  from { opacity: 0; transform: translateX(0.375rem); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes status-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

.environment-command-bar,
.environment-workspace {
  animation: workspace-enter var(--motion-slow) ease both;
}

[data-motion="step-enter"] {
  animation: step-enter var(--motion-base) ease both;
}

.environment-workspace button,
.environment-command-bar button,
.app-shell__sidebar a,
.environment-status-card {
  transition:
    transform var(--motion-fast) ease,
    border-color var(--motion-fast) ease,
    background-color var(--motion-fast) ease,
    box-shadow var(--motion-fast) ease;
}

.environment-workspace button:hover:not(:disabled),
.environment-command-bar button:hover:not(:disabled),
.environment-status-card:hover {
  transform: translateY(-1px);
}

.environment-workspace button:active:not(:disabled),
.environment-command-bar button:active:not(:disabled) {
  transform: translateY(0);
}

[data-request-state="probing"] .environment-readiness-pill,
[data-request-state="saving"] .environment-readiness-pill {
  animation: status-pulse 1.1s ease-in-out infinite;
}
```

In the existing reduced-motion query, add:

```css
transform: none !important;
animation: none !important;
```

- [x] **Step 5: Keep Tooltip keyboard behavior intact**

Do not change its public interface. Add one regression assertion to `Tooltip.test.tsx`:

```tsx
expect(screen.getByRole("tooltip")).toBeVisible();
```

after focusing the child button. If motion-related CSS hides it or clips it, fix `.tooltip` and `.tooltip__content` without introducing a new dependency.

- [x] **Step 6: Run frontend verification**

Run:

```powershell
pnpm.cmd --dir apps/desktop test
pnpm.cmd --dir apps/desktop build
```

Expected: 0 failing tests and successful Vite build.

- [x] **Step 7: Commit the interaction checkpoint**

```powershell
git add apps/desktop/src/features/environments apps/desktop/src/components/Tooltip.tsx apps/desktop/src/components/Tooltip.test.tsx apps/desktop/src/styles/index.css
git commit -m "feat(ui): add purposeful desktop motion and states"
```

---

### Task 4: Complete Responsive Layout and Visual-State Coverage

**Files:**
- Modify: `apps/desktop/src/styles/index.css`
- Modify: `apps/desktop/src/styles/tokens.css`
- Modify: `apps/desktop/src/features/environments/EnvironmentStatusRail.tsx`
- Modify: `apps/desktop/src/features/environments/DiagnosticList.tsx`
- Modify: `apps/desktop/src/features/environments/EnvironmentWizard.test.tsx`

**Interfaces:**
- Consumes: the component class names and data attributes created in Tasks 1–3.
- Produces: responsive layouts for `>800`, `520–800`, `360–520`, `280–360`, and `<280` widths.
- Produces: diagnostic and readiness states with semantic icons and text.

- [x] **Step 1: Add failing semantic state tests**

Add:

```tsx
it("shows a non-color readiness label before and after validation", async () => {
  const api = {
    listEnvironments: vi.fn().mockResolvedValue([]),
    probeEnvironment: vi.fn().mockResolvedValue(clearProbe),
    saveEnvironment: vi.fn().mockResolvedValue(clearProbe)
  };

  render(
    <EnvironmentWizard
      api={api}
      initialProfile={readyProfile}
      initialStep={4}
    />
  );

  expect(screen.getByRole("status", { name: "环境保存状态" })).toHaveTextContent(
    "待检查"
  );
  fireEvent.click(screen.getByRole("button", { name: "检查环境" }));
  await waitFor(() =>
    expect(screen.getByRole("status", { name: "环境保存状态" })).toHaveTextContent(
      "可以保存"
    )
  );
});
```

Add the locale key `environment.status.aria` with Chinese `环境保存状态` and English `Environment save status`.

- [x] **Step 2: Run focused test and verify RED**

Run:

```powershell
pnpm.cmd --dir apps/desktop test EnvironmentWizard.test.tsx
```

Expected: FAIL because the readiness pill lacks the accessible name or exact copy.

- [x] **Step 3: Implement semantic readiness and diagnostic states**

In `EnvironmentStatusRail`:

```tsx
<p
  aria-label={translate(locale, "environment.status.aria")}
  className="environment-readiness-pill"
  data-state={status}
  role="status"
>
  {statusIcon}
  {translate(locale, `environment.status.${status}`)}
</p>
```

Use Lucide icons:

- `Clock3` for pending;
- `CircleCheck` for ready;
- `CircleAlert` for blocked.

In `DiagnosticList`, render `Info`, `TriangleAlert`, `CircleAlert`, or `CircleCheck` based on the semantic state; keep diagnostic code in a `<small>` element and message in the primary `<p>`.

- [x] **Step 4: Implement desktop and compact responsive rules**

Use these exact layout thresholds:

```css
.environment-page {
  max-width: 77.5rem;
  padding: var(--space-5);
}

.environment-workspace {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(17rem, 0.85fr);
  gap: var(--space-4);
}

@media (max-width: 50rem) {
  .app-shell,
  .app-shell[data-sidebar-collapsed="false"] {
    grid-template-columns: var(--sidebar-collapsed) minmax(0, 1fr);
  }

  .environment-command-bar {
    grid-template-columns: 1fr;
  }

  .environment-workspace {
    grid-template-columns: minmax(0, 1.6fr) minmax(14rem, 0.8fr);
  }
}

@media (max-width: 32.5rem) {
  .environment-workspace {
    grid-template-columns: 1fr;
  }

  .environment-status-rail {
    position: static;
  }

  .wizard-steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 22.5rem) {
  .environment-command-bar__actions,
  .environment-action-bar,
  .environment-action-bar > div {
    align-items: stretch;
    flex-direction: column;
  }
}

@media (max-width: 17.5rem) {
  .wizard-steps {
    grid-template-columns: 1fr;
  }
}
```

Every grid/flex child that contains paths or translated copy must have `min-width: 0`; every path value must use `overflow-wrap: anywhere`.

- [x] **Step 5: Run automated frontend checks**

Run:

```powershell
pnpm.cmd --dir apps/desktop test
pnpm.cmd --dir apps/desktop build
git diff --check
```

Expected: all checks PASS.

- [x] **Step 6: Commit the responsive checkpoint**

```powershell
git add apps/desktop/src/features/environments apps/desktop/src/i18n/translate.ts apps/desktop/src/styles/index.css apps/desktop/src/styles/tokens.css
git commit -m "fix(ui): harden environment workspace responsiveness"
```

---

### Task 5: Perform Browser Design QA and Iterate Until Passed

**Files:**
- Create: `design-qa.md`
- Create locally ignored screenshots under: `outputs/playwright/visionhub-refresh/`
- Modify as findings require:
  - `apps/desktop/src/styles/index.css`
  - `apps/desktop/src/styles/tokens.css`
  - `apps/desktop/src/shell/AppShell.tsx`
  - `apps/desktop/src/features/environments/*.tsx`
- Modify: `docs/DEVELOPMENT_LOG.md`

**Interfaces:**
- Consumes: the completed UI from Tasks 1–4 and the source reference screenshot.
- Produces: `design-qa.md` with `final result: passed`.
- Produces: a visual matrix proving layout, theme, locale, collapsed state, responsive behavior, and console cleanliness.

- [x] **Step 1: Start the local preview**

Run:

```powershell
pnpm.cmd --dir apps/desktop dev -- --host ::1 --port 5173 --strictPort
```

Keep the process running for the following Playwright checks.

- [x] **Step 2: Capture the reference and target states at matching desktop size**

Use Playwright CLI to open `http://[::1]:5173`, resize to `1366 900`, and capture:

```text
outputs/playwright/visionhub-refresh/light-zh-expanded-1366.png
outputs/playwright/visionhub-refresh/dark-en-collapsed-1366.png
```

Inspect each screenshot together with the user-provided VisionHub reference. Do not require identical business content; compare the shell proportions, hierarchy, panel rhythm, density, button style, and overall desktop product quality.

- [x] **Step 3: Capture compact states and prove no overflow**

Capture:

```text
outputs/playwright/visionhub-refresh/light-zh-420.png
outputs/playwright/visionhub-refresh/dark-en-320.png
outputs/playwright/visionhub-refresh/dark-en-240.png
```

At each width evaluate:

```js
() => ({
  clientWidth: document.documentElement.clientWidth,
  scrollWidth: document.documentElement.scrollWidth
})
```

Expected: `clientWidth === scrollWidth`.

- [x] **Step 4: Exercise primary interactive states**

Using fresh Playwright snapshots between actions:

1. hover a navigation item and a command-bar button;
2. focus the sidebar collapse button and confirm Tooltip visibility;
3. enter name and ComfyUI root, advance through the four steps;
4. confirm Save is disabled before validation;
5. use a mocked frontend API in component tests for Loading/Success/Error;
6. switch Light/Dark/System and zh-CN/en-US;
7. inspect browser console.

Expected: 0 console errors, stable panel size between steps, and no inaccessible icon-only controls.

- [x] **Step 5: Write the first `design-qa.md`**

Use this exact structure:

```markdown
# ComfyNeko VisionHub-Inspired UI Design QA

## Reference

- Source: user-provided Kuroii VisionHub desktop screenshot
- Target: ComfyNeko environment-binding workspace

## Compared States

- Light zh-CN expanded 1366x900
- Dark en-US collapsed 1366x900
- Light zh-CN 420px
- Dark en-US 320px
- Dark en-US 240px

## Findings

### P0

- None.

### P1

- Initial gate state: no P1 claim is made before screenshot review.

### P2

- Initial gate state: no P2 claim is made before screenshot review.

### P3

- Initial gate state: no P3 claim is made before screenshot review.

## Accessibility and Runtime

- Horizontal overflow: not yet evidenced; gate remains failed.
- Console errors: not yet evidenced; gate remains failed.
- Keyboard focus: not yet evidenced; gate remains failed.
- Reduced motion: not yet evidenced; gate remains failed.

## Score

- Theme completeness: 0/15
- Localization: 0/10
- Responsive layout: 0/10
- Component states: 0/15
- Icons and Tooltip: 0/10
- Accessibility: 0/10
- Brand consistency: 0/10
- Loading/Error/Empty: 0/10
- Visual regression and self-check: 0/10
- Total: 0/100

final result: failed
```

After the first screenshot review, replace every initial gate statement and
zero score with observed evidence. Use `None.` only for a severity level that
was explicitly checked and had no findings.

- [x] **Step 6: Fix all P0/P1/P2 findings**

For each finding:

1. state the root cause in `design-qa.md`;
2. make one focused CSS or component change;
3. rerun the relevant test;
4. recapture the affected state;
5. update the finding to resolved.

Do not loop on P3 polish. Leave P3 items in the follow-up section.

- [x] **Step 7: Require the QA gate**

The task may proceed only when:

```text
final result: passed
```

and score is at least `85/100`.

- [x] **Step 8: Update the development log**

Add a dated entry to `docs/DEVELOPMENT_LOG.md` containing:

- exact visual files changed;
- screenshot matrix paths;
- test/build commands and counts;
- QA score;
- resolved P0/P1/P2 issues;
- remaining P3 polish;
- explicit statement that environment validation and storage behavior were unchanged.

- [x] **Step 9: Commit the QA checkpoint**

```powershell
git add design-qa.md docs/DEVELOPMENT_LOG.md apps/desktop/src
git commit -m "docs(ui): record VisionHub-inspired visual QA"
```

---

### Task 6: Run the Full Project Gate and Push the Feature Branch

**Files:**
- Modify only if verification finds a defect:
  - `apps/desktop/src/**`
  - `apps/desktop/src-tauri/**`
  - `docs/DEVELOPMENT_LOG.md`

**Interfaces:**
- Consumes: all implementation and QA checkpoints.
- Produces: a clean, pushed `feat/environment-profile` branch with matching local and remote commit hashes.

- [x] **Step 1: Run the complete frontend gate**

```powershell
pnpm.cmd --dir apps/desktop test
pnpm.cmd --dir apps/desktop build
```

Expected: all Vitest files pass and Vite build exits `0`.

- [x] **Step 2: Run the complete Rust gate**

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
cargo fmt --check
cargo clippy -p comfyneko-core --all-targets -- -D warnings
cargo test -p comfyneko-core
```

Expected: format clean, Clippy 0 warnings, all non-ignored Rust tests pass.

- [x] **Step 3: Run repository checks**

```powershell
git diff --check
git status --short --branch
```

Expected: no whitespace errors and only intended UI/doc changes before the final commit.

- [x] **Step 4: Commit any verification-only correction**

Only if Step 1–3 required a correction:

```powershell
git add apps/desktop/src apps/desktop/src-tauri docs/DEVELOPMENT_LOG.md design-qa.md
git commit -m "fix(ui): resolve final desktop visual verification issues"
```

- [x] **Step 5: Push the feature branch**

```powershell
git push origin feat/environment-profile
```

- [x] **Step 6: Verify remote equality**

```powershell
$local = git rev-parse HEAD
$remote = (git ls-remote origin refs/heads/feat/environment-profile).Split("`t")[0]
if ($local -ne $remote) { throw "Local and remote commits differ" }
git status --short --branch
```

Expected: local and remote hashes match; worktree is clean and retained for further visual iteration.
