use crate::data_directory::DataDirectory;
use tauri::Manager;

#[cfg(not(windows))]
pub async fn activate(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.state::<DataDirectory>()
        .select(std::path::Path::new(&path))
        .map_err(|error| error.to_string())?;
    app.request_restart();
    Ok(())
}

#[cfg(windows)]
pub async fn activate(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use webview2_com::{
        BrowserProcessExitedEventHandler,
        Microsoft::Web::WebView2::Win32::ICoreWebView2Environment5,
    };
    use windows_core::Interface;

    let window = app
        .get_webview_window("main")
        .ok_or("The application window is unavailable")?;
    let (sender, mut receiver) = tauri::async_runtime::channel(1);
    window
        .with_webview(move |webview| {
            let result = (|| -> Result<(), String> {
                let environment = webview
                    .environment()
                    .cast::<ICoreWebView2Environment5>()
                    .map_err(|error| error.to_string())?;
                let restarting = app.clone();
                let exited = BrowserProcessExitedEventHandler::create(Box::new(move |_, _| {
                    restarting.request_restart();
                    Ok(())
                }));
                let mut token = 0;
                unsafe { environment.add_BrowserProcessExited(&exited, &mut token) }
                    .map_err(|error| error.to_string())?;

                let selected = app
                    .state::<DataDirectory>()
                    .select(std::path::Path::new(&path))
                    .map_err(|error| error.to_string());
                let result = selected.and_then(|()| {
                    // Closing the window alone does not release WebView2's shared profile.
                    unsafe { webview.controller().Close() }.map_err(|error| error.to_string())
                });
                if result.is_err() {
                    let _ = unsafe { environment.remove_BrowserProcessExited(token) };
                }
                result
            })();
            let _ = sender.try_send(result);
        })
        .map_err(|error| error.to_string())?;
    receiver
        .recv()
        .await
        .ok_or("Could not prepare the application restart")?
}
