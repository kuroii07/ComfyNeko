use std::path::PathBuf;

use comfyneko_core::{
    commands::{EnvironmentCommandError, EnvironmentCommandService},
    domain::{
        diagnostic::{Diagnostic, Severity},
        environment::EnvironmentProfile,
    },
    repositories::environment_repository::EnvironmentRepository,
};

#[tokio::test]
async fn command_refuses_a_blocking_profile_without_replacing_a_saved_environment() {
    let repository = EnvironmentRepository::connect_in_memory().await.unwrap();
    let commands = EnvironmentCommandService::new(repository);
    let valid_profile = EnvironmentProfile::new("主力环境", PathBuf::from(r"H:\\ComfyUI"));
    commands
        .save_environment(&valid_profile, &[])
        .await
        .unwrap();

    let invalid_profile = EnvironmentProfile::new("失效环境", PathBuf::from(r"H:\\Missing"));
    let diagnostics = [Diagnostic {
        code: "COMFY_ROOT_NOT_FOUND".to_owned(),
        message: "未找到 ComfyUI 根目录".to_owned(),
        severity: Severity::Blocking,
        evidence: None,
    }];

    let error = commands
        .save_environment(&invalid_profile, &diagnostics)
        .await
        .unwrap_err();

    assert_eq!(error, EnvironmentCommandError::BlockingDiagnostics);
    assert_eq!(
        commands.list_environments().await.unwrap(),
        vec![valid_profile]
    );
}
