pub mod commands;
pub mod workspace;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            workspace::workspace_request,
            workspace::workspace_webview,
            commands::detect_agent,
            commands::detect_all_agents,
            commands::detect_desktop_apps,
            commands::check_files_exist,
            commands::run_command,
            commands::run_agent_command,
            commands::launch_agent_terminal,
            commands::open_desktop_app,
            commands::save_api_key,
            commands::delete_api_key,
            commands::api_key_status,
            commands::list_api_models,
            commands::validate_api_key,
            commands::run_api_prompt,
            commands::launch_kimi_web,
            commands::set_keep_awake,
            commands::get_system_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
