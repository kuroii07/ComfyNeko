use std::{
    io::{Read, Write},
    net::{Ipv4Addr, SocketAddr, TcpStream},
    time::Duration,
};

use serde_json::Value;

use crate::domain::{
    diagnostic::{Diagnostic, Severity},
    environment::ApiBinding,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiProbe {
    pub reachable: bool,
    pub comfy_version: Option<String>,
}

pub fn probe_api(binding: &ApiBinding, timeout: Duration) -> Result<ApiProbe, Diagnostic> {
    if binding.host != "127.0.0.1" {
        return Err(blocking(
            "API_HOST_NOT_ALLOWED",
            format!("仅允许探测本机 API：{}", binding.host),
        ));
    }

    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, binding.port));
    let mut stream = TcpStream::connect_timeout(&address, timeout).map_err(|_| {
        warning(
            "API_UNREACHABLE",
            format!("本机 ComfyUI API 未响应：127.0.0.1:{}", binding.port),
        )
    })?;

    stream.set_read_timeout(Some(timeout)).map_err(|_| {
        warning(
            "API_UNREACHABLE",
            format!("无法设置本机 API 读取超时：127.0.0.1:{}", binding.port),
        )
    })?;
    stream.set_write_timeout(Some(timeout)).map_err(|_| {
        warning(
            "API_UNREACHABLE",
            format!("无法设置本机 API 写入超时：127.0.0.1:{}", binding.port),
        )
    })?;

    stream
        .write_all(b"GET /system_stats HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .map_err(|_| {
            warning(
                "API_UNREACHABLE",
                format!("无法请求本机 ComfyUI API：127.0.0.1:{}", binding.port),
            )
        })?;

    let mut response = Vec::new();
    stream.read_to_end(&mut response).map_err(|_| {
        warning(
            "API_UNREACHABLE",
            format!(
                "读取本机 ComfyUI API 响应超时或失败：127.0.0.1:{}",
                binding.port
            ),
        )
    })?;

    let body = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|offset| &response[offset + 4..])
        .unwrap_or_default();

    let comfy_version = serde_json::from_slice::<Value>(body)
        .ok()
        .and_then(|json| version_from_response(&json));

    Ok(ApiProbe {
        reachable: true,
        comfy_version,
    })
}

fn version_from_response(value: &Value) -> Option<String> {
    ["comfyui_version", "version"]
        .iter()
        .find_map(|field| value.get(field).and_then(Value::as_str).map(str::to_owned))
}

fn blocking(code: &str, message: impl Into<String>) -> Diagnostic {
    Diagnostic {
        code: code.to_owned(),
        message: message.into(),
        severity: Severity::Blocking,
        evidence: None,
    }
}

fn warning(code: &str, message: impl Into<String>) -> Diagnostic {
    Diagnostic {
        code: code.to_owned(),
        message: message.into(),
        severity: Severity::Warning,
        evidence: None,
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use crate::{
        domain::{diagnostic::Severity, environment::ApiBinding},
        services::api_probe::probe_api,
    };

    #[test]
    fn probe_rejects_a_non_loopback_api_host() {
        let result = probe_api(
            &ApiBinding {
                host: "192.168.1.20".to_owned(),
                port: 8188,
            },
            Duration::from_millis(20),
        );

        let diagnostic = result.unwrap_err();
        assert_eq!(diagnostic.code, "API_HOST_NOT_ALLOWED");
        assert_eq!(diagnostic.severity, Severity::Blocking);
    }

    #[test]
    fn probe_reports_an_unreachable_loopback_api_as_a_warning() {
        let result = probe_api(
            &ApiBinding {
                host: "127.0.0.1".to_owned(),
                port: 0,
            },
            Duration::from_millis(20),
        );

        let diagnostic = result.unwrap_err();
        assert_eq!(diagnostic.code, "API_UNREACHABLE");
        assert_eq!(diagnostic.severity, Severity::Warning);
    }
}
