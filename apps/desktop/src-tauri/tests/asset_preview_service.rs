use std::path::Path;

#[test]
fn preview_contract_uses_uuid_and_never_returns_source_path() {
    let source = Path::new(r"D:\ComfyUI\output\cat.png");
    let response = comfyneko_core::services::asset_preview_service::preview_response_for_test(
        "asset-uuid",
        source,
    );

    assert_eq!(response.asset_id, "asset-uuid");
    assert!(!response.url.contains("ComfyUI"));
    assert!(!response.url.contains("cat.png"));
}
