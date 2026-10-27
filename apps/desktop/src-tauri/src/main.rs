#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod data_directory;

#[tauri::command]
fn data_directory_info(directory: tauri::State<data_directory::DataDirectory>) -> String {
    directory.path.to_string_lossy().into_owned()
}

#[tauri::command]
async fn data_directory_choose(title: String) -> Option<String> {
    rfd::AsyncFileDialog::new()
        .set_title(title)
        .pick_folder()
        .await
        .map(|folder| folder.path().to_string_lossy().into_owned())
}

#[tauri::command]
async fn data_directory_use(
    app: tauri::AppHandle,
    directory: tauri::State<'_, data_directory::DataDirectory>,
    path: String,
) -> Result<(), String> {
    directory
        .select(std::path::Path::new(&path))
        .map_err(|error| error.to_string())?;
    app.request_restart();
    Ok(())
}

fn credential(app: &tauri::AppHandle, key: &str) -> Result<keyring::Entry, String> {
    if key.len() != 64 || !key.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("invalid_credential_key".into());
    }
    keyring::Entry::new(&format!("{}.sessions", app.config().identifier), key)
        .map_err(|_| "credential_store_unavailable".into())
}

#[tauri::command]
fn credential_read(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    match credential(&app, &key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("credential_store_unavailable".into()),
    }
}

#[tauri::command]
fn credential_write(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    if value.is_empty() || value.len() > 4096 {
        return Err("invalid_credential".into());
    }
    credential(&app, &key)?
        .set_password(&value)
        .map_err(|_| "credential_store_unavailable".into())
}

#[tauri::command]
fn credential_remove(app: tauri::AppHandle, key: String) -> Result<(), String> {
    match credential(&app, &key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("credential_store_unavailable".into()),
    }
}

fn main() {
    let mut context = tauri::generate_context!();
    let directory = std::env::current_exe()
        .and_then(|exe| data_directory::DataDirectory::load(&exe, &context.config().identifier));
    let directory = match directory {
        Ok(directory) => directory,
        Err(error) => {
            rfd::MessageDialog::new()
                .set_title("Rillday")
                .set_level(rfd::MessageLevel::Error)
                .set_description(format!("Could not open the Rillday data folder. Your existing data has not been replaced. Restore access to the configured folder and open Rillday again.\n\n{error}"))
                .show();
            return;
        }
    };
    context.config_mut().app.app_directories_override = Some(
        tauri::utils::config::AppDirectoriesOverride::Root(directory.path.clone()),
    );
    tauri::Builder::default()
        .manage(directory)
        .invoke_handler(tauri::generate_handler![
            credential_read,
            credential_write,
            credential_remove,
            data_directory_info,
            data_directory_choose,
            data_directory_use
        ])
        .run(context)
        .expect("could not start Rillday");
}
