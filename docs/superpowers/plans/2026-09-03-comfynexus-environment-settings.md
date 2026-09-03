# ComfyNexus-Inspired Environment Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a ComfyNexus-inspired ComfyNeko environment settings workspace with safe local drafts, accessible tabs, improved section layout, and purposeful motion, without mutating a real ComfyUI installation.

**Architecture:** Introduce a pure front-end draft domain for acceleration, model-category mappings, and environment variables. Split the existing monolithic environment screen into a page shell, accessible tabs, and four focused panels; keep existing profile probing, path selection, and Tauri save behavior behind the current `EnvironmentApi` and `PathActionApi` interfaces. CSS custom properties and existing global styles provide the responsive visual system and reduced-motion fallback.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Lucide React, CSS custom properties, Vite 5, Tauri 2, Rust.

**Spec:** `docs/superpowers/specs/2026-09-03-comfynexus-environment-settings-design.md`

## Global Constraints

- Preserve current `EnvironmentApi`, `PathActionApi`, Tauri commands, SQLite environment persistence, profile validation, path discovery, and only-read environment safety behavior.
- Treat the public ComfyNexus Apache-2.0 codebase only as a behavior and layout reference: do not copy its TSX, Tailwind class strings, i18n copy, components, icons, or assets; retain no ComfyNexus runtime dependency.
- Never write `extra_model_paths.yaml`, ComfyUI files, Python environments, launch scripts, process environment variables, or system environment variables in this milestone.
- New runtime facts must be sourced from an actual probe or rendered as an explicit pending state; no invented GPU, CUDA, package, API, or model data.
- All visible copy must be added to `zh-CN` and `en-US` before use; no hard-coded UI text.
- Use existing CSS custom properties for color, radius, shadow, spacing, and durations; no new UI library or animation dependency.
- Support Light, Dark, and Follow System; support `prefers-reduced-motion: reduce`; no decorative gradient backgrounds.
- Keep 240px, 320px, 420px, and 1366px free from horizontal page overflow.
- Every new behavior is test-first: record a focused failing Vitest test before production implementation, then re-run it green.
- Each completed implementation task updates `README.md`, `docs/DEVELOPMENT_LOG.md`, and `docs/05-路线图与验收标准.md`, then is committed and pushed only to `https://github.com/kuroii07/ComfyNeko.git` on `fix/visionhub-environment-ui`.

---

### Task 1: Create the Pure Safe-Draft Domain

**Files:**
- Create: `apps/desktop/src/features/environments/environmentSettingsDraft.ts`
- Create: `apps/desktop/src/features/environments/environmentSettingsDraft.test.ts`
- Modify: `apps/desktop/src/i18n/translate.ts`

**Interfaces:**
- Produces `EnvironmentSettingsDraft`, `AccelerationPreset`, `parseEnvironmentVariableDraft(source: string): VariableParseResult`, and `applyAccelerationPreset(preset: AccelerationPreset): AccelerationDraft`.
- Consumes no Tauri APIs, file-system APIs, or browser storage; all exported helpers are deterministic pure functions.
- `VariableParseResult` has `entries: Array<{ key: string; value: string; line: number }>` and `errors: Array<{ line: number; code: "missing-equals" | "empty-key" | "duplicate-key" }>`.

- [x] **Step 1: Write the failing draft-domain tests**

Create `environmentSettingsDraft.test.ts` with these tests:

```ts
it("maps the balanced preset without an external side effect", () => {
  expect(applyAccelerationPreset("balanced")).toMatchObject({
    memoryStrategy: "normal",
    attention: "auto",
    precision: "auto"
  });
});

it("reports malformed and duplicate variable lines with their original line numbers", () => {
  expect(parseEnvironmentVariableDraft("CUDA_VISIBLE_DEVICES=0\nBROKEN\n=bad\nCUDA_VISIBLE_DEVICES=1").errors).toEqual([
    { line: 2, code: "missing-equals" },
    { line: 3, code: "empty-key" },
    { line: 4, code: "duplicate-key" }
  ]);
});
```

- [x] **Step 2: Run the focused tests and verify RED**

Run: `pnpm.cmd --dir apps/desktop test environmentSettingsDraft.test.ts`

Expected: FAIL because `environmentSettingsDraft.ts` and its exports do not exist.

- [x] **Step 3: Implement the minimal pure draft functions**

Create the exported types and functions named in the Interfaces block. Parse lines using `source.split(/\r?\n/)`; ignore `trim() === ""` and lines whose trimmed value starts with `#`; use a `Set<string>` to detect a duplicate key; never call `invoke`, `fetch`, `localStorage`, or a path API.

- [x] **Step 4: Add locale keys for the new safe-draft UI**

