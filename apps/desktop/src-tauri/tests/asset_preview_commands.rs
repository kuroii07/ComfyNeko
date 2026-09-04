#[test]
fn invalid_preview_id_maps_to_stable_error() {
    let error =
        comfyneko_core::commands::asset_preview_commands::parse_preview_id_for_test("not-a-uuid");
    assert_eq!(error.code, "INVALID_ID");
    assert!(!error.retryable);
}
