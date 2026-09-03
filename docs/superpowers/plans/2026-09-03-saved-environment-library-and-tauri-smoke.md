# Saved Environment Library and Tauri Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display persisted ComfyUI environment profiles in the desktop UI, allow selecting a profile for review, refresh the list after a successful save, and prove persistence through a real Tauri restart.

**Architecture:** Add an `EnvironmentManager` container above the existing wizard. It owns only list loading, selection, retry, and refresh state; the wizard continues to own the editable profile and probe/save request state. The existing `EnvironmentApi` remains the only frontend boundary, while the Rust command service and SQLite repository remain unchanged.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tauri 2, Rust, SQLite.

**Spec:** `docs/03-环境绑定与安全设计.md`

## Global Constraints

- Keep all ComfyUI, Python, model, input, output, workflow, and custom-node paths read-only.
- Persist profiles only through the existing `save_environment` Tauri command.
- Load profiles only through the existing `list_environments` Tauri command.
- Do not add delete, move, rename-on-disk, scanner, shell, or unrestricted filesystem capabilities.
- All visible copy must exist in both `zh-CN` and `en-US`.
- Empty, loading, error, selected, and saved states must remain distinguishable without color alone.
- Keep the existing `feat/environment-profile` branch and linked worktree.

---

### Task 1: Add the Saved Environment Manager

**Files:**
- Create: `apps/desktop/src/features/environments/EnvironmentManager.tsx`
- Create: `apps/desktop/src/features/environments/EnvironmentManager.test.tsx`
- Modify: `apps/desktop/src/features/environments/EnvironmentWizard.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/i18n/translate.ts`
- Modify: `apps/desktop/src/styles/index.css`

**Interfaces:**
- Consumes: `EnvironmentApi.listEnvironments()`, `EnvironmentWizard`, `EnvironmentProfile`, and `Locale`.
- Produces:

```ts
export function EnvironmentManager(props: {
  api?: EnvironmentApi;
  locale?: Locale;
}): JSX.Element;
```

- Extends:

```ts
type EnvironmentWizardProps = {
  onSaved?(profile: EnvironmentProfile): void | Promise<void>;
};
```

- [ ] **Step 1: Write failing loading, list, selection, empty, and retry tests**

Create `EnvironmentManager.test.tsx`:

```tsx
it("loads persisted environments and opens the selected profile", async () => {
  const api = createEnvironmentApi({
    listEnvironments: vi.fn().mockResolvedValue([
      readyProfile,
      { ...readyProfile, id: "second", name: "家里环境", comfy_root: "E:\\ComfyUI" }
    ])
  });

  render(<EnvironmentManager api={api} />);

  expect(screen.getByText("正在加载环境档案…")).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: /家里环境/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /家里环境/ }));

  expect(screen.getByRole("textbox", { name: "环境名称" })).toHaveValue("家里环境");
  expect(screen.getByRole("textbox", { name: "ComfyUI 根目录" })).toHaveValue(
    "E:\\ComfyUI"
  );
});

it("shows an honest empty state when no profile is stored", async () => {
  const api = createEnvironmentApi({
    listEnvironments: vi.fn().mockResolvedValue([])
  });

  render(<EnvironmentManager api={api} />);

  expect(await screen.findByText("暂无已保存环境")).toBeInTheDocument();
});

it("recovers from a list failure through the retry action", async () => {
  const listEnvironments = vi
    .fn()
    .mockRejectedValueOnce(new Error("database unavailable"))
    .mockResolvedValueOnce([readyProfile]);
  const api = createEnvironmentApi({ listEnvironments });

  render(<EnvironmentManager api={api} />);

  expect(await screen.findByRole("alert")).toHaveTextContent("环境档案加载失败");
  fireEvent.click(screen.getByRole("button", { name: "重试" }));

  expect(await screen.findByRole("button", { name: /公司环境/ })).toBeInTheDocument();
});
```