Add equivalent `zh-CN` and `en-US` keys for `environment.draft.save`, `environment.draft.saved`, `environment.draft.pending`, `environment.draft.changePlan`, `environment.variables.error.missingEquals`, `environment.variables.error.emptyKey`, and `environment.variables.error.duplicateKey`.

- [x] **Step 5: Run the focused tests and type build green**

Run: `pnpm.cmd --dir apps/desktop test environmentSettingsDraft.test.ts`

Run: `pnpm.cmd --dir apps/desktop build`

Expected: PASS; TypeScript accepts the new domain and dictionaries.

- [ ] **Step 6: Record the verified sub-milestone and commit**

Update the three required project documents, then run `git diff --check`, commit with `feat(env): add safe settings draft domain`, and push the active feature branch to its verified HTTPS remote.

### Task 2: Establish the Environment Settings Shell and Accessible Tabs

**Files:**
- Create: `apps/desktop/src/features/environments/EnvironmentSettingsPage.tsx`
- Create: `apps/desktop/src/features/environments/EnvironmentSettingsTabs.tsx`
- Create: `apps/desktop/src/features/environments/EnvironmentSettingsPage.test.tsx`
- Modify: `apps/desktop/src/features/environments/EnvironmentWizard.tsx`
- Modify: `apps/desktop/src/styles/index.css`
- Modify: `apps/desktop/src/i18n/translate.ts`

**Interfaces:**
- `EnvironmentSettingsPage` receives `profile: EnvironmentProfile`, `probe: ProbeResult | null`, `onSave(): Promise<void>`, and the current draft state.
- `EnvironmentSettingsTabs` receives `activeTab: EnvironmentSettingsTab`, `onTabChange(tab: EnvironmentSettingsTab): void`, and renders an accessible `tablist`.
- `EnvironmentWizard` remains the owner of `profile`, probing, saving, discovery, and native-path actions; it passes callbacks and data into the page shell.

- [ ] **Step 1: Write failing structure and keyboard tests**

Create `EnvironmentSettingsPage.test.tsx` with:

```tsx
it("renders the sticky environment header and four keyboard-accessible tabs", () => {
  render(<EnvironmentSettingsPage {...readyProps} />);
  expect(screen.getByRole("heading", { name: "环境设置" })).toBeInTheDocument();
  expect(screen.getByRole("tablist", { name: "环境设置分区" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "通用设置" })).toHaveAttribute("aria-selected", "true");
});

it("moves the active tab right with ArrowRight", () => {
  render(<EnvironmentSettingsTabs activeTab="general" onTabChange={onTabChange} locale="zh-CN" />);
  fireEvent.keyDown(screen.getByRole("tab", { name: "通用设置" }), { key: "ArrowRight" });
  expect(onTabChange).toHaveBeenCalledWith("acceleration");
});
```

- [ ] **Step 2: Run the page tests and verify RED**

Run: `pnpm.cmd --dir apps/desktop test EnvironmentSettingsPage.test.tsx`

Expected: FAIL because the new page and tabs components do not exist.

- [ ] **Step 3: Implement the shell, tabs, and adapter wiring**

Render a semantic header with actual profile status, a `保存本地草案` secondary action, and four `button` tabs. Use roving focus: ArrowRight and ArrowLeft wrap, Home selects `general`, End selects `variables`, and Enter/Space activate the focused tab. Keep all existing `EnvironmentWizard` actions attached to their existing handlers.

- [ ] **Step 4: Add responsive, token-only shell CSS**

Add `.environment-settings-page`, `.environment-settings-page__header`, `.environment-settings-tabs`, and `.environment-settings-section` styles. Make the header sticky with `top: 0`; set the section grid to `minmax(210px, .85fr) minmax(0, 1.45fr)` above 900px and one column below 900px. Add `@media (prefers-reduced-motion: reduce)` overrides that remove transition duration and transforms.

- [ ] **Step 5: Run focused and existing wizard tests green**

Run: `pnpm.cmd --dir apps/desktop test EnvironmentSettingsPage.test.tsx EnvironmentWizard.test.tsx`

Expected: PASS; existing selection, discovery, probe, and save tests remain green.

- [ ] **Step 6: Record, commit, and push the shell milestone**

Update README, development log, and roadmap; run `git diff --check`; commit with `feat(env): add settings workspace shell`; push the verified branch.

### Task 3: Implement General and Model-Path Panels Without Breaking Existing Paths

**Files:**
- Create: `apps/desktop/src/features/environments/GeneralEnvironmentSettings.tsx`
- Create: `apps/desktop/src/features/environments/ModelPathSettings.tsx`
- Create: `apps/desktop/src/features/environments/GeneralEnvironmentSettings.test.tsx`
- Create: `apps/desktop/src/features/environments/ModelPathSettings.test.tsx`
- Modify: `apps/desktop/src/features/environments/EnvironmentWizard.tsx`
- Modify: `apps/desktop/src/styles/index.css`
- Modify: `apps/desktop/src/i18n/translate.ts`

