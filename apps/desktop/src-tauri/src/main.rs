#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            credential_read,
            credential_write,
            credential_remove
        ])
        .run(tauri::generate_context!())
        .expect("could not start Rillday");
}
