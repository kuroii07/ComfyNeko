# Environment Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-first environment profile system that safely binds, validates, stores, and revalidates one or more ComfyUI installations before asset scanning starts.

**Architecture:** Tauri 2 commands call a Rust domain layer. The domain layer normalizes Windows paths, probes the selected interpreter through a bounded child process, and stores profiles in SQLite. The React wizard renders diagnostics and cannot invoke scanner commands until a profile passes the blocking checks.

**Tech Stack:** Rust, Tauri 2, React, TypeScript, SQLite through SQLx, Vitest, Rust `tempfile` tests.

**Spec:** `docs/03-环境绑定与安全设计.md`

## Global Constraints

- Windows 10/11 only for the first release; use `std::path::PathBuf` and never parse paths with string splitting.
- Do not modify a bound ComfyUI directory during discovery, validation, or profile persistence.
- The only supported API target is loopback `127.0.0.1`; API failure is a warning unless the user explicitly requests live control.
- Do not log API tokens, complete prompt content, or private file contents.
- All diagnostics must contain a machine-readable code and a Chinese user-facing message.

---

### Task 1: Create the desktop workspace and environment domain types

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/src/domain/environment.rs`
- Create: `apps/desktop/src-tauri/src/domain/diagnostic.rs`
- Create: `apps/desktop/src-tauri/src/domain/mod.rs`
- Test: `apps/desktop/src-tauri/src/domain/environment.rs`

**Interfaces:**
- Produces `EnvironmentProfile`, `EnvironmentRoots`, `ApiBinding`, `Diagnostic`, and `Severity` for all later tasks.

- [ ] **Step 1: Write the failing Rust serialization test**

```rust
#[test]
fn profile_round_trips_without_losing_windows_paths() {
    let profile = EnvironmentProfile::new("主力 ComfyUI", PathBuf::from(r"H:\\ComfyUI"));
    let encoded = serde_json::to_string(&profile).unwrap();
    let decoded: EnvironmentProfile = serde_json::from_str(&encoded).unwrap();
    assert_eq!(decoded.comfy_root, PathBuf::from(r"H:\\ComfyUI"));
}
```

- [ ] **Step 2: Run the test and verify it fails before the type exists**

Run: `cargo test -p comfy-asset-hub-core profile_round_trips_without_losing_windows_paths`

- [ ] **Step 3: Implement the serializable types**

```rust
pub struct EnvironmentProfile {
    pub id: Uuid,
    pub name: String,
    pub comfy_root: PathBuf,
    pub python_executable: Option<PathBuf>,
    pub api: Option<ApiBinding>,
    pub roots: EnvironmentRoots,
}
```

- [ ] **Step 4: Run the focused test and format the crate**

Run: `cargo fmt --check && cargo test -p comfy-asset-hub-core profile_round_trips_without_losing_windows_paths`

- [ ] **Step 5: Stop at a review checkpoint**

Report created files and test result. Do not commit automatically.

### Task 2: Implement read-only path discovery and validation

**Files:**
- Create: `apps/desktop/src-tauri/src/services/environment_probe.rs`
- Create: `apps/desktop/src-tauri/src/services/path_guard.rs`
- Test: `apps/desktop/src-tauri/src/services/environment_probe.rs`

**Interfaces:**
- Consumes `EnvironmentProfile` and `Diagnostic` from Task 1.
- Produces `probe_environment(candidate: &EnvironmentProfile) -> ProbeResult`.

- [ ] **Step 1: Write failing tests for a valid fixture and a missing Python path**

```rust
#[test]
fn probe_marks_missing_python_as_blocking() {
    let fixture = test_profile_with_python(PathBuf::from(r"C:\\missing\\python.exe"));
    let result = probe_environment(&fixture);
    assert!(result.diagnostics.iter().any(|d| d.code == "PYTHON_NOT_FOUND"));
}
```

- [ ] **Step 2: Run the focused tests to confirm failure**

Run: `cargo test -p comfy-asset-hub-core probe_marks_missing_python_as_blocking`

- [ ] **Step 3: Implement normalized allow-listed path checks and root probes**

```rust
pub fn validate_allowed_root(path: &Path) -> Result<PathBuf, Diagnostic> {
    let normalized = dunce::canonicalize(path).map_err(Diagnostic::path_unreadable)?;
    if !normalized.is_dir() { return Err(Diagnostic::not_a_directory(path)); }
    Ok(normalized)
}
```

- [ ] **Step 4: Verify valid, missing, unreadable, and non-ComfyUI fixture cases**

Run: `cargo test -p comfy-asset-hub-core environment_probe -- --nocapture`

- [ ] **Step 5: Stop at a review checkpoint**

Report all diagnostic codes and test result. Do not commit automatically.

### Task 3: Add bounded Python and optional loopback API checks

**Files:**
- Create: `apps/desktop/src-tauri/src/services/python_probe.rs`
- Create: `apps/desktop/src-tauri/src/services/api_probe.rs`
- Modify: `apps/desktop/src-tauri/src/services/environment_probe.rs`
- Test: `apps/desktop/src-tauri/src/services/python_probe.rs`

**Interfaces:**
- Consumes the profile from Task 1 and path result from Task 2.
- Produces `PythonProbe { executable, version, import_status }` and optional `ApiProbe { reachable, comfy_version }`.

- [ ] **Step 1: Write a failing test for command timeout conversion**

```rust
#[test]
fn timed_out_python_probe_returns_python_timeout_diagnostic() {
    let result = map_child_timeout(Duration::from_secs(8));
    assert_eq!(result.code, "PYTHON_TIMEOUT");
}
```

- [ ] **Step 2: Run the test to confirm failure**

Run: `cargo test -p comfy-asset-hub-core timed_out_python_probe_returns_python_timeout_diagnostic`

- [ ] **Step 3: Implement bounded commands and loopback-only HTTP probing**

```rust
Command::new(python).args(["--version"]).kill_on_drop(true);
let url = format!("http://127.0.0.1:{port}/system_stats");
```

- [ ] **Step 4: Run focused tests and static checks**

Run: `cargo fmt --check && cargo clippy -p comfy-asset-hub-core -- -D warnings && cargo test -p comfy-asset-hub-core`

- [ ] **Step 5: Stop at a review checkpoint**

Confirm that unreachable API becomes a warning and no remote host is accepted. Do not commit automatically.

### Task 4: Persist profiles and build the onboarding wizard

**Files:**
- Create: `apps/desktop/src-tauri/src/repositories/environment_repository.rs`
- Create: `apps/desktop/src-tauri/migrations/0001_environments.sql`
- Create: `apps/desktop/src/features/environments/EnvironmentWizard.tsx`
- Create: `apps/desktop/src/features/environments/DiagnosticList.tsx`
- Create: `apps/desktop/src/features/environments/environmentApi.ts`
- Test: `apps/desktop/src/features/environments/EnvironmentWizard.test.tsx`

**Interfaces:**
- Consumes `ProbeResult` from Task 2/3 through Tauri commands.
- Produces a persisted `EnvironmentProfile` only after blocking diagnostics equal zero.

- [ ] **Step 1: Write the failing UI test for disabled confirmation**

```tsx
it("disables save while a blocking diagnostic exists", () => {
  render(<EnvironmentWizard initialProbe={blockingProbe} />);
  expect(screen.getByRole("button", { name: "保存环境" })).toBeDisabled();
});
```

- [ ] **Step 2: Run the UI test and confirm failure**

Run: `pnpm --dir apps/desktop test EnvironmentWizard.test.tsx`

- [ ] **Step 3: Implement migration, repository, Tauri command, and four-step wizard**

```tsx
const canSave = probe.diagnostics.every((item) => item.severity !== "blocking");
<Button disabled={!canSave} onClick={saveEnvironment}>保存环境</Button>
```

- [ ] **Step 4: Run UI, Rust, and build verification**

Run: `pnpm --dir apps/desktop test && pnpm --dir apps/desktop build && cargo test -p comfy-asset-hub-core`

- [ ] **Step 5: Perform a manual Windows smoke test**

Bind a valid ComfyUI path, an invalid Python path, and an offline API profile. Confirm no files under the bound ComfyUI root change. Record screenshots and test notes in `outputs/`.

- [ ] **Step 6: Stop at a review checkpoint**

Report the verification evidence and suggest a user-approved commit boundary. Do not commit automatically.

## Plan Self-Review

- Spec coverage: discovery, Python binding, directory mapping, optional API, safe persistence, blocking diagnostics, and read-only guarantees map to Tasks 1-4.
- Placeholder scan: no implementation placeholders remain; all new interfaces and commands are named in the producing task.
- Type consistency: `EnvironmentProfile`, `Diagnostic`, `ProbeResult`, `PythonProbe`, and `ApiProbe` retain the same names throughout the plan.