**Interfaces:**
- `GeneralEnvironmentSettings` receives existing controlled values and the root/Python selection, open, discovery, and probe callbacks from `EnvironmentWizard`.
- `ModelPathSettings` receives `roots: EnvironmentRoots`, `onRootChange(root: RootKey, value: string): void`, and a controlled `ModelPathDraft` from `EnvironmentSettingsDraft`.
- Both panels render their section explanation in the left column and controlled inputs in the right configuration panel.

- [ ] **Step 1: Write failing behavior-preservation tests**

Add tests asserting that the general panel calls the root chooser from `选择路径 ComfyUI 根目录`, renders `等待环境检查` without a probe, and that the model panel preserves a manually entered `模型目录` after a later automatic discovery run. Add a test that selecting `Checkpoints` category updates only the controlled draft object and does not call `EnvironmentApi.saveEnvironment`.

- [ ] **Step 2: Run these panel tests and verify RED**

Run: `pnpm.cmd --dir apps/desktop test GeneralEnvironmentSettings.test.tsx ModelPathSettings.test.tsx`

Expected: FAIL because the panels do not yet render or receive the callbacks.

- [ ] **Step 3: Move current core-path controls into the general panel**

Move environment name, ComfyUI root, Python, API port, discovery feedback, probe button, and verified diagnostics into `GeneralEnvironmentSettings`. Reuse the current controlled input handlers and native chooser/open action labels exactly so existing tests continue to identify them. Render runtime package rows only from `probe` data; show the pending translation if `probe === null`.

- [ ] **Step 4: Move real roots and add controlled category mapping into the model panel**

Move `models`, `input`, `output`, `workflows`, and `custom_nodes` controls into `ModelPathSettings`. Add category selectors and path inputs for `checkpoints`, `loras`, `vae`, `textEncoders`, `controlNet`, `upscalers`, `unet`, and `clipVision`; map these only to `ModelPathDraft`, never to a file operation or environment save.

- [ ] **Step 5: Implement field-row visual states**

Style `.environment-settings-section__intro`, `.environment-settings-panel`, `.settings-field-row`, `.settings-field-row--readonly`, and `.settings-runtime-fact`. The status icon and text must distinguish pending, success, warning, error, and read-only states. Long Windows paths must use `min-width: 0`, overflow wrapping, and an accessible full-value input.

- [ ] **Step 6: Run behavior regression tests green**

Run: `pnpm.cmd --dir apps/desktop test GeneralEnvironmentSettings.test.tsx ModelPathSettings.test.tsx EnvironmentWizard.test.tsx`

Run: `pnpm.cmd --dir apps/desktop build`

Expected: PASS; no existing root-selection, path-opening, discovery, probe, or save behavior regresses.

- [ ] **Step 7: Record, commit, and push the general/model milestone**

Update README, development log, and roadmap; run `git diff --check`; commit with `feat(env): rebuild general and model path settings`; push the verified branch.

### Task 4: Implement Acceleration and Variables Panels With Safe Local Drafts

**Files:**
- Create: `apps/desktop/src/features/environments/AccelerationSettings.tsx`
- Create: `apps/desktop/src/features/environments/EnvironmentVariablesSettings.tsx`
- Create: `apps/desktop/src/features/environments/AccelerationSettings.test.tsx`
- Create: `apps/desktop/src/features/environments/EnvironmentVariablesSettings.test.tsx`
- Modify: `apps/desktop/src/features/environments/EnvironmentSettingsPage.tsx`
- Modify: `apps/desktop/src/features/environments/EnvironmentWizard.tsx`
- Modify: `apps/desktop/src/styles/index.css`
- Modify: `apps/desktop/src/i18n/translate.ts`

**Interfaces:**
- `AccelerationSettings` receives a controlled `AccelerationDraft`, `onChange(next: AccelerationDraft): void`, and `probe: ProbeResult | null`.
- `EnvironmentVariablesSettings` receives `value: string`, `onChange(value: string): void`, and a `VariableParseResult` from `parseEnvironmentVariableDraft`.
- Neither panel receives Tauri invoke functions, file operations, or `EnvironmentApi.saveEnvironment`.

- [ ] **Step 1: Write failing safe-draft component tests**

Create tests that choose `性能优先` and assert only the draft callback receives `{ attention: "flash", precision: "fp16" }`; assert `saveEnvironment` was never called. Add a variables-panel test that enters `BROKEN`, sees the message for `第 1 行缺少等号`, and sees a line-number gutter with `1`.

- [ ] **Step 2: Run the panel tests and verify RED**

Run: `pnpm.cmd --dir apps/desktop test AccelerationSettings.test.tsx EnvironmentVariablesSettings.test.tsx`

