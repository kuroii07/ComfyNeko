use std::path::PathBuf;

use comfyneko_core::{
    domain::{
        diagnostic::{Diagnostic, Severity},
        environment::EnvironmentProfile,
    },
    repositories::environment_repository::{EnvironmentRepository, SaveEnvironmentError},
};

#[tokio::test]
async fn does_not_persist_a_profile_with_blocking_diagnostics() {
    let repository = EnvironmentRepository::connect_in_memory().await.unwrap();
    let profile = EnvironmentProfile::new("阻塞环境", PathBuf::from(r"H:\\ComfyUI"));
    let diagnostics = [Diagnostic {
        code: "PYTHON_NOT_FOUND".to_owned(),
        message: "未找到 Python 解释器".to_owned(),
        severity: Severity::Blocking,
        evidence: None,
    }];

    let result = repository.save_if_valid(&profile, &diagnostics).await;

    assert_eq!(
        result.unwrap_err(),
        SaveEnvironmentError::BlockingDiagnostics
    );
    assert!(repository.list().await.unwrap().is_empty());
}

#[tokio::test]
async fn round_trips_a_valid_environment_profile() {
    let repository = EnvironmentRepository::connect_in_memory().await.unwrap();
    let mut profile = EnvironmentProfile::new("主力环境", PathBuf::from(r"H:\\ComfyUI"));
    profile.python_executable = Some(PathBuf::from(r"H:\\ComfyUI\\.venv\\Scripts\\python.exe"));

    repository.save_if_valid(&profile, &[]).await.unwrap();

    assert_eq!(repository.list().await.unwrap(), vec![profile]);
}
