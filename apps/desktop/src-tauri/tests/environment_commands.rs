use std::{path::PathBuf, time::Duration};

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

#[tokio::test]
async fn command_revalidates_before_saving_instead_of_trusting_the_caller() {
    let repository = EnvironmentRepository::connect_in_memory().await.unwrap();
    let commands = EnvironmentCommandService::new(repository);
    let invalid_profile =
        EnvironmentProfile::new("不存在的环境", PathBuf::from(r"C:\\missing\\ComfyUI"));

    let error = commands
        .probe_and_save_environment(
            &invalid_profile,
            Duration::from_millis(20),
            Duration::from_millis(20),
        )
        .await
        .unwrap_err();

    assert_eq!(error, EnvironmentCommandError::BlockingDiagnostics);
    assert!(commands.list_environments().await.unwrap().is_empty());
}

#[tokio::test]
async fn command_service_reopens_saved_profiles_from_file() {
    let temp_dir = tempfile::tempdir().unwrap();
    let database_path = temp_dir.path().join("comfyneko.db");
    let company = EnvironmentProfile::new("公司环境", PathBuf::from(r"D:\\ComfyUI"));
    let home = EnvironmentProfile::new("家里环境", PathBuf::from(r"E:\\ComfyUI"));

    {
        let commands = EnvironmentCommandService::connect_file(&database_path)
            .await
            .unwrap();
        commands.save_environment(&company, &[]).await.unwrap();
        commands.save_environment(&home, &[]).await.unwrap();
    }

    let restarted = EnvironmentCommandService::connect_file(&database_path)
        .await
        .unwrap();

    assert_eq!(
        restarted.list_environments().await.unwrap(),
        vec![company, home]
    );
}