Expected: FAIL because the panels do not exist.

- [ ] **Step 3: Implement acceleration preset and override controls**

Render four preset buttons with `aria-pressed`, then controlled selects for memory strategy, attention, precision, preview, and log level. Display probe-derived runtime data or the pending state. Keep an always-visible `ChangePlan` notice explaining that this release only stores a local draft.

- [ ] **Step 4: Implement the line-numbered variables editor**

Render a non-editable gutter derived from `value.split(/\r?\n/)` and a controlled `<textarea aria-label={translate(locale, "environment.variables.input")}>`. Render parse errors below it using the parser result and an `aria-live="polite"` container. Do not disable the textarea and do not call any environment or system write API.

- [ ] **Step 5: Add purposeful panel motion and reduced-motion fallback**

Add a short `.environment-settings-panel--enter` opacity transition and a `.environment-preset` selected state. Motion uses `--motion-fast`/`--motion-base`, never exceeds `translateY(4px)`, and is neutralized by the existing reduced-motion media query.

- [ ] **Step 6: Run all environment tests and build green**

Run: `pnpm.cmd --dir apps/desktop test EnvironmentSettingsPage.test.tsx EnvironmentWizard.test.tsx environmentSettingsDraft.test.ts GeneralEnvironmentSettings.test.tsx ModelPathSettings.test.tsx AccelerationSettings.test.tsx EnvironmentVariablesSettings.test.tsx`

Run: `pnpm.cmd --dir apps/desktop build`

Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Record, commit, and push the safe advanced-settings milestone**

Update README, development log, and roadmap; run `git diff --check`; commit with `feat(env): add safe advanced settings drafts`; push the verified branch.

### Task 5: Conduct Desktop Visual, Accessibility, and Rust Regression Verification

**Files:**
- Modify: `docs/DEVELOPMENT_LOG.md`
- Modify: `docs/05-路线图与验收标准.md`
- Modify: `README.md`

**Interfaces:**
- Consumes the completed page and existing desktop theme/locale controls.
- Produces a documented manual visual matrix, UI score, known limits, and full verification evidence.

- [ ] **Step 1: Write the visual acceptance checklist into the development log before manual testing**

Add exact checklist rows for Light zh-CN 1366px, Dark en-US 1366px with collapsed sidebar, Light/Dark 420px, Dark en-US 320px, Dark en-US 240px, Tab/Arrow/Enter/Space navigation, pending/loading/error/success/read-only states, reduced motion, and console errors.

- [ ] **Step 2: Run front-end and Rust automated regression checks**

Run:

```powershell
pnpm.cmd --dir apps/desktop test
pnpm.cmd --dir apps/desktop build
cargo fmt --check
cargo clippy -p comfyneko-core --all-targets -- -D warnings
cargo test -p comfyneko-core
git diff --check
```

Expected: every command exits 0; any intentionally ignored real-environment smoke test is documented, not treated as a pass.

- [ ] **Step 3: Start the actual desktop application and capture the visual matrix**

Run: `pnpm.cmd --dir apps/desktop exec tauri dev`

Check the matrix from Step 1 with browser/devtools console error count 0. Record the exact pass/fail result and any remaining P3 refinements in the development log.

- [ ] **Step 4: Score and close the UI milestone**

Use the project visual baseline to score hierarchy, theme fidelity, i18n fit, responsiveness, states, keyboard access, motion restraint, safety clarity, and console cleanliness. Only mark the roadmap item complete at 85/100 or higher; otherwise record the blocking fixes as a new unchecked sub-milestone.

- [ ] **Step 5: Commit and push verified final documentation**

Update README with the completed environment-settings capability, then run `git diff --check`, commit with `docs(env): record settings UI verification`, and push the verified feature branch through its `kuroii07` HTTPS remote.

## Self-Review

- Spec coverage: Task 1 covers safe types, presets, and variable parsing; Task 2 covers header, tabs, responsive shell, motion, i18n, and keyboard navigation; Task 3 covers general settings, actual core paths, path preservation, probe facts, and model mappings; Task 4 covers acceleration and variable-editor UI; Task 5 covers all required themes, sizes, accessibility, Rust, build, and documented quality gate.
- Placeholder scan: no task depends on an unspecified function or undecided field. Every task names its files, interface, failing-test behavior, run command, and completion evidence.
- Type consistency: `EnvironmentSettingsDraft`, `AccelerationDraft`, `ModelPathDraft`, `EnvironmentSettingsTab`, and `VariableParseResult` originate in Task 1 and are consumed under the same names in Tasks 2–4.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-03-comfynexus-environment-settings.md`.

1. **Subagent-Driven (recommended)** — dispatch a fresh implementation agent per task and review between tasks.
2. **Inline Execution** — execute these tasks in this session with checkpoints after each verified milestone.