The test helper must return a complete `EnvironmentApi`; default probe/save functions return `clearProbe`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm.cmd --dir apps/desktop test EnvironmentManager.test.tsx
```

Expected: FAIL because `EnvironmentManager` does not exist.

- [ ] **Step 3: Implement list loading and selection**

`EnvironmentManager` must:

1. call `listEnvironments()` in an effect;
2. render loading text during the request;
3. render an empty state after an empty successful response;
4. render an alert containing the returned error text and a retry button after failure;
5. render each profile as a real button containing its name and root path;
6. mark the active button with `aria-pressed="true"`;
7. key the wizard by the selected profile ID so selection replaces its editable state;
8. render an empty wizard when no profile exists.

- [ ] **Step 4: Refresh the list after save**

Add `onSaved` to `EnvironmentWizard`. After `api.saveEnvironment(profile)` succeeds:

```ts
setProbe(result);
setRequestState("saved");
await onSaved?.(profile);
```

In `EnvironmentManager`, pass a callback that reloads the profiles and preserves the saved profile ID as selected.

- [ ] **Step 5: Replace the direct wizard in `App`**

Use:

```tsx
<EnvironmentManager locale={locale} />
```

Do not change the command bar targets; the manager must still contain `environment-wizard-start` and `environment-diagnostics`.

- [ ] **Step 6: Add locale keys and compact library styles**

Add exact keys:

```ts
| "environment.library.count"
| "environment.library.empty"
| "environment.library.error"
| "environment.library.loading"
| "environment.library.retry"
| "environment.library.title"
```

Chinese:

```ts
"environment.library.count": "个环境",
"environment.library.empty": "暂无已保存环境",
"environment.library.error": "环境档案加载失败",
"environment.library.loading": "正在加载环境档案…",
"environment.library.retry": "重试",
"environment.library.title": "已保存环境"
```

English:

```ts
"environment.library.count": "environments",
"environment.library.empty": "No saved environments",
"environment.library.error": "Failed to load environments",
"environment.library.loading": "Loading environment profiles…",
"environment.library.retry": "Retry",
"environment.library.title": "Saved environments"
```

Style the library as a solid panel with horizontally wrapping profile buttons at desktop widths and a one-column list below 520px. Long paths must use `overflow-wrap: anywhere`.

- [ ] **Step 7: Run frontend verification**

Run:

```powershell
pnpm.cmd --dir apps/desktop test
pnpm.cmd --dir apps/desktop build
git diff --check
```

Expected: all frontend tests pass, build exits `0`, and no whitespace errors exist.

- [ ] **Step 8: Commit the saved-library checkpoint**

```powershell
git add apps/desktop/src README.md docs/DEVELOPMENT_LOG.md docs/superpowers/plans/2026-09-03-saved-environment-library-and-tauri-smoke.md
git commit -m "feat(env): show saved environment profiles"
git push origin feat/environment-profile
```

---

### Task 2: Prove Persistence in the Real Tauri Window

**Files:**
- Modify: `docs/DEVELOPMENT_LOG.md`
- Modify: `docs/superpowers/plans/2026-09-03-environment-foundation.md`
- Modify: `docs/superpowers/plans/2026-09-03-saved-environment-library-and-tauri-smoke.md`
- Modify: `README.md`
- Create ignored evidence under: `outputs/tauri-smoke/environment-profile/`

**Interfaces:**
- Consumes: the real `probe_environment`, `save_environment`, and `list_environments` commands plus the app-local SQLite file.
- Produces: a recorded real-window save/restart/readback result without changing any bound ComfyUI files.

- [ ] **Step 1: Verify candidate environment paths without modifying them**

Use `Test-Path` for the selected ComfyUI root and Python executable. Before starting the app, record a recursive file count, directory count, and latest write timestamp for the bound root.

- [ ] **Step 2: Start the real Tauri development window**

Run:

```powershell
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
pnpm.cmd --dir apps/desktop exec tauri dev
```

Wait for the ComfyNeko window and confirm the process remains running.

- [ ] **Step 3: Save a valid profile through the UI**

In the real window:

1. enter a unique environment name;
2. enter the verified ComfyUI root;
3. enter the verified Python executable;
4. leave API empty unless a local ComfyUI API is already running;
5. advance to Review and save;
6. run the environment check;
7. confirm no blocking diagnostic;
8. save the profile;
9. confirm the profile appears in “已保存环境”.

- [ ] **Step 4: Restart and verify readback**

Close the Tauri app, start it again with the same command, and confirm the saved profile appears without re-entering its fields. Record the database path and screenshot evidence, but do not copy the database into Git.

- [ ] **Step 5: Prove the bound root stayed unchanged**

Repeat the same recursive count and latest-write checks from Step 1. The before and after values must match. If they do not, stop and report the changed paths before any further action.

- [ ] **Step 6: Run the complete project gate**

Run:

```powershell
pnpm.cmd --dir apps/desktop test
pnpm.cmd --dir apps/desktop build
$env:Path="$env:USERPROFILE\.cargo\bin;$env:Path"
cargo fmt --check
cargo clippy -p comfyneko-core --all-targets -- -D warnings
cargo test -p comfyneko-core
git diff --check
```

Expected: frontend and Rust checks pass; only the opt-in live environment test remains ignored when its environment variables are absent.

- [ ] **Step 7: Update milestone records and push**

Mark the manual smoke steps complete only with real-window evidence. Update README and the development log with the selected paths, database readback result, before/after root snapshot comparison, verification counts, and any automation limitation.

```powershell
git add README.md docs/DEVELOPMENT_LOG.md docs/superpowers/plans
git commit -m "docs(env): verify Tauri environment persistence"
git push origin feat/environment-profile
```

## Plan Self-Review

- Spec coverage: multi-profile display, selection, post-save refresh, error recovery, persistence, and read-only verification are covered.
- Placeholder scan: all component names, locale keys, commands, test expectations, and verification commands are explicit.
- Type consistency: `EnvironmentManager`, `EnvironmentApi`, `EnvironmentProfile`, `onSaved`, and the three existing Tauri commands retain identical names across tasks.
