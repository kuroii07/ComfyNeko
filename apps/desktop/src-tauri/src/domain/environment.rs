use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApiBinding {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnvironmentRoots {
    #[serde(default)]
    pub models: Vec<PathBuf>,
    #[serde(default)]
    pub input: Vec<PathBuf>,
    #[serde(default)]
    pub output: Vec<PathBuf>,
    #[serde(default)]
    pub workflows: Vec<PathBuf>,
    #[serde(default)]
    pub custom_nodes: Vec<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnvironmentProfile {
    pub id: Uuid,
    pub name: String,
    pub comfy_root: PathBuf,
    pub python_executable: Option<PathBuf>,
    pub api: Option<ApiBinding>,
    #[serde(default)]
    pub roots: EnvironmentRoots,
    pub last_validated_at: Option<DateTime<Utc>>,
}

impl EnvironmentProfile {
    pub fn new(name: impl Into<String>, comfy_root: PathBuf) -> Self {
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            comfy_root,
            python_executable: None,
            api: None,
            roots: EnvironmentRoots::default(),
            last_validated_at: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::EnvironmentProfile;

    #[test]
    fn profile_round_trips_without_losing_windows_paths() {
        let profile = EnvironmentProfile::new("主力 ComfyUI", PathBuf::from(r"H:\\ComfyUI"));

        let encoded = serde_json::to_string(&profile).unwrap();
        let decoded: EnvironmentProfile = serde_json::from_str(&encoded).unwrap();

        assert_eq!(decoded.comfy_root, PathBuf::from(r"H:\\ComfyUI"));
    }
}
